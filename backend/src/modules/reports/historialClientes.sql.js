const { AHORA_CR_SQL } = require('../../utils/fechaCR');
const { httpError } = require('../../utils/validacion');

function vistaReporteClientes(valor) {
  if (valor === undefined || valor === '') return 'activos';
  if (valor !== 'activos' && valor !== 'historial') throw httpError(400, 'Vista de Reporte Clientes inválida.');
  return valor;
}

// Se calcula al consultar: cumplir 24 h no depende de cron ni borra datos.
// Las columnas antiguas son horas CR sin zona; comparar con now() a secas
// las interpretaría según la sesión del pooler (y movería el corte seis horas).
const MOVIMIENTOS_REPORTE = `WITH movimientos_reporte AS (
  SELECT f.factura_propia_id,
         MAX(GREATEST(f.created_at, f.updated_at, aj.created_at, aj.updated_at)) AS ultima_gestion,
         BOOL_AND(f.estado = 'procesado') AS todos_procesados
    FROM faltantes f
    LEFT JOIN faltantes_ajustes aj ON aj.faltante_id = f.id
   WHERE f.estado IN ('pendiente', 'procesado') AND f.tipo_faltante <> 'completo'
     AND f.cantidad_faltante > 0
   GROUP BY f.factura_propia_id
)`;

const JOIN_HISTORIAL_REPORTE = `
  JOIN movimientos_reporte mr ON mr.factura_propia_id = fa.id
  LEFT JOIN LATERAL (
    SELECT GREATEST(fr.fecha_creacion, fr.fecha_procesamiento, mr.ultima_gestion, fa.actualizado_en, fa.bodega_procesado_en) AS ultima_gestion,
           -- Procesado en los faltantes también prueba el envío si una cola
           -- antigua ya no existe. Recuperar una procesada conserva su fila
           -- vieja, pero no vuelve al historial hasta enviarse otra vez.
           (COALESCE(fr.estado = 'pendiente', FALSE) OR mr.todos_procesados) AS enviada
  ) actividad ON TRUE
  LEFT JOIN LATERAL (
    SELECT actividad.enviada AND actividad.ultima_gestion + INTERVAL '24 hours' <= ${AHORA_CR_SQL} AS en_historial,
           CASE WHEN actividad.enviada THEN actividad.ultima_gestion + INTERVAL '24 hours' END AS historial_desde
  ) archivo ON TRUE`;

module.exports = { vistaReporteClientes, MOVIMIENTOS_REPORTE, JOIN_HISTORIAL_REPORTE };
