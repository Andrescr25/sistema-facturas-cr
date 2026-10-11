-- Archivo por consulta, sin borrar ni modificar documentos recibidos.
-- INTERVAL '24 hours' mide horas transcurridas incluso al cambiar de zona/día.
CREATE VIEW orden_compra_ciclo_operativa AS
SELECT o.*,
  CASE WHEN o.estado='recibida' THEN o.recepcion_completa_en + INTERVAL '24 hours' END AS archivo_programado_en,
  COALESCE(o.estado='recibida' AND o.recepcion_completa_en <= CURRENT_TIMESTAMP - INTERVAL '24 hours', FALSE) AS archivada,
  CASE WHEN o.estado='recibida' AND o.recepcion_completa_en <= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    THEN o.recepcion_completa_en + INTERVAL '24 hours' END AS archivada_en
FROM orden_compra_ciclo o;

-- Solo compatibilidad de consulta del envío anterior. Conservar cualquier
-- corte histórico ya anotado; ningún arranque/GET vuelve a crear o reiniciar.
CREATE TABLE IF NOT EXISTS ciclo_pedidos (
  id SMALLINT PRIMARY KEY,
  reiniciado_en TIMESTAMP NOT NULL
);
