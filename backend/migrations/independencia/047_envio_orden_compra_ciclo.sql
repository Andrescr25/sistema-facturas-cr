-- Copia revisada y decisión durable antes del transporte. No convierte
-- envíos globales anteriores ni inventa recepción física o existencias.
ALTER TABLE orden_compra_ciclo DROP CONSTRAINT orden_compra_ciclo_estado_check;
ALTER TABLE orden_compra_ciclo ADD CONSTRAINT orden_compra_ciclo_estado_check
  CHECK (estado IN ('borrador','pendiente_enviar','enviada','cerrada'));
ALTER TABLE orden_compra_ciclo ADD COLUMN envio_id UUID;
ALTER TABLE orden_compra_ciclo ADD COLUMN enviada_en TIMESTAMPTZ;

CREATE TABLE orden_compra_ciclo_envio (
  id UUID PRIMARY KEY,
  secuencia BIGSERIAL NOT NULL UNIQUE,
  orden_id INTEGER NOT NULL REFERENCES orden_compra_ciclo(id),
  version_orden INTEGER NOT NULL CHECK(version_orden>0),
  numero VARCHAR(11) NOT NULL CHECK(numero ~ '^506[0-9]{8}$'),
  mensaje VARCHAR(2000) NOT NULL CHECK(length(btrim(mensaje))>0),
  nombre_archivo VARCHAR(160) NOT NULL,
  pdf BYTEA NOT NULL CHECK(octet_length(pdf) BETWEEN 5 AND 5242880 AND substring(pdf FROM 1 FOR 5)=decode('255044462d','hex')),
  sha256 VARCHAR(64) NOT NULL CHECK(sha256=encode(sha256(pdf),'hex')),
  estado VARCHAR(16) NOT NULL DEFAULT 'revisado'
    CHECK(estado IN ('revisado','enviando','confirmado','incierto','no_enviado')),
  preparado_por INTEGER REFERENCES usuario(id),
  iniciado_por INTEGER REFERENCES usuario(id),
  confirmado_por INTEGER REFERENCES usuario(id),
  preparado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  iniciado_en TIMESTAMPTZ,
  confirmado_en TIMESTAMPTZ,
  confirmacion VARCHAR(16) CHECK(confirmacion IN ('transporte','manual')),
  via VARCHAR(16) CHECK(via IN ('interno','evolution')),
  motivo VARCHAR(1000),
  UNIQUE(orden_id,id),
  CHECK((estado='revisado' AND iniciado_en IS NULL) OR (estado<>'revisado' AND iniciado_en IS NOT NULL)),
  CHECK((estado='confirmado' AND confirmado_en IS NOT NULL AND confirmacion IS NOT NULL)
    OR (estado<>'confirmado' AND confirmado_en IS NULL AND confirmacion IS NULL)),
  CHECK(confirmacion IS DISTINCT FROM 'manual' OR (motivo IS NOT NULL AND length(btrim(motivo))>0))
);
CREATE UNIQUE INDEX orden_compra_un_envio_activo ON orden_compra_ciclo_envio(orden_id)
  WHERE estado IN ('enviando','incierto','confirmado');
ALTER TABLE orden_compra_ciclo ADD FOREIGN KEY(id,envio_id) REFERENCES orden_compra_ciclo_envio(orden_id,id);
ALTER TABLE orden_compra_ciclo ADD CHECK((estado='enviada' AND envio_id IS NOT NULL AND enviada_en IS NOT NULL)
  OR (estado<>'enviada' AND enviada_en IS NULL));

