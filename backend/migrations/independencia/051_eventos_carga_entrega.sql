-- Solo operación física; no crear movimientos de inventario ni documentos
-- financieros. La venta ya tiene su propio kardex. No poblar históricos.
CREATE TABLE entrega_evento (
  id UUID PRIMARY KEY,
  factura_id INTEGER NOT NULL REFERENCES factura(id),
  recorrido_id INTEGER NOT NULL REFERENCES ciclo_ruta_cliente(id),
  version INTEGER NOT NULL CHECK(version>0),
  accion VARCHAR(20) NOT NULL CHECK(accion IN ('carga','entrega','descarga','incidencia','revision')),
  solicitud JSONB NOT NULL CHECK(jsonb_typeof(solicitud)='object'),
  documento JSONB NOT NULL CHECK(jsonb_typeof(documento)='object'),
  saldos JSONB NOT NULL CHECK(jsonb_typeof(saldos)='array'),
  motivo VARCHAR(1000),
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(factura_id,version)
);
CREATE INDEX entrega_por_recorrido ON entrega_evento(recorrido_id,factura_id,version DESC);

-- Lista blanca operativa. Precios/costos/saldos financieros no viajan al
-- chofer. JSONB conserva precisión/hora; nunca ligar eventos a líneas que
-- Impresión reemplaza al editar una factura.
CREATE FUNCTION entrega_documento(p_id INTEGER) RETURNS JSONB LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('factura',jsonb_build_object('id',f.id,'numero',f.numero,
   'clienteId',f.cliente_id,'clienteNombre',f.cliente_nombre,'recorridoId',f.ciclo_ruta_cliente_id,
   'estado',f.estado,'estadoBodega',f.estado_bodega,'procesadaEn',f.bodega_procesado_en,
   'anticipado',f.preventa_anticipada),
   'lineas',COALESCE((SELECT jsonb_agg(jsonb_build_object('numeroLinea',l.numero_linea,
     'productoId',l.producto_id,'nombre',l.nombre,'referencia',l.referencia,
     'descripcion',l.descripcion,'cantidad',l.cantidad) ORDER BY l.numero_linea)
     FROM factura_linea l WHERE l.factura_id=f.id),'[]'::jsonb),
   'faltantes',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,
     'productoId',x.producto_propio_id,'cantidad',x.cantidad_faltante,'tipo',x.tipo_faltante,
     'estado',x.estado) ORDER BY x.id) FROM faltantes x WHERE x.factura_propia_id=f.id),'[]'::jsonb))
 FROM factura f WHERE f.id=p_id
$$;

-- Validación también en SQL: ninguna ruta puede fabricar entregas mayores
-- que lo cargado o cambiar cantidades confirmadas sin una revisión explícita.
CREATE FUNCTION entrega_calcular_saldos(doc JSONB,prev JSONB,accion TEXT,items JSONB)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE l JSONB; i JSONB; viejo JSONB; r JSONB:='[]'; cargada NUMERIC; entregada NUMERIC;
 descargada NUMERIC; q NUMERIC; campo TEXT; v NUMERIC;
