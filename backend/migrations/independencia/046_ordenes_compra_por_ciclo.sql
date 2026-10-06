-- Primera parte de órdenes persistentes. No convierte borradores globales
-- anteriores ni supone envíos/recepciones que el sistema no puede acreditar.
CREATE TABLE orden_compra_ciclo (
  id SERIAL PRIMARY KEY,
  proveedor_id INTEGER NOT NULL REFERENCES proveedor(id),
  proveedor_nombre VARCHAR(200) NOT NULL,
  proveedor_cedula VARCHAR(20),
  ciclo_id INTEGER REFERENCES ciclo_ruta(id),
  ruta_nombre VARCHAR(120),
  semana DATE,
  estado VARCHAR(24) NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','pendiente_enviar','cerrada')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  clave UUID NOT NULL UNIQUE,
  solicitud JSONB NOT NULL,
  motivo_cierre VARCHAR(1000),
  cerrada_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((ciclo_id IS NULL AND ruta_nombre IS NULL AND semana IS NULL)
    OR (ciclo_id IS NOT NULL AND ruta_nombre IS NOT NULL AND semana IS NOT NULL)),
  CHECK ((estado='cerrada' AND motivo_cierre IS NOT NULL AND length(trim(motivo_cierre))>0 AND cerrada_en IS NOT NULL)
    OR (estado<>'cerrada' AND motivo_cierre IS NULL AND cerrada_en IS NULL))
);
CREATE INDEX orden_compra_ciclo_ambito ON orden_compra_ciclo(ciclo_id,proveedor_id,estado);

CREATE TABLE orden_compra_ciclo_linea (
  id SERIAL PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES orden_compra_ciclo(id),
  producto_id INTEGER NOT NULL REFERENCES producto(id),
  producto_nombre VARCHAR(500) NOT NULL,
  codigo_interno VARCHAR(200),
  codigo_proveedor VARCHAR(500),
  nombre_proveedor TEXT,
  -- Referencia histórica, sin FK: deshacer un mapeo no borra ni modifica
  -- la conversión/código que se revisó en una orden pendiente o cerrada.
  mapping_id UUID,
  factor_conversion NUMERIC(18,6) NOT NULL CHECK (factor_conversion BETWEEN 0.000001 AND 1000000),
  cantidad_proveedor INTEGER NOT NULL CHECK (cantidad_proveedor BETWEEN 1 AND 1000000),
  cantidad_propia NUMERIC(24,6) GENERATED ALWAYS AS (cantidad_proveedor * factor_conversion) STORED,
  UNIQUE (orden_id,producto_id)
);
CREATE TABLE orden_compra_ciclo_origen (
  id SERIAL PRIMARY KEY,
  linea_id INTEGER NOT NULL REFERENCES orden_compra_ciclo_linea(id),
  faltante_id INTEGER NOT NULL REFERENCES faltantes(id),
  factura_id INTEGER NOT NULL REFERENCES factura(id),
  factura_numero VARCHAR(100) NOT NULL,
  cliente_id INTEGER REFERENCES cliente(id),
  cliente_nombre VARCHAR(200) NOT NULL,
  orden_visita INTEGER,
  anticipado BOOLEAN NOT NULL,
  cantidad NUMERIC(24,6) NOT NULL CHECK (cantidad>0),
  UNIQUE (linea_id,faltante_id)
);
CREATE INDEX orden_compra_origen_faltante ON orden_compra_ciclo_origen(faltante_id);

CREATE FUNCTION proteger_orden_compra_ciclo() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'La orden conserva su historial'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.estado<>'borrador' THEN RAISE EXCEPTION 'La orden comienza como borrador'; END IF;
    IF NEW.ciclo_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM ciclo_ruta WHERE id=NEW.ciclo_id AND recorrido_fijado
        AND ruta_nombre=NEW.ruta_nombre AND semana=NEW.semana
    ) THEN RAISE EXCEPTION 'La orden requiere el contexto fijo del ciclo'; END IF;
    RETURN NEW;
  END IF;
  IF ROW(OLD.proveedor_id,OLD.proveedor_nombre,OLD.proveedor_cedula,OLD.ciclo_id,
    OLD.ruta_nombre,OLD.semana,OLD.clave,OLD.solicitud,OLD.creado_en)
    IS DISTINCT FROM ROW(NEW.proveedor_id,NEW.proveedor_nombre,NEW.proveedor_cedula,
    NEW.ciclo_id,NEW.ruta_nombre,NEW.semana,NEW.clave,NEW.solicitud,NEW.creado_en)
    THEN RAISE EXCEPTION 'Proveedor, ciclo y solicitud originales no se reclasifican'; END IF;
  IF OLD.estado='cerrada' OR NEW.version<>OLD.version+1 THEN
    RAISE EXCEPTION 'La orden está cerrada o su revisión no es válida';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orden_compra_contexto BEFORE INSERT OR UPDATE OR DELETE ON orden_compra_ciclo
  FOR EACH ROW EXECUTE FUNCTION proteger_orden_compra_ciclo();

