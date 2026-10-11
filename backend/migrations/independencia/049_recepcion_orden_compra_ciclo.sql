-- No vuelve a acreditar compras anteriores ni importa el stock histórico.
-- En compras NUEVAS ya vinculadas, aceptación financiera y entrada física
-- quedan separadas; el kardex se reconcilia con las recepciones confirmadas.
ALTER TABLE compra ADD COLUMN inventario_por_recepcion BOOLEAN NOT NULL DEFAULT FALSE;
CREATE FUNCTION modalidad_inventario_compra() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.inventario_por_recepcion := EXISTS(SELECT 1 FROM orden_compra_ciclo_factura
      WHERE factura_id=NEW.factura_proveedor_id AND estado='vigente');
  ELSIF NEW.inventario_por_recepcion IS DISTINCT FROM OLD.inventario_por_recepcion
    OR (OLD.inventario_por_recepcion AND NEW.factura_proveedor_id IS DISTINCT FROM OLD.factura_proveedor_id) THEN
    RAISE EXCEPTION 'La modalidad de inventario original de la compra no se cambia';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compra_modalidad_inventario BEFORE INSERT OR UPDATE ON compra
  FOR EACH ROW EXECUTE FUNCTION modalidad_inventario_compra();

CREATE TABLE orden_compra_ciclo_recepcion (
  id UUID PRIMARY KEY,
  secuencia BIGSERIAL NOT NULL UNIQUE,
  orden_id INTEGER NOT NULL REFERENCES orden_compra_ciclo(id),
  solicitud JSONB NOT NULL CHECK(jsonb_typeof(solicitud)='object'),
  resumen JSONB NOT NULL CHECK(jsonb_typeof(resumen)='object'),
  final BOOLEAN NOT NULL,
  motivos JSONB NOT NULL CHECK(jsonb_typeof(motivos)='array'),
  observaciones VARCHAR(1000),
  usuario_id INTEGER REFERENCES usuario(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(orden_id,id)
);
CREATE UNIQUE INDEX orden_recepcion_final_unica ON orden_compra_ciclo_recepcion(orden_id) WHERE final;
CREATE TABLE orden_compra_ciclo_recepcion_linea (
  id SERIAL PRIMARY KEY,
  recepcion_id UUID NOT NULL REFERENCES orden_compra_ciclo_recepcion(id),
  vinculo_id UUID NOT NULL REFERENCES orden_compra_ciclo_factura(id),
  compra_linea_id INTEGER NOT NULL REFERENCES compra_linea(id),
  cantidad NUMERIC(14,4) NOT NULL CHECK(cantidad>0),
  UNIQUE(recepcion_id,compra_linea_id)
);
CREATE INDEX orden_recepcion_linea_compra ON orden_compra_ciclo_recepcion_linea(compra_linea_id);
CREATE FUNCTION proteger_recepcion_orden() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE cab orden_compra_ciclo%ROWTYPE; vinc orden_compra_ciclo_factura%ROWTYPE; lin RECORD; rev TEXT; previo NUMERIC;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'La recepción física conserva su historial'; END IF;
  IF TG_TABLE_NAME='orden_compra_ciclo_recepcion' THEN
    SELECT * INTO cab FROM orden_compra_ciclo WHERE id=NEW.orden_id FOR UPDATE;
    IF cab.estado NOT IN ('enviada','parcialmente_recibida') OR NEW.solicitud->>'version' IS DISTINCT FROM cab.version::text THEN RAISE EXCEPTION 'La recepción requiere una orden enviada abierta'; END IF;
  ELSE
    SELECT o.*,r.solicitud->>'version' revision_evento INTO lin FROM orden_compra_ciclo o JOIN orden_compra_ciclo_recepcion r ON r.orden_id=o.id WHERE r.id=NEW.recepcion_id FOR UPDATE OF o;
    SELECT * INTO cab FROM orden_compra_ciclo WHERE id=lin.id; rev:=lin.revision_evento;
    SELECT * INTO vinc FROM orden_compra_ciclo_factura WHERE id=NEW.vinculo_id FOR SHARE;
    SELECT l.*,c.factura_proveedor_id,c.estado INTO lin FROM compra_linea l JOIN compra c ON c.id=l.compra_id WHERE l.id=NEW.compra_linea_id FOR SHARE OF l,c;
    IF cab.estado NOT IN ('enviada','parcialmente_recibida') OR rev IS DISTINCT FROM cab.version::text OR vinc.estado IS DISTINCT FROM 'vigente'
      OR vinc.orden_id IS DISTINCT FROM cab.id OR vinc.factura_id IS DISTINCT FROM lin.factura_proveedor_id
      OR lin.estado IS DISTINCT FROM 'registrada' OR lin.producto_id IS NULL OR lin.cantidad_propia<=0
      THEN RAISE EXCEPTION 'La línea recibida requiere compra registrada de esta orden'; END IF;
    SELECT COALESCE(SUM(cantidad),0) INTO previo FROM orden_compra_ciclo_recepcion_linea WHERE compra_linea_id=NEW.compra_linea_id;
    IF previo+NEW.cantidad>lin.cantidad_propia THEN RAISE EXCEPTION 'La recepción supera la cantidad facturada de la línea'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orden_recepcion_historial BEFORE INSERT OR UPDATE OR DELETE ON orden_compra_ciclo_recepcion
  FOR EACH ROW EXECUTE FUNCTION proteger_recepcion_orden();
CREATE TRIGGER orden_recepcion_linea_historial BEFORE INSERT OR UPDATE OR DELETE ON orden_compra_ciclo_recepcion_linea
  FOR EACH ROW EXECUTE FUNCTION proteger_recepcion_orden();

ALTER TABLE orden_compra_ciclo DROP CONSTRAINT orden_compra_ciclo_estado_check;
ALTER TABLE orden_compra_ciclo ADD CONSTRAINT orden_compra_ciclo_estado_check
  CHECK(estado IN ('borrador','pendiente_enviar','enviada','parcialmente_recibida','recibida','cerrada'));
ALTER TABLE orden_compra_ciclo ADD COLUMN recepcion_id UUID;
ALTER TABLE orden_compra_ciclo ADD COLUMN recepcion_completa_en TIMESTAMPTZ;
ALTER TABLE orden_compra_ciclo ADD FOREIGN KEY(id,recepcion_id) REFERENCES orden_compra_ciclo_recepcion(orden_id,id);
-- Sustituir SOLO la condición de enviada_en de 047; conservar las demás.
DO $$ DECLARE n TEXT; BEGIN
  FOR n IN SELECT conname FROM pg_constraint WHERE conrelid='orden_compra_ciclo'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%enviada_en%'
    LOOP EXECUTE format('ALTER TABLE orden_compra_ciclo DROP CONSTRAINT %I',n); END LOOP;
END $$;
ALTER TABLE orden_compra_ciclo ADD CHECK((estado IN ('enviada','parcialmente_recibida','recibida') AND envio_id IS NOT NULL AND enviada_en IS NOT NULL)
  OR (estado NOT IN ('enviada','parcialmente_recibida','recibida') AND enviada_en IS NULL));
ALTER TABLE orden_compra_ciclo ADD CHECK((estado='recibida' AND recepcion_id IS NOT NULL AND recepcion_completa_en IS NOT NULL)
  OR (estado='parcialmente_recibida' AND recepcion_id IS NOT NULL AND recepcion_completa_en IS NULL)
  OR (estado NOT IN ('recibida','parcialmente_recibida') AND recepcion_id IS NULL AND recepcion_completa_en IS NULL));

-- Cuerpo 047, con transición física validada antes de la prohibición de
-- editar enviada. Cabecera comercial, líneas y bytes siguen inmutables.
CREATE OR REPLACE FUNCTION proteger_orden_compra_ciclo() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE envio orden_compra_ciclo_envio%ROWTYPE; r orden_compra_ciclo_recepcion%ROWTYPE;
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
  IF OLD.estado IN ('enviada','parcialmente_recibida') THEN
    SELECT * INTO r FROM orden_compra_ciclo_recepcion WHERE id=NEW.recepcion_id AND orden_id=OLD.id;
    IF r.id IS NULL OR r.solicitud->>'version' IS DISTINCT FROM OLD.version::text
      OR NEW.recepcion_id IS NOT DISTINCT FROM OLD.recepcion_id OR NEW.version<>OLD.version+1
      OR NEW.estado IS DISTINCT FROM (CASE WHEN r.final THEN 'recibida' ELSE 'parcialmente_recibida' END)
      OR NEW.recepcion_completa_en IS DISTINCT FROM (CASE WHEN r.final THEN r.fecha ELSE NULL END)
      OR (to_jsonb(OLD)-ARRAY['estado','version','actualizado_en','recepcion_id','recepcion_completa_en']) IS DISTINCT FROM
         (to_jsonb(NEW)-ARRAY['estado','version','actualizado_en','recepcion_id','recepcion_completa_en'])
      THEN RAISE EXCEPTION 'La recepción requiere evento físico y conserva la orden enviada'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.estado='recibida' THEN RAISE EXCEPTION 'La recepción completa conserva su historial'; END IF;
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


-- Cobertura recibida se asigna al mismo origen en orden, sin aplicarla a otra
-- semana ni resolver automáticamente faltantes de preparación de clientes.
CREATE VIEW orden_compra_ciclo_cobertura AS
WITH recibidos AS (
 SELECT r.orden_id,l.producto_id,SUM(rl.cantidad) cantidad
 FROM orden_compra_ciclo_recepcion_linea rl JOIN orden_compra_ciclo_recepcion r ON r.id=rl.recepcion_id
 JOIN compra_linea l ON l.id=rl.compra_linea_id GROUP BY r.orden_id,l.producto_id
), origenes AS (
 SELECT r.*,o.estado,l.orden_id,l.producto_id,o.recepcion_completa_en,COALESCE(rec.cantidad,0) recibida,
 COALESCE(SUM(r.cantidad) OVER(PARTITION BY l.id ORDER BY r.orden_visita NULLS LAST,r.faltante_id,r.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) previa
 FROM orden_compra_ciclo_origen r JOIN orden_compra_ciclo_linea l ON l.id=r.linea_id
 JOIN orden_compra_ciclo o ON o.id=l.orden_id LEFT JOIN recibidos rec ON rec.orden_id=o.id AND rec.producto_id=l.producto_id
)
SELECT *,LEAST(cantidad,GREATEST(recibida-previa,0)) cantidad_recibida,
 CASE WHEN estado='cerrada' THEN 0 WHEN recepcion_completa_en IS NOT NULL THEN LEAST(cantidad,GREATEST(recibida-previa,0)) ELSE cantidad END cobertura
FROM origenes;
-- La misma regla debe proteger INSERT, no solo pintar una sugerencia libre.
CREATE OR REPLACE FUNCTION validar_reserva_orden_compra() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
  SELECT COALESCE(SUM(cobertura),0) INTO reservada FROM orden_compra_ciclo_cobertura WHERE faltante_id=NEW.faltante_id;
  IF reservada+NEW.cantidad>origen.cantidad_faltante THEN
    RAISE EXCEPTION 'El faltante ya está reservado en otra orden';
  END IF;
  SELECT COALESCE(SUM(cantidad),0) INTO reservada FROM orden_compra_ciclo_origen WHERE linea_id=NEW.linea_id;
  IF reservada+NEW.cantidad>linea.cantidad_propia THEN
    RAISE EXCEPTION 'La procedencia supera la cantidad propia de la línea';
  END IF;
  RETURN NEW;
END $$;

-- Una línea física ya confirmada no puede cambiar de cantidad, conversión o
-- compra ni perder el vínculo que explica su procedencia.
CREATE FUNCTION proteger_fuente_recepcion() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE usada BOOLEAN;
BEGIN
  IF TG_TABLE_NAME='compra_linea' THEN
    SELECT EXISTS(SELECT 1 FROM orden_compra_ciclo_recepcion_linea WHERE compra_linea_id=OLD.id) INTO usada;
  ELSE
    SELECT EXISTS(SELECT 1 FROM orden_compra_ciclo_recepcion_linea WHERE vinculo_id=OLD.id) INTO usada;
  END IF;
  IF usada THEN RAISE EXCEPTION 'La fuente de una recepción física conserva su historial'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compra_linea_recibida BEFORE UPDATE OR DELETE ON compra_linea
  FOR EACH ROW EXECUTE FUNCTION proteger_fuente_recepcion();
CREATE TRIGGER orden_factura_recibida BEFORE UPDATE OR DELETE ON orden_compra_ciclo_factura
  FOR EACH ROW EXECUTE FUNCTION proteger_fuente_recepcion();

-- Una segunda factura puede completar una recepción parcial; final conserva
-- también los comprobantes de líneas rechazadas con cantidad física cero.
CREATE OR REPLACE FUNCTION proteger_factura_orden_ciclo() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE o orden_compra_ciclo%ROWTYPE; f facturas_proveedores%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'La factura vinculada conserva su historial'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO o FROM orden_compra_ciclo WHERE id=NEW.orden_id FOR SHARE;
    SELECT * INTO f FROM facturas_proveedores WHERE id=NEW.factura_id FOR SHARE;
    IF o.estado NOT IN ('enviada','parcialmente_recibida') OR NEW.estado<>'vigente'
      OR NULLIF(regexp_replace(upper(o.proveedor_cedula),'[^A-Z0-9]','','g'),'') IS NULL
      OR regexp_replace(upper(o.proveedor_cedula),'[^A-Z0-9]','','g') IS DISTINCT FROM regexp_replace(upper(f.proveedor_cedula),'[^A-Z0-9]','','g')
      OR f.clave !~ '^[0-9]{50}$' OR f.estado::text NOT IN ('RECIBIDA','PROCESADA','RELACIONADA','ENVIADA')
      OR NEW.documento->>'id' IS DISTINCT FROM f.id::text
      OR NEW.documento->>'clave' IS DISTINCT FROM f.clave
      THEN RAISE EXCEPTION 'El comprobante debe corresponder al proveedor y a una orden enviada'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO o FROM orden_compra_ciclo WHERE id=OLD.orden_id FOR SHARE;
  IF o.estado='recibida' THEN RAISE EXCEPTION 'La recepción final conserva todos sus vínculos'; END IF;
  IF OLD.estado<>'vigente' OR NEW.estado<>'retirada'
    OR (to_jsonb(OLD)-ARRAY['estado','retirado_por','retirado_en','motivo']) IS DISTINCT FROM
       (to_jsonb(NEW)-ARRAY['estado','retirado_por','retirado_en','motivo'])
    THEN RAISE EXCEPTION 'La comparación original es inmutable; retirala con motivo para corregir el vínculo'; END IF;
  RETURN NEW;
END $$;