BEGIN
 IF jsonb_typeof(items) IS DISTINCT FROM 'array' OR jsonb_array_length(items)>1000 THEN
   RAISE EXCEPTION 'Las cantidades requieren una lista de hasta 1000 líneas'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
   OR COALESCE(x->>'numeroLinea','') !~ '^[1-9][0-9]*$') OR
   (SELECT COUNT(*) FROM jsonb_array_elements(items))<>(SELECT COUNT(DISTINCT x->>'numeroLinea') FROM jsonb_array_elements(items) x)
   THEN RAISE EXCEPTION 'Hay líneas inválidas o repetidas'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) x WHERE NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(doc->'lineas') dl WHERE dl->>'numeroLinea'=x->>'numeroLinea'))
   THEN RAISE EXCEPTION 'La línea no pertenece a esta revisión de factura'; END IF;
 IF accion='incidencia' AND jsonb_array_length(items)<>0 THEN RAISE EXCEPTION 'Incidencia no cambia cantidades'; END IF;
 IF accion='revision' AND jsonb_array_length(items)<>jsonb_array_length(doc->'lineas') THEN
   RAISE EXCEPTION 'Revisá todas las líneas del documento actual'; END IF;
 IF accion IN ('carga','entrega','descarga') AND jsonb_array_length(items)=0 THEN
   RAISE EXCEPTION 'Registrá al menos una cantidad física'; END IF;
 FOR l IN SELECT * FROM jsonb_array_elements(doc->'lineas') LOOP
   SELECT x INTO viejo FROM jsonb_array_elements(prev) x WHERE x->>'numeroLinea'=l->>'numeroLinea';
   cargada:=COALESCE((viejo->>'cargada')::numeric,0);
   entregada:=COALESCE((viejo->>'entregada')::numeric,0);
   descargada:=COALESCE((viejo->>'descargada')::numeric,0);
   SELECT x INTO i FROM jsonb_array_elements(items) x WHERE x->>'numeroLinea'=l->>'numeroLinea';
   IF i IS NOT NULL THEN
     IF accion='revision' THEN
       FOREACH campo IN ARRAY ARRAY['cargada','entregada','descargada'] LOOP
         IF jsonb_typeof(i->campo) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
         v:=(i->>campo)::numeric;
         IF v<0 OR v>999999999.9999 OR v<>trunc(v,4) THEN RAISE EXCEPTION 'Cantidad fuera de rango o precisión'; END IF;
       END LOOP;
       cargada:=(i->>'cargada')::numeric;entregada:=(i->>'entregada')::numeric;descargada:=(i->>'descargada')::numeric;
     ELSIF accion IN ('carga','entrega','descarga') THEN
       IF jsonb_typeof(i->'cantidad') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
       q:=(i->>'cantidad')::numeric;
       IF q<=0 OR q>999999999.9999 OR q<>trunc(q,4) THEN RAISE EXCEPTION 'Cantidad fuera de rango o precisión'; END IF;
       IF accion='carga' THEN cargada:=cargada+q;
       ELSIF accion='entrega' THEN entregada:=entregada+q;
       ELSE descargada:=descargada+q; END IF;
     END IF;
   END IF;
   IF entregada+descargada>cargada OR cargada-descargada>GREATEST((l->>'cantidad')::numeric,0) THEN
     RAISE EXCEPTION 'La entrega/descarga supera la carga o la carga supera lo facturado'; END IF;
   r:=r||jsonb_build_array(jsonb_build_object('numeroLinea',l->'numeroLinea',
     'cargada',cargada,'entregada',entregada,'descargada',descargada));
 END LOOP;
 RETURN r;
END $$;

