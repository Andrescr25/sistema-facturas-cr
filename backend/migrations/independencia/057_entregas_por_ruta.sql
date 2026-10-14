-- ROT-05: carga automática por ruta sin exigir semanas. No poblar ni
-- modificar eventos existentes: sus fotografías y FK históricas se conservan.
-- Ejecutar en transacción con respaldo y lock_timeout del aplicador.
ALTER TABLE entrega_evento ALTER COLUMN recorrido_id DROP NOT NULL;

-- La ruta queda fijada con el PRIMER evento. Los eventos anteriores a esta
-- migración usan su recorrido original: no reinterpretar historia con la ficha.
CREATE FUNCTION entrega_ruta_operativa(p_id INTEGER) RETURNS JSONB LANGUAGE sql STABLE AS $$
 SELECT CASE
   WHEN e.documento->'factura' ? 'ruta' THEN e.documento->'factura'->'ruta'
   WHEN e.id IS NOT NULL THEN jsonb_build_object('id',cy.ruta_id,'nombre',cy.ruta_nombre,
     'orden',rc.orden,'ubicacionMaps',rc.ubicacion_maps)
   ELSE jsonb_build_object('id',c.ruta_id,'nombre',r.nombre,'orden',c.orden_ruta,'ubicacionMaps',c.ubicacion_maps)
 END
 FROM factura f
 LEFT JOIN cliente c ON c.id=f.cliente_id
 LEFT JOIN ruta_cliente r ON r.id=c.ruta_id
 LEFT JOIN LATERAL (SELECT id,documento FROM entrega_evento WHERE factura_id=f.id ORDER BY version DESC LIMIT 1) e ON true
 LEFT JOIN ciclo_ruta_cliente rc ON rc.id=(e.documento->'factura'->>'recorridoId')::int
 LEFT JOIN ciclo_ruta cy ON cy.id=rc.ciclo_id
 WHERE f.id=p_id
$$;

-- Misma tolerancia que Facturación/Bodega. Un cobro no retira una venta;
-- una nota total vigente sí, aunque siga figurando como emitida.
CREATE FUNCTION entrega_factura_vigente(p_id INTEGER) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT f.estado='emitida' AND NOT (x.monto>0 AND x.monto>=f.total-0.5)
 FROM factura f CROSS JOIN LATERAL (
   SELECT COALESCE(SUM(nf.monto),0) monto FROM nota_credito_factura nf
   JOIN nota_credito n ON n.id=nf.nota_credito_id WHERE nf.factura_id=f.id AND n.estado<>'anulada'
 ) x WHERE f.id=p_id
$$;

CREATE OR REPLACE FUNCTION entrega_documento(p_id INTEGER) RETURNS JSONB LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('factura',jsonb_build_object('id',f.id,'numero',f.numero,
   'clienteId',f.cliente_id,'clienteNombre',f.cliente_nombre,'recorridoId',f.ciclo_ruta_cliente_id,
   'estado',f.estado,'estadoBodega',f.estado_bodega,'procesadaEn',f.bodega_procesado_en,
   'anticipado',f.preventa_anticipada) ||
   CASE WHEN NOT EXISTS(SELECT 1 FROM entrega_evento e WHERE e.factura_id=f.id)
     OR (SELECT e.documento->'factura' ? 'ruta' FROM entrega_evento e WHERE e.factura_id=f.id ORDER BY version DESC LIMIT 1)
     THEN jsonb_build_object('ruta',entrega_ruta_operativa(f.id)) ELSE '{}'::jsonb END,
   'lineas',COALESCE((SELECT jsonb_agg(jsonb_build_object('numeroLinea',l.numero_linea,
     'productoId',l.producto_id,'nombre',l.nombre,'referencia',l.referencia,
     'descripcion',l.descripcion,'cantidad',l.cantidad) ORDER BY l.numero_linea)
     FROM factura_linea l WHERE l.factura_id=f.id),'[]'::jsonb),
   'faltantes',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,
     'productoId',x.producto_propio_id,'cantidad',x.cantidad_faltante,'tipo',x.tipo_faltante,
     'estado',x.estado) ORDER BY x.id) FROM faltantes x WHERE x.factura_propia_id=f.id),'[]'::jsonb))
 FROM factura f WHERE f.id=p_id
$$;