CREATE OR REPLACE FUNCTION proteger_orden_compra_ciclo() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE envio orden_compra_ciclo_envio%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'La orden conserva su historial'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.estado<>'borrador' OR NEW.envio_id IS NOT NULL THEN RAISE EXCEPTION 'La orden comienza como borrador'; END IF;
    IF NEW.ciclo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ciclo_ruta WHERE id=NEW.ciclo_id
      AND recorrido_fijado AND ruta_nombre=NEW.ruta_nombre AND semana=NEW.semana)
      THEN RAISE EXCEPTION 'La orden requiere el contexto fijo del ciclo'; END IF;
    RETURN NEW;
  END IF;
  IF ROW(OLD.proveedor_id,OLD.proveedor_nombre,OLD.proveedor_cedula,OLD.ciclo_id,OLD.ruta_nombre,
    OLD.semana,OLD.clave,OLD.solicitud,OLD.creado_en) IS DISTINCT FROM
    ROW(NEW.proveedor_id,NEW.proveedor_nombre,NEW.proveedor_cedula,NEW.ciclo_id,NEW.ruta_nombre,
    NEW.semana,NEW.clave,NEW.solicitud,NEW.creado_en)
    THEN RAISE EXCEPTION 'Proveedor, ciclo y solicitud originales no se reclasifican'; END IF;
  IF OLD.estado IN ('enviada','cerrada') OR NEW.version<>OLD.version+1
    THEN RAISE EXCEPTION 'La orden enviada/cerrada es inmutable o su revisión no es válida'; END IF;
  IF OLD.envio_id IS NOT NULL THEN
    SELECT * INTO envio FROM orden_compra_ciclo_envio WHERE id=OLD.envio_id;
    IF envio.estado<>'no_enviado' AND (NEW.envio_id IS DISTINCT FROM OLD.envio_id OR NEW.estado NOT IN ('pendiente_enviar','enviada'))
      THEN RAISE EXCEPTION 'El intento de envío bloquea la orden; verificá su resultado'; END IF;
  END IF;
  IF NEW.envio_id IS NOT NULL THEN
    SELECT * INTO envio FROM orden_compra_ciclo_envio WHERE id=NEW.envio_id AND orden_id=NEW.id;
    IF envio.estado IS NULL OR envio.estado NOT IN ('enviando','incierto','confirmado')
      THEN RAISE EXCEPTION 'La orden requiere un intento de envío válido'; END IF;
    IF OLD.envio_id IS NULL AND (OLD.estado<>'pendiente_enviar' OR envio.version_orden<>OLD.version)
      THEN RAISE EXCEPTION 'La copia revisada ya no corresponde a la orden'; END IF;
  END IF;
  IF NEW.estado='enviada' AND (OLD.estado<>'pendiente_enviar' OR envio.estado IS DISTINCT FROM 'confirmado'
    OR NEW.enviada_en IS DISTINCT FROM envio.confirmado_en)
    THEN RAISE EXCEPTION 'El envío requiere su confirmación registrada'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION proteger_envio_orden_compra() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE orden RECORD;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'La copia revisada conserva su historial'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO orden FROM orden_compra_ciclo WHERE id=NEW.orden_id FOR SHARE;
    IF orden.estado<>'pendiente_enviar' OR orden.envio_id IS NOT NULL OR orden.version<>NEW.version_orden OR NEW.estado<>'revisado'
      THEN RAISE EXCEPTION 'Prepará una copia de la revisión pendiente actual'; END IF;
    RETURN NEW;
  END IF;
  IF ROW(OLD.id,OLD.secuencia,OLD.orden_id,OLD.version_orden,OLD.numero,OLD.mensaje,OLD.nombre_archivo,
    OLD.pdf,OLD.sha256,OLD.preparado_por,OLD.preparado_en) IS DISTINCT FROM
    ROW(NEW.id,NEW.secuencia,NEW.orden_id,NEW.version_orden,NEW.numero,NEW.mensaje,NEW.nombre_archivo,
    NEW.pdf,NEW.sha256,NEW.preparado_por,NEW.preparado_en)
    THEN RAISE EXCEPTION 'PDF, número y mensaje revisados son inmutables'; END IF;
  IF NOT ((OLD.estado='revisado' AND NEW.estado='enviando')
    OR (OLD.estado='enviando' AND NEW.estado IN ('confirmado','incierto','no_enviado'))
    OR (OLD.estado='incierto' AND NEW.estado='confirmado' AND NEW.confirmacion='manual'))
    THEN RAISE EXCEPTION 'No se reintenta ni se reescribe un resultado de envío'; END IF;
  IF OLD.iniciado_en IS NOT NULL AND ROW(OLD.iniciado_en,OLD.iniciado_por) IS DISTINCT FROM ROW(NEW.iniciado_en,NEW.iniciado_por)
    THEN RAISE EXCEPTION 'El intento original se conserva'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orden_compra_envio_inmutable BEFORE INSERT OR UPDATE OR DELETE ON orden_compra_ciclo_envio
  FOR EACH ROW EXECUTE FUNCTION proteger_envio_orden_compra();