CREATE FUNCTION proteger_entrega_evento() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE f factura%ROWTYPE; previo entrega_evento%ROWTYPE; doc JSONB; usar JSONB; ciclo TEXT; firma TEXT; calculado JSONB;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'El registro físico conserva su historial'; END IF;
 SELECT * INTO f FROM factura WHERE id=NEW.factura_id FOR UPDATE;
 IF f.ciclo_ruta_cliente_id IS NULL OR NEW.recorrido_id IS DISTINCT FROM f.ciclo_ruta_cliente_id THEN
   RAISE EXCEPTION 'El evento requiere el recorrido fijo de la factura'; END IF;
 SELECT c.estado INTO ciclo FROM ciclo_ruta c JOIN ciclo_ruta_cliente rc ON rc.ciclo_id=c.id
   WHERE rc.id=NEW.recorrido_id FOR SHARE OF c;
 SELECT * INTO previo FROM entrega_evento WHERE factura_id=f.id ORDER BY version DESC LIMIT 1;
 IF NEW.version<>COALESCE(previo.version,0)+1 OR NEW.solicitud->>'version' IS DISTINCT FROM COALESCE(previo.version,0)::text THEN
   RAISE EXCEPTION 'La revisión física cambió'; END IF;
 doc:=entrega_documento(f.id);
 firma:=md5(jsonb_build_object('documento',doc,'version',COALESCE(previo.version,0),'cicloEstado',ciclo)::text);
 IF NEW.solicitud->>'revision' IS DISTINCT FROM firma THEN RAISE EXCEPTION 'Cambió la factura, bodega o ciclo'; END IF;
 IF NOT EXISTS(SELECT 1 FROM usuario WHERE id=NEW.usuario_id AND activo) THEN RAISE EXCEPTION 'Responsable activo requerido'; END IF;
 IF NEW.accion='revision' AND NOT EXISTS(SELECT 1 FROM usuario WHERE id=NEW.usuario_id AND es_admin AND activo) THEN
   RAISE EXCEPTION 'La revisión física requiere administrador'; END IF;
 IF NEW.accion='revision' AND f.estado<>'emitida' THEN RAISE EXCEPTION 'No reasignar cantidades a una factura anulada'; END IF;
 IF NEW.solicitud->>'accion' IS DISTINCT FROM NEW.accion OR NEW.solicitud->>'motivo' IS DISTINCT FROM NEW.motivo THEN
   RAISE EXCEPTION 'La solicitud no corresponde a la operación física'; END IF;
 IF NEW.accion IN ('revision','descarga','incidencia') AND (NEW.motivo IS NULL OR length(btrim(NEW.motivo))=0) THEN
   RAISE EXCEPTION 'Indicá el motivo confirmado'; END IF;
 IF NEW.accion IN ('carga','entrega') THEN
   IF f.estado<>'emitida' OR f.estado_bodega<>'procesado' OR ciclo NOT IN ('preventa','preparacion','entrega')
     OR (NEW.accion='entrega' AND ciclo<>'entrega') THEN RAISE EXCEPTION 'Factura/bodega/ciclo no habilitan esta operación'; END IF;
   IF previo.id IS NOT NULL AND previo.documento IS DISTINCT FROM doc THEN RAISE EXCEPTION 'Revisá el registro después de cambiar la factura'; END IF;
 END IF;
 -- Devolver carga física pendiente sigue disponible aun si la factura cambió,
 -- fue anulada o el ciclo se cerró. Se descarga la foto que se cargó, no la nueva.
 usar:=CASE WHEN NEW.accion IN ('descarga','incidencia') AND previo.id IS NOT NULL THEN previo.documento ELSE doc END;
 IF NEW.documento IS DISTINCT FROM usar THEN RAISE EXCEPTION 'El documento operativo no corresponde'; END IF;
 calculado:=entrega_calcular_saldos(usar,COALESCE(previo.saldos,'[]'),NEW.accion,NEW.solicitud->'lineas');
 IF NEW.saldos IS DISTINCT FROM calculado THEN RAISE EXCEPTION 'Las cantidades físicas no corresponden al evento'; END IF;
 -- La fecha es SIEMPRE del servidor, aunque se inserte desde otra ruta.
 NEW.fecha:=CURRENT_TIMESTAMP;
 RETURN NEW;
END $$;
CREATE TRIGGER entrega_evento_historial BEFORE INSERT OR UPDATE OR DELETE ON entrega_evento
 FOR EACH ROW EXECUTE FUNCTION proteger_entrega_evento();

-- Resumen para plan/carga. Sin evento no convertir revisión de bodega en
-- entrega; una factura modificada conserva el avance bajo Requiere revisión.
CREATE FUNCTION entrega_resumen(p_id INTEGER) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE e entrega_evento%ROWTYPE; camion NUMERIC; entregada NUMERIC; estado TEXT; completa BOOLEAN;
BEGIN
 SELECT * INTO e FROM entrega_evento WHERE factura_id=p_id ORDER BY version DESC LIMIT 1;
 IF e.id IS NULL THEN RETURN jsonb_build_object('estado','por_cargar','version',0,'enCamion',0,'entregada',0); END IF;
 SELECT COALESCE(SUM((x->>'cargada')::numeric-(x->>'entregada')::numeric-(x->>'descargada')::numeric),0),
   COALESCE(SUM((x->>'entregada')::numeric),0) INTO camion,entregada FROM jsonb_array_elements(e.saldos) x;
 SELECT jsonb_array_length(e.documento->'lineas')>0 AND COALESCE(bool_and((s->>'entregada')::numeric>=(l->>'cantidad')::numeric),FALSE)
   INTO completa FROM jsonb_array_elements(e.documento->'lineas') l LEFT JOIN LATERAL
   (SELECT s FROM jsonb_array_elements(e.saldos) s WHERE s->>'numeroLinea'=l->>'numeroLinea') x ON TRUE;
 estado:=CASE WHEN e.documento IS DISTINCT FROM entrega_documento(p_id) THEN 'requiere_revision'
   WHEN completa THEN 'entregada' WHEN entregada>0 THEN 'parcialmente_entregada' WHEN camion>0 THEN 'cargada' ELSE 'por_cargar' END;
 RETURN jsonb_build_object('estado',estado,'version',e.version,'enCamion',camion,'entregada',entregada);
END $$;
