-- El vínculo apunta al recorrido fijo, nunca a la ruta actual del maestro.
-- Los documentos anteriores quedan NULL: su semana no se puede adivinar.
ALTER TABLE pedido_cliente ADD COLUMN ciclo_ruta_cliente_id INTEGER REFERENCES ciclo_ruta_cliente(id);
ALTER TABLE pedido_cliente ADD COLUMN preventa_anticipada BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE factura ADD COLUMN ciclo_ruta_cliente_id INTEGER REFERENCES ciclo_ruta_cliente(id);
ALTER TABLE factura ADD COLUMN preventa_anticipada BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX pedido_por_ciclo ON pedido_cliente(ciclo_ruta_cliente_id);
CREATE INDEX factura_por_ciclo ON factura(ciclo_ruta_cliente_id);
CREATE INDEX ciclo_recorrido_por_cliente ON ciclo_ruta_cliente(cliente_id,ciclo_id);

CREATE FUNCTION proteger_contexto_ciclo_documento() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.ciclo_ruta_cliente_id IS NOT NULL THEN
      RAISE EXCEPTION 'El documento del ciclo conserva su historial';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND ROW(OLD.ciclo_ruta_cliente_id, OLD.preventa_anticipada)
      IS DISTINCT FROM ROW(NEW.ciclo_ruta_cliente_id, NEW.preventa_anticipada) THEN
    RAISE EXCEPTION 'El contexto de un documento no se reclasifica';
  END IF;
  IF NEW.preventa_anticipada AND NEW.ciclo_ruta_cliente_id IS NULL THEN
    RAISE EXCEPTION 'La preventa anticipada requiere un ciclo';
  END IF;
  IF NEW.ciclo_ruta_cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ciclo_ruta_cliente rc JOIN ciclo_ruta c ON c.id=rc.ciclo_id
    WHERE rc.id=NEW.ciclo_ruta_cliente_id AND rc.cliente_id=NEW.cliente_id AND c.recorrido_fijado
  ) THEN RAISE EXCEPTION 'El cliente debe pertenecer al recorrido fijo del ciclo'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pedido_contexto_ciclo BEFORE INSERT OR UPDATE OR DELETE ON pedido_cliente
  FOR EACH ROW EXECUTE FUNCTION proteger_contexto_ciclo_documento();
CREATE TRIGGER factura_contexto_ciclo BEFORE INSERT OR UPDATE OR DELETE ON factura
  FOR EACH ROW EXECUTE FUNCTION proteger_contexto_ciclo_documento();
