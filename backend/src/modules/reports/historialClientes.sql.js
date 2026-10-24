const { AHORA_CR_SQL } = require('../../utils/fechaCR');
const { httpError } = require('../../utils/validacion');

/**
 * PLAZOS DEL HISTORIAL (2026-10-24, pedido del usuario: «después de 24 horas
 * no se pueda recuperar la factura… y la que tenga 48 horas en el historial,
 * eliminarla»). Los mismos en Reporte Clientes y en Impresión:
 *  - 24 h: se puede recuperar. En Reporte Clientes es también cuando pasa al
 *    historial (24 h sin movimientos); en Impresión, desde que se imprimió.
 *  - 48 h en el historial: sale de él. Sale de la VISTA, nada se borra: la
 *    factura, sus faltantes y su fila de la cola siguen, y Facturación la
 *    muestra igual. Borrar faltantes los devolvería a «por pedir».
 * Lo que sigue pendiente (la cola de Impresión, los activos del reporte) no
 * tiene plazo: espera hasta que se procese.
 */
const PLAZO_RECUPERAR = `INTERVAL '24 hours'`;
const PLAZO_EN_HISTORIAL = `INTERVAL '48 hours'`;

/**
 * La fila `fr` de la cola se imprimió hace 24 h o más. Sin hora (filas viejas):
 * vencida. Sin fila (LEFT JOIN vacío): falso, nunca NULL.
 */
const impresaFueraDePlazo = (fr = 'fr') =>
  `(COALESCE(${fr}.estado = 'procesada', FALSE) AND COALESCE(${fr}.fecha_procesamiento + ${PLAZO_RECUPERAR} <= ${AHORA_CR_SQL}, TRUE))`;

function vistaReporteClientes(valor) {
  if (valor === undefined || valor === '') return 'activos';
  if (valor !== 'activos' && valor !== 'historial') throw httpError(400, 'Vista de Reporte Clientes inválida.');
  return valor;
}

/** Qué facturas entran en cada vista: el historial, solo sus primeras 48 h. */
const condicionVista = (vista) => (vista === 'historial'
  ? '(archivo.en_historial AND NOT archivo.fuera_del_historial)'
  : 'NOT archivo.en_historial');

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

// La fila más reciente de la cola de la factura `fa`: hay facturas con dos (de
// antes de que la cola reusara la suya), y un JOIN directo duplicaba cada
// producto de esas facturas en el reporte y no decía de cuál era la hora.
const ULTIMA_COLA = `
  LEFT JOIN LATERAL (
    SELECT r.id, r.estado, r.fecha_creacion, r.fecha_procesamiento
      FROM facturas_reimpresion r
     WHERE r.factura_propia_id = fa.id
     ORDER BY r.fecha_creacion DESC NULLS LAST, r.id DESC
     LIMIT 1
  ) fr ON true`;

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
    SELECT actividad.enviada AND actividad.ultima_gestion + ${PLAZO_RECUPERAR} <= ${AHORA_CR_SQL} AS en_historial,
           CASE WHEN actividad.enviada THEN actividad.ultima_gestion + ${PLAZO_RECUPERAR} END AS historial_desde,
           actividad.enviada AND actividad.ultima_gestion + ${PLAZO_RECUPERAR} + ${PLAZO_EN_HISTORIAL} <= ${AHORA_CR_SQL} AS fuera_del_historial,
           CASE WHEN actividad.enviada THEN actividad.ultima_gestion + ${PLAZO_RECUPERAR} + ${PLAZO_EN_HISTORIAL} END AS sale_del_historial
  ) archivo ON TRUE`;

module.exports = {
  PLAZO_RECUPERAR, PLAZO_EN_HISTORIAL, impresaFueraDePlazo, vistaReporteClientes, condicionVista,
  MOVIMIENTOS_REPORTE, ULTIMA_COLA, JOIN_HISTORIAL_REPORTE
};
