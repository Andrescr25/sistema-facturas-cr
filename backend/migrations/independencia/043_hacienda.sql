-- Emisión fiscal separada de la venta y de los numeradores comerciales.
-- Pruebas jamás marcan una factura de producción como aceptada.
CREATE TABLE IF NOT EXISTS hacienda_configuracion (
  id SERIAL PRIMARY KEY,
  ambiente TEXT UNIQUE NOT NULL CHECK (ambiente IN ('pruebas','produccion')),
  habilitada BOOLEAN NOT NULL DEFAULT FALSE,
  datos JSONB NOT NULL DEFAULT '{}'::jsonb,
  secretos_cifrados TEXT,
  certificado JSONB,
  revision INTEGER NOT NULL DEFAULT 0,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO hacienda_configuracion (ambiente) VALUES ('pruebas'),('produccion') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS hacienda_numerador (
  id SERIAL PRIMARY KEY,
  ambiente TEXT NOT NULL REFERENCES hacienda_configuracion(ambiente),
  sucursal CHAR(3) NOT NULL CHECK(sucursal ~ '^[0-9]{3}$'),
  terminal CHAR(5) NOT NULL CHECK(terminal ~ '^[0-9]{5}$'),
  tipo CHAR(2) NOT NULL CHECK(tipo IN ('01','03','04','05','06','07')),
  siguiente BIGINT NOT NULL CHECK(siguiente BETWEEN 1 AND 9999999999),
  UNIQUE(ambiente,sucursal,terminal,tipo)
);

CREATE TABLE IF NOT EXISTS hacienda_comprobante (
  id BIGSERIAL PRIMARY KEY,
  ambiente TEXT NOT NULL REFERENCES hacienda_configuracion(ambiente),
  origen TEXT NOT NULL CHECK(origen IN ('factura','nota_credito','compra')),
  origen_id INTEGER NOT NULL,
  revision_documento INTEGER NOT NULL DEFAULT 1 CHECK(revision_documento>0),
  tipo CHAR(2) NOT NULL,
  clave VARCHAR(50) NOT NULL CHECK(clave ~ '^[0-9]{50}$'),
  consecutivo CHAR(20) NOT NULL CHECK(consecutivo ~ '^[0-9]{20}$'),
  fecha TIMESTAMPTZ NOT NULL,
  version TEXT NOT NULL DEFAULT '4.4',
  estado TEXT NOT NULL DEFAULT 'preparada' CHECK(estado IN ('preparada','enviando','incierta','recibida','procesando','aceptada','rechazada','error')),
  xml_ruta TEXT NOT NULL,
  xml_sha256 CHAR(64) NOT NULL,
  sobre JSONB NOT NULL,
  respuesta_ruta TEXT,
  respuesta_sha256 CHAR(64),
  mensaje TEXT,
  intentos INTEGER NOT NULL DEFAULT 0,
  proxima_consulta TIMESTAMPTZ NOT NULL DEFAULT now(),
  creada_por INTEGER REFERENCES usuario(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ambiente,origen,origen_id,revision_documento),
  UNIQUE(ambiente,clave,consecutivo),
  UNIQUE(ambiente,consecutivo)
);
-- Un rechazo definitivo conserva su XML y permite una sustitución explícita.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hacienda_origen_vigente ON hacienda_comprobante(ambiente,origen,origen_id) WHERE estado<>'rechazada';
CREATE INDEX IF NOT EXISTS idx_hacienda_seguimiento ON hacienda_comprobante(proxima_consulta)
 WHERE estado IN ('enviando','incierta','recibida','procesando');
ALTER TABLE hacienda_comprobante ADD COLUMN IF NOT EXISTS respuesta_sha256 CHAR(64);

-- Importados conservan un estado de ORIGEN, separado de la bandera histórica
-- de plantilla. Una plantilla electrónica no demuestra aceptación fiscal.
ALTER TABLE factura ADD COLUMN IF NOT EXISTS hacienda_origen JSONB;
ALTER TABLE factura ADD COLUMN IF NOT EXISTS plantilla_electronica BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE factura ADD COLUMN IF NOT EXISTS hacienda_comprobante_id BIGINT REFERENCES hacienda_comprobante(id);

ALTER TABLE nota_credito ADD COLUMN IF NOT EXISTS hacienda_estado VARCHAR(12);
ALTER TABLE nota_credito ADD COLUMN IF NOT EXISTS hacienda_origen JSONB;
ALTER TABLE nota_credito ADD COLUMN IF NOT EXISTS plantilla_electronica BOOLEAN NOT NULL DEFAULT FALSE;

-- La foto fiscal y sus bytes nunca se reemplazan al reintentar.
CREATE OR REPLACE FUNCTION proteger_hacienda_comprobante() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Un comprobante fiscal no se borra'; END IF;
  IF ROW(OLD.ambiente,OLD.origen,OLD.origen_id,OLD.revision_documento,OLD.tipo,OLD.clave,OLD.consecutivo,OLD.fecha,OLD.version,OLD.xml_ruta,OLD.xml_sha256,OLD.sobre)
     IS DISTINCT FROM ROW(NEW.ambiente,NEW.origen,NEW.origen_id,NEW.revision_documento,NEW.tipo,NEW.clave,NEW.consecutivo,NEW.fecha,NEW.version,NEW.xml_ruta,NEW.xml_sha256,NEW.sobre)
     THEN RAISE EXCEPTION 'La identidad y el XML de un comprobante fiscal son inmutables'; END IF;
  IF OLD.estado IN ('aceptada','rechazada') AND NEW.estado<>OLD.estado THEN
    RAISE EXCEPTION 'Una respuesta fiscal definitiva no se reemplaza';
  END IF;
  IF OLD.respuesta_ruta IS NOT NULL AND
     ROW(OLD.respuesta_ruta,OLD.respuesta_sha256) IS DISTINCT FROM ROW(NEW.respuesta_ruta,NEW.respuesta_sha256) THEN
    RAISE EXCEPTION 'La respuesta fiscal conservada es inmutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hacienda_inmutable ON hacienda_comprobante;
CREATE TRIGGER hacienda_inmutable BEFORE UPDATE OR DELETE ON hacienda_comprobante
 FOR EACH ROW EXECUTE FUNCTION proteger_hacienda_comprobante();

-- Protege también los caminos de edición ajenos a Facturación (Impresión).
CREATE OR REPLACE FUNCTION proteger_documento_en_hacienda() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_id INTEGER; v_nuevo INTEGER; v_origen TEXT;
BEGIN
  v_origen := CASE WHEN TG_TABLE_NAME LIKE 'nota_credito%' THEN 'nota_credito' ELSE 'factura' END;
  IF TG_TABLE_NAME='factura_linea' THEN
    IF TG_OP<>'INSERT' THEN v_id:=OLD.factura_id; END IF;
    IF TG_OP<>'DELETE' THEN v_nuevo:=NEW.factura_id; END IF;
    -- Serializa inserción y traslado de líneas con la reserva de la cabecera.
    PERFORM id FROM factura WHERE id IN (v_id,v_nuevo) ORDER BY id FOR UPDATE;
  ELSIF TG_TABLE_NAME='nota_credito_linea' THEN
    IF TG_OP<>'INSERT' THEN v_id:=OLD.nota_credito_id; END IF;
    IF TG_OP<>'DELETE' THEN v_nuevo:=NEW.nota_credito_id; END IF;
    PERFORM id FROM nota_credito WHERE id IN (v_id,v_nuevo) ORDER BY id FOR UPDATE;
  ELSE
    IF TG_OP<>'INSERT' THEN v_id:=OLD.id; END IF;
    IF TG_OP<>'DELETE' THEN v_nuevo:=NEW.id; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM hacienda_comprobante WHERE ambiente='produccion' AND origen=v_origen AND origen_id IN (v_id,v_nuevo) AND estado<>'rechazada')
  THEN
    IF TG_TABLE_NAME='factura' AND TG_OP='UPDATE' AND
       (to_jsonb(OLD)-ARRAY['electronica','clave_hacienda','hacienda_estado','hacienda_enviada_en','hacienda_respondida_en','hacienda_mensaje','xml_ruta','hacienda_comprobante_id','anulada_por_nota','actualizado_en'])
       = (to_jsonb(NEW)-ARRAY['electronica','clave_hacienda','hacienda_estado','hacienda_enviada_en','hacienda_respondida_en','hacienda_mensaje','xml_ruta','hacienda_comprobante_id','anulada_por_nota','actualizado_en']) THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME='nota_credito' AND TG_OP='UPDATE' AND
       (to_jsonb(OLD)-ARRAY['electronica','clave_hacienda','hacienda_estado','actualizado_en'])=(to_jsonb(NEW)-ARRAY['electronica','clave_hacienda','hacienda_estado','actualizado_en']) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Documento reservado ante Hacienda: conserve el original y use una nota fiscal';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t TEXT; BEGIN
 FOR t IN SELECT unnest(ARRAY['factura','factura_linea','nota_credito','nota_credito_linea']) LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS documento_en_hacienda ON %I',t);
  EXECUTE format('CREATE TRIGGER documento_en_hacienda BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION proteger_documento_en_hacienda()',t);
 END LOOP;
END $$;