CREATE FUNCTION proteger_linea_orden_compra() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE orden INTEGER;
BEGIN
  IF TG_TABLE_NAME='orden_compra_ciclo_linea' THEN
    orden := CASE WHEN TG_OP='DELETE' THEN OLD.orden_id ELSE NEW.orden_id END;
  ELSE
    SELECT orden_id INTO orden FROM orden_compra_ciclo_linea
      WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.linea_id ELSE NEW.linea_id END;
  END IF;
  IF (SELECT estado FROM orden_compra_ciclo WHERE id=orden) IS DISTINCT FROM 'borrador' THEN
    RAISE EXCEPTION 'Volvé a borrador antes de cambiar sus líneas';
  END IF;
  -- No trasladar una línea/origen a otra orden para eludir el bloqueo.
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Reemplazá la línea dentro de la revisión del borrador'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orden_compra_linea_editable BEFORE INSERT OR UPDATE OR DELETE ON orden_compra_ciclo_linea
  FOR EACH ROW EXECUTE FUNCTION proteger_linea_orden_compra();
CREATE TRIGGER orden_compra_origen_editable BEFORE INSERT OR UPDATE OR DELETE ON orden_compra_ciclo_origen
  FOR EACH ROW EXECUTE FUNCTION proteger_linea_orden_compra();

CREATE FUNCTION validar_reserva_orden_compra() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE linea RECORD; origen RECORD; reservada NUMERIC;
BEGIN
  SELECT l.*,o.ciclo_id INTO linea FROM orden_compra_ciclo_linea l
    JOIN orden_compra_ciclo o ON o.id=l.orden_id WHERE l.id=NEW.linea_id;
  SELECT f.*,fa.cliente_id,rc.ciclo_id INTO origen FROM faltantes f JOIN factura fa ON fa.id=f.factura_propia_id
    LEFT JOIN ciclo_ruta_cliente rc ON rc.id=fa.ciclo_ruta_cliente_id WHERE f.id=NEW.faltante_id FOR UPDATE OF f;
  IF origen.producto_propio_id IS DISTINCT FROM linea.producto_id
    OR origen.factura_propia_id IS DISTINCT FROM NEW.factura_id
    OR origen.cliente_id IS DISTINCT FROM NEW.cliente_id
    OR origen.ciclo_id IS DISTINCT FROM linea.ciclo_id THEN
    RAISE EXCEPTION 'La procedencia no corresponde al producto/ciclo de la orden';
  END IF;
  SELECT COALESCE(SUM(r.cantidad),0) INTO reservada FROM orden_compra_ciclo_origen r
    JOIN orden_compra_ciclo_linea l ON l.id=r.linea_id JOIN orden_compra_ciclo o ON o.id=l.orden_id
    WHERE r.faltante_id=NEW.faltante_id AND o.estado<>'cerrada';
  IF reservada+NEW.cantidad>origen.cantidad_faltante THEN
    RAISE EXCEPTION 'El faltante ya está reservado en otra orden';
  END IF;
  SELECT COALESCE(SUM(cantidad),0) INTO reservada FROM orden_compra_ciclo_origen WHERE linea_id=NEW.linea_id;
  IF reservada+NEW.cantidad>linea.cantidad_propia THEN
    RAISE EXCEPTION 'La procedencia supera la cantidad propia de la línea';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orden_compra_reserva BEFORE INSERT ON orden_compra_ciclo_origen
  FOR EACH ROW EXECUTE FUNCTION validar_reserva_orden_compra();
