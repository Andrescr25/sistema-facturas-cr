-- Cierre explícito de una orden enviada: ninguna recepción/entrada ficticia.
-- El evento conserva cantidades originales, cobertura liberada y actor/hora.
CREATE TABLE orden_compra_ciclo_cierre (
 id UUID PRIMARY KEY,
 orden_id INTEGER NOT NULL UNIQUE REFERENCES orden_compra_ciclo(id),
 solicitud JSONB NOT NULL CHECK(jsonb_typeof(solicitud)='object'),
 resumen JSONB NOT NULL CHECK(jsonb_typeof(resumen)='object'),
 motivo VARCHAR(1000) NOT NULL CHECK(length(btrim(motivo))>0 AND motivo=btrim(motivo)),
 usuario_id INTEGER NOT NULL REFERENCES usuario(id),
 fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE VIEW orden_compra_ciclo_cobertura AS
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
 CASE WHEN estado='cerrada' OR recepcion_completa_en IS NOT NULL THEN LEAST(cantidad,GREATEST(recibida-previa,0)) ELSE cantidad END cobertura
FROM origenes;

CREATE FUNCTION orden_compra_cierre_contexto(orden INTEGER) RETURNS JSONB LANGUAGE SQL STABLE AS $$
 SELECT jsonb_build_object('version',o.version,'estado',o.estado,'envioId',o.envio_id,
  'recepcionId',o.recepcion_id,
  'facturas',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'facturaId',f.factura_id,'estado',f.estado,'firma',f.firma) ORDER BY f.secuencia) FROM orden_compra_ciclo_factura f WHERE f.orden_id=o.id),'[]'),
  'recepciones',COALESCE((SELECT jsonb_agg(r.id ORDER BY r.secuencia) FROM orden_compra_ciclo_recepcion r WHERE r.orden_id=o.id),'[]'),
  'lineas',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'productoId',l.producto_id,'nombre',l.producto_nombre,'solicitado',l.cantidad_propia::text,
   'recibido',COALESCE(rec.cantidad,0)::text,
   'noRecibido',GREATEST(l.cantidad_propia-COALESCE(rec.cantidad,0),0)::text,
   'conservada',COALESCE(c.conservada,0)::text,'liberada',COALESCE(c.liberada,0)::text,
   'origenes',COALESCE(c.origenes,'[]')) ORDER BY l.id)
   FROM orden_compra_ciclo_linea l
   LEFT JOIN LATERAL (SELECT SUM(rl.cantidad) cantidad FROM orden_compra_ciclo_recepcion_linea rl JOIN orden_compra_ciclo_recepcion r ON r.id=rl.recepcion_id JOIN compra_linea cl ON cl.id=rl.compra_linea_id WHERE r.orden_id=o.id AND cl.producto_id=l.producto_id) rec ON TRUE
   LEFT JOIN LATERAL (SELECT SUM(cantidad_recibida) conservada,SUM(GREATEST(cobertura-cantidad_recibida,0)) liberada,
    jsonb_agg(jsonb_build_object('faltanteId',faltante_id,'facturaId',factura_id,'numero',factura_numero,'cliente',cliente_nombre,'orden',orden_visita,'original',cantidad::text,'conservada',cantidad_recibida::text,'liberada',GREATEST(cobertura-cantidad_recibida,0)::text) ORDER BY orden_visita NULLS LAST,faltante_id,id) origenes FROM orden_compra_ciclo_cobertura WHERE linea_id=l.id) c ON TRUE
   WHERE l.orden_id=o.id),'[]'))
 FROM orden_compra_ciclo o WHERE o.id=orden
$$;

CREATE FUNCTION proteger_cierre_orden() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE cab orden_compra_ciclo%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'El cierre conserva su historial'; END IF;
 SELECT * INTO cab FROM orden_compra_ciclo WHERE id=NEW.orden_id FOR UPDATE;
 IF cab.estado NOT IN ('enviada','parcialmente_recibida')
   OR NOT EXISTS(SELECT 1 FROM orden_compra_ciclo_envio WHERE id=cab.envio_id AND orden_id=cab.id AND estado='confirmado' AND confirmado_en=cab.enviada_en)
   OR NEW.solicitud->>'version' IS DISTINCT FROM cab.version::text
   OR NEW.solicitud->'confirmar' IS DISTINCT FROM 'true'::jsonb
   OR NEW.solicitud->>'motivo' IS DISTINCT FROM NEW.motivo
   OR NEW.resumen IS DISTINCT FROM orden_compra_cierre_contexto(cab.id)
   OR NOT EXISTS(SELECT 1 FROM usuario WHERE id=NEW.usuario_id AND activo)
   THEN RAISE EXCEPTION 'El cierre requiere envío confirmado, revisión y usuario activo'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER orden_cierre_historial BEFORE INSERT OR UPDATE OR DELETE ON orden_compra_ciclo_cierre FOR EACH ROW EXECUTE FUNCTION proteger_cierre_orden();

