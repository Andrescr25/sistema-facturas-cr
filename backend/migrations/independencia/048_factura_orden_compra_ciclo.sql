-- Vincular un comprobante NO registra compra ni recepción física.
-- Se conservan las cantidades que se revisaron aunque cambie el buzón/mapeo.
CREATE TABLE orden_compra_ciclo_factura (
  id UUID PRIMARY KEY,
  secuencia BIGSERIAL UNIQUE NOT NULL,
  orden_id INTEGER NOT NULL REFERENCES orden_compra_ciclo(id),
  factura_id UUID NOT NULL REFERENCES facturas_proveedores(id),
  solicitud JSONB NOT NULL,
  documento JSONB NOT NULL CHECK(jsonb_typeof(documento)='object'),
  lineas JSONB NOT NULL CHECK(jsonb_typeof(lineas)='array' AND jsonb_array_length(lineas) BETWEEN 1 AND 2000),
  firma CHAR(64) NOT NULL CHECK(firma ~ '^[a-f0-9]{64}$'),
  estado VARCHAR(12) NOT NULL DEFAULT 'vigente' CHECK(estado IN ('vigente','retirada')),
  creado_por INTEGER REFERENCES usuario(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retirado_por INTEGER REFERENCES usuario(id),
  retirado_en TIMESTAMPTZ,
  motivo TEXT,
  CHECK((estado='vigente' AND retirado_en IS NULL AND motivo IS NULL)
    OR (estado='retirada' AND retirado_en IS NOT NULL AND motivo IS NOT NULL AND length(btrim(motivo)) BETWEEN 1 AND 1000)),
  UNIQUE(orden_id,id)
);
-- Una factura completa no se cuenta otra vez en otra orden/ciclo. Si el
-- proveedor factura varias órdenes juntas se necesita una asignación por
-- línea/cantidad; no se deduce por nombre, fecha ni total.
CREATE UNIQUE INDEX orden_factura_un_vinculo ON orden_compra_ciclo_factura(factura_id) WHERE estado='vigente';

CREATE TABLE orden_compra_ciclo_factura_pdf (
  id UUID PRIMARY KEY,
  secuencia BIGSERIAL UNIQUE NOT NULL,
  vinculo_id UUID NOT NULL REFERENCES orden_compra_ciclo_factura(id),
  tipo VARCHAR(24) NOT NULL CHECK(tipo IN ('original_adjuntado','representacion_buzon')),
  ruta TEXT NOT NULL UNIQUE CHECK(ruta ~ '^ordenes-facturas/[a-z0-9-]+\.pdf$'),
  sha256 CHAR(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 5 AND 5242880),
  creado_por INTEGER REFERENCES usuario(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE FUNCTION proteger_factura_orden_ciclo() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE o orden_compra_ciclo%ROWTYPE; f facturas_proveedores%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'La factura vinculada conserva su historial'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO o FROM orden_compra_ciclo WHERE id=NEW.orden_id FOR SHARE;
    SELECT * INTO f FROM facturas_proveedores WHERE id=NEW.factura_id FOR SHARE;
    IF o.estado IS DISTINCT FROM 'enviada' OR NEW.estado<>'vigente'
      OR NULLIF(regexp_replace(upper(o.proveedor_cedula),'[^A-Z0-9]','','g'),'') IS NULL
      OR regexp_replace(upper(o.proveedor_cedula),'[^A-Z0-9]','','g') IS DISTINCT FROM regexp_replace(upper(f.proveedor_cedula),'[^A-Z0-9]','','g')
      OR f.clave !~ '^[0-9]{50}$' OR f.estado::text NOT IN ('RECIBIDA','PROCESADA','RELACIONADA','ENVIADA')
      OR NEW.documento->>'id' IS DISTINCT FROM f.id::text
      OR NEW.documento->>'clave' IS DISTINCT FROM f.clave
      THEN RAISE EXCEPTION 'El comprobante debe corresponder al proveedor y a una orden enviada'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.estado<>'vigente' OR NEW.estado<>'retirada'
    OR (to_jsonb(OLD)-ARRAY['estado','retirado_por','retirado_en','motivo']) IS DISTINCT FROM
       (to_jsonb(NEW)-ARRAY['estado','retirado_por','retirado_en','motivo'])
    THEN RAISE EXCEPTION 'La comparación original es inmutable; retirala con motivo para corregir el vínculo'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orden_factura_historial BEFORE INSERT OR UPDATE OR DELETE ON orden_compra_ciclo_factura
  FOR EACH ROW EXECUTE FUNCTION proteger_factura_orden_ciclo();

CREATE FUNCTION proteger_pdf_factura_orden() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'El PDF vinculado conserva sus bytes e historial'; END IF;
  IF NOT EXISTS(SELECT 1 FROM orden_compra_ciclo_factura WHERE id=NEW.vinculo_id AND estado='vigente')
    THEN RAISE EXCEPTION 'El PDF requiere un vínculo vigente'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orden_factura_pdf_historial BEFORE INSERT OR UPDATE OR DELETE ON orden_compra_ciclo_factura_pdf
  FOR EACH ROW EXECUTE FUNCTION proteger_pdf_factura_orden();