-- Firma operativa compartida por servicio y trigger; cambiar la ruta antes
-- de cargar o acreditar totalmente una factura invalida un formulario viejo.
CREATE FUNCTION entrega_revision(p_id INTEGER,p_version INTEGER) RETURNS TEXT LANGUAGE sql STABLE AS $$
 SELECT md5(jsonb_build_object('documento',entrega_documento(p_id),'version',p_version,
   'vigente',entrega_factura_vigente(p_id))::text)
$$;

CREATE OR REPLACE FUNCTION proteger_entrega_evento() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE f factura%ROWTYPE; previo entrega_evento%ROWTYPE; doc JSONB; usar JSONB; firma TEXT; calculado JSONB;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'El registro físico conserva su historial'; END IF;
 SELECT * INTO f FROM factura WHERE id=NEW.factura_id FOR UPDATE;
 IF NEW.recorrido_id IS DISTINCT FROM f.ciclo_ruta_cliente_id THEN
   RAISE EXCEPTION 'El evento conserva el recorrido histórico de la factura'; END IF;
 -- Si aún no hubo evento, la ruta se toma de la ficha. Bloquearla impide
 -- que un cambio de ruta/orden/Maps durante la carga fije una selección vieja.
 PERFORM 1 FROM cliente WHERE id=f.cliente_id FOR SHARE;
 SELECT * INTO previo FROM entrega_evento WHERE factura_id=f.id ORDER BY version DESC LIMIT 1;
 IF NEW.version<>COALESCE(previo.version,0)+1 OR NEW.solicitud->>'version' IS DISTINCT FROM COALESCE(previo.version,0)::text THEN
   RAISE EXCEPTION 'La revisión física cambió'; END IF;
 doc:=entrega_documento(f.id);
 firma:=entrega_revision(f.id,COALESCE(previo.version,0));
 IF NEW.solicitud->>'revision' IS DISTINCT FROM firma THEN RAISE EXCEPTION 'Cambió la factura, bodega o ruta'; END IF;
 IF NOT EXISTS(SELECT 1 FROM usuario WHERE id=NEW.usuario_id AND activo) THEN RAISE EXCEPTION 'Responsable activo requerido'; END IF;
 IF NEW.accion='revision' AND NOT EXISTS(SELECT 1 FROM usuario WHERE id=NEW.usuario_id AND es_admin AND activo) THEN
   RAISE EXCEPTION 'La revisión física requiere administrador'; END IF;
 IF NEW.accion='revision' AND NOT entrega_factura_vigente(f.id) THEN RAISE EXCEPTION 'No reasignar cantidades a una factura anulada'; END IF;
 IF NEW.solicitud->>'accion' IS DISTINCT FROM NEW.accion OR NEW.solicitud->>'motivo' IS DISTINCT FROM NEW.motivo THEN
   RAISE EXCEPTION 'La solicitud no corresponde a la operación física'; END IF;
 IF NEW.accion IN ('revision','descarga','incidencia') AND (NEW.motivo IS NULL OR length(btrim(NEW.motivo))=0) THEN
   RAISE EXCEPTION 'Indicá el motivo confirmado'; END IF;
 IF NEW.accion IN ('carga','entrega') THEN
   IF NOT entrega_factura_vigente(f.id) OR f.estado_bodega<>'procesado' THEN
     RAISE EXCEPTION 'Factura/bodega no habilitan esta operación'; END IF;
   IF previo.id IS NOT NULL AND previo.documento IS DISTINCT FROM doc THEN RAISE EXCEPTION 'Revisá el registro después de cambiar la factura'; END IF;
 END IF;
 -- Devolver carga física pendiente sigue disponible aun si la factura cambió,
 -- fue anulada o cambió su ruta. Se descarga la foto que se cargó, no la nueva.
 usar:=CASE WHEN NEW.accion IN ('descarga','incidencia') AND previo.id IS NOT NULL THEN previo.documento ELSE doc END;
 IF NEW.documento IS DISTINCT FROM usar THEN RAISE EXCEPTION 'El documento operativo no corresponde'; END IF;
 calculado:=entrega_calcular_saldos(usar,COALESCE(previo.saldos,'[]'),NEW.accion,NEW.solicitud->'lineas');
 IF NEW.saldos IS DISTINCT FROM calculado THEN RAISE EXCEPTION 'Las cantidades físicas no corresponden al evento'; END IF;
 -- La fecha es SIEMPRE del servidor, aunque se inserte desde otra ruta.
 NEW.fecha:=CURRENT_TIMESTAMP;
 RETURN NEW;
END $$;
