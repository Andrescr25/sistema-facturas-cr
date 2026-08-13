/**
 * Costo derivado de las facturas de proveedor — fuente única.
 *
 * Antes cada consumidor (tablero de rentabilidad, simulador de precios,
 * script que escribe costos a Alegra) hacía su propio
 * `DISTINCT ON (alegra_item_id) ... ORDER BY fecha DESC`, o sea "la fila más
 * reciente de costo_historico". Dos defectos reales, medidos sobre los datos
 * de producción:
 *
 *  1. `costo_historico` conserva filas cuya línea de factura ya NO está
 *     relacionada con ese producto. Nada las borra cuando se deshace o se
 *     cambia una relación — la tabla solo la escribe el backfill. Caso real:
 *     EXTENSION CTE BLANCA 3 MTS mostraba ₡3.740 porque la fila más reciente
 *     venía de una línea "EXTESION ELECTRICA 4.5 MTRS" de otro proveedor,
 *     en estado PENDIENTE y sin apuntar a ningún producto. El costo real,
 *     según sus 6 facturas de F&G, es ₡1.164.
 *
 *  2. Aunque la relación sea válida, una sola compra con el factor de
 *     conversión mal puesto (costo por caja donde debería ir por unidad, o
 *     al revés) desplaza el costo entero. Filtrar por relación válida arregla
 *     4 de 38 casos; los otros 34 son este problema.
 *
 * Por eso el costo devuelto es la MEDIANA de las últimas VENTANA_ENTRADAS
 * compras válidas, no la última: una compra rara no mueve la mediana, y hacen
 * falta 3+ compras con el mismo error para desplazarla.
 *
 * El costo devuelto viene CON IVA, igual que `alegra_products_cache.cost`
 * (ver la asimetría documentada en ./auditoria.js).
 *
 * Contrapartida asumida: si un proveedor sube el precio de verdad, la mediana
 * tarda en reflejarlo (con compras mensuales, ~3 meses en moverse del todo).
 * Se acepta porque el error que evita es de órdenes de magnitud y el que
 * introduce es de porcentajes; además `costoReciente` y `historialInestable`
 * quedan expuestos para poder mostrar la diferencia.
 */

const { query } = require('../../../config/database');

// Últimas N compras válidas sobre las que se calcula la mediana.
const VENTANA_ENTRADAS = 6;
// A partir de acá se considera que el historial se contradice a sí mismo.
const DESVIO_INESTABLE = 0.5;
// Con menos de 3 compras la mediana no defiende de nada: dos datos y uno malo
// la desplazan igual, así que no se marca inestabilidad con tan poca evidencia.
const MINIMO_PARA_JUZGAR = 3;

/**
 * Una fila de costo_historico solo cuenta si su línea de factura sigue
 * relacionada Y sigue apuntando a este mismo producto. Sin las dos
 * condiciones entran costos de productos ajenos.
 */
const SQL_COSTO_DERIVADO = `
  WITH validas AS (
    SELECT ch.alegra_item_id,
           ch.costo_unitario,
           ch.fecha,
           ROW_NUMBER() OVER (PARTITION BY ch.alegra_item_id ORDER BY ch.fecha DESC) AS rn
    FROM costo_historico ch
    JOIN productos_factura_proveedor pf ON pf.id = ch.producto_factura_id
    WHERE pf.estado_relacionado = 'RELACIONADO'
      AND pf.alegra_item_id::text = ch.alegra_item_id
  )
  SELECT alegra_item_id,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY costo_unitario) AS costo_mediana,
         MAX(costo_unitario) FILTER (WHERE rn = 1) AS costo_reciente,
         MAX(fecha) AS fecha_ultima,
         COUNT(*)::int AS entradas
  FROM validas
  WHERE rn <= ${VENTANA_ENTRADAS}
  GROUP BY alegra_item_id
`;

/**
 * @returns {Promise<Map<string, {costo: number, costoReciente: number,
 *   fechaUltima: Date, entradas: number, historialInestable: boolean}>>}
 *   indexado por alegra_item_id (string).
 */
async function obtenerCostosDerivados() {
  const res = await query(SQL_COSTO_DERIVADO);
  const mapa = new Map();

  for (const r of res.rows) {
    const mediana = Number(r.costo_mediana);
    const reciente = Number(r.costo_reciente);
    if (!Number.isFinite(mediana) || mediana <= 0) continue;

    const desvio = Number.isFinite(reciente) && mediana > 0
      ? Math.abs(reciente - mediana) / mediana
      : 0;

    mapa.set(String(r.alegra_item_id), {
      costo: mediana,
      costoReciente: Number.isFinite(reciente) ? reciente : mediana,
      fechaUltima: r.fecha_ultima,
      entradas: r.entradas,
      historialInestable: r.entradas >= MINIMO_PARA_JUZGAR && desvio > DESVIO_INESTABLE
    });
  }

  return mapa;
}

module.exports = {
  obtenerCostosDerivados,
  SQL_COSTO_DERIVADO,
  VENTANA_ENTRADAS,
  DESVIO_INESTABLE,
  MINIMO_PARA_JUZGAR
};