-- Conservar las condiciones originales salvo el nuevo terminal cerrado CON envío.
DO $$ DECLARE n TEXT; BEGIN
 FOR n IN SELECT conname FROM pg_constraint WHERE conrelid='orden_compra_ciclo'::regclass AND contype='c'
  AND (pg_get_constraintdef(oid) LIKE '%enviada_en%' OR pg_get_constraintdef(oid) LIKE '%recepcion_completa_en%')
 LOOP EXECUTE format('ALTER TABLE orden_compra_ciclo DROP CONSTRAINT %I',n); END LOOP;
END $$;
ALTER TABLE orden_compra_ciclo ADD CHECK(
 (estado IN ('enviada','parcialmente_recibida','recibida') AND envio_id IS NOT NULL AND enviada_en IS NOT NULL)
 OR (estado='cerrada' AND (enviada_en IS NULL OR envio_id IS NOT NULL))
 OR (estado IN ('borrador','pendiente_enviar') AND enviada_en IS NULL));
ALTER TABLE orden_compra_ciclo ADD CHECK(
 (estado='recibida' AND recepcion_id IS NOT NULL AND recepcion_completa_en IS NOT NULL)
 OR (estado='parcialmente_recibida' AND recepcion_id IS NOT NULL AND recepcion_completa_en IS NULL)
 OR (estado='cerrada' AND recepcion_completa_en IS NULL AND (recepcion_id IS NULL OR enviada_en IS NOT NULL))
 OR (estado IN ('borrador','pendiente_enviar','enviada') AND recepcion_id IS NULL AND recepcion_completa_en IS NULL));

CREATE OR REPLACE FUNCTION proteger_orden_compra_ciclo() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE envio orden_compra_ciclo_envio%ROWTYPE; r orden_compra_ciclo_recepcion%ROWTYPE; cierre orden_compra_ciclo_cierre%ROWTYPE;
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
  -- Cerrar no es recibir: conservar enviada_en/recepcion_id y los bytes.
  IF OLD.estado IN ('enviada','parcialmente_recibida') AND NEW.estado='cerrada' THEN
    SELECT * INTO cierre FROM orden_compra_ciclo_cierre WHERE orden_id=OLD.id;
    IF cierre.id IS NULL OR cierre.solicitud->>'version' IS DISTINCT FROM OLD.version::text
      OR cierre.resumen IS DISTINCT FROM orden_compra_cierre_contexto(OLD.id)
      OR NEW.version<>OLD.version+1 OR NEW.motivo_cierre IS DISTINCT FROM cierre.motivo
      OR NEW.cerrada_en IS DISTINCT FROM cierre.fecha
      OR (to_jsonb(OLD)-ARRAY['estado','version','actualizado_en','motivo_cierre','cerrada_en']) IS DISTINCT FROM
         (to_jsonb(NEW)-ARRAY['estado','version','actualizado_en','motivo_cierre','cerrada_en'])
      THEN RAISE EXCEPTION 'El cierre requiere su evento revisado y conserva lo enviado/recibido'; END IF;
    RETURN NEW;
  END IF;
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
  IF o.estado IN ('recibida','cerrada') THEN RAISE EXCEPTION 'La orden finalizada conserva todos sus vínculos'; END IF;
  IF OLD.estado<>'vigente' OR NEW.estado<>'retirada'
    OR (to_jsonb(OLD)-ARRAY['estado','retirado_por','retirado_en','motivo']) IS DISTINCT FROM
       (to_jsonb(NEW)-ARRAY['estado','retirado_por','retirado_en','motivo'])
    THEN RAISE EXCEPTION 'La comparación original es inmutable; retirala con motivo para corregir el vínculo'; END IF;
  RETURN NEW;
END $$;
