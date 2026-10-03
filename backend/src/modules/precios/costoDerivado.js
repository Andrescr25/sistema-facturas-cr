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
 *
 * EL COSTO ES DE UN `producto.id` (sección 13 del checklist, 2026-10-03).
 * Hasta acá el mapa se llaveaba por el id de Alegra. `costo_historico` tiene
 * los dos (`producto_id` desde la migración 005) y el que manda es el propio.
 *
 * LO QUE TODAVÍA ES DE ALEGRA, y por qué no se toca acá: la condición de
 * validez compara dos ids de Alegra entre sí —el de la fila y el de la línea
 * del buzón (`productos_factura_proveedor.alegra_item_id`)—. El buzón sigue
 * guardando la relación así; migrar eso es de Relacionar Productos. Los dos
 * lados de esa comparación son del mismo espacio, así que no se mezcla nada.
 * La consecuencia: un producto creado en el sistema, SIN ficha en Alegra,
 * todavía no puede relacionarse con una línea del proveedor, así que no tiene
 * costo derivado. Su margen sale del costo de su ficha (`costo_con_iva`).
 *
 * LAS ÚLTIMAS N, SIN SORTEO. Dos compras del mismo día empataban en el orden
 * y Postgres elegía cuál entraba a la ventana como le caía: medido, 6 de
 * 1.356 productos cambiaban de costo entre una consulta y otra (LLAVE DE PASO
 * CTE PLASTICA, ₡333,35 o ₡333,18). El desempate por `id` lo deja fijo.
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
    SELECT ch.producto_id,
           ch.costo_unitario,
           ch.fecha,
           ROW_NUMBER() OVER (PARTITION BY ch.producto_id ORDER BY ch.fecha DESC, ch.id DESC) AS rn
    FROM costo_historico ch
    JOIN productos_factura_proveedor pf ON pf.id = ch.producto_factura_id
    WHERE pf.estado_relacionado = 'RELACIONADO'
      AND pf.alegra_item_id::text = ch.alegra_item_id
      AND ch.producto_id IS NOT NULL
  )
  SELECT producto_id,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY costo_unitario) AS costo_mediana,
         MAX(costo_unitario) FILTER (WHERE rn = 1) AS costo_reciente,
         MAX(fecha) AS fecha_ultima,
         COUNT(*)::int AS entradas
  FROM validas
  WHERE rn <= ${VENTANA_ENTRADAS}
  GROUP BY producto_id
`;

/** Una fila de la consulta, en la forma que usan los consumidores; o null. */
function comoCosto(r) {
  const mediana = Number(r.costo_mediana);
  const reciente = Number(r.costo_reciente);
  if (!Number.isFinite(mediana) || mediana <= 0) return null;

  const desvio = Number.isFinite(reciente) && mediana > 0
    ? Math.abs(reciente - mediana) / mediana
    : 0;

  return {
    costo: mediana,
    costoReciente: Number.isFinite(reciente) ? reciente : mediana,
    fechaUltima: r.fecha_ultima,
    entradas: r.entradas,
    historialInestable: r.entradas >= MINIMO_PARA_JUZGAR && desvio > DESVIO_INESTABLE
  };
}

/**
 * @returns {Promise<Map<number, {costo: number, costoReciente: number,
 *   fechaUltima: Date, entradas: number, historialInestable: boolean}>>}
 *   indexado por `producto.id` (NÚMERO). No es el id de Alegra: buscar acá
 *   con uno devuelve el costo de otro producto, o nada.
 */
async function obtenerCostosDerivados() {
  const res = await query(SQL_COSTO_DERIVADO);
  const mapa = new Map();
  for (const r of res.rows) {
    const costo = comoCosto(r);
    if (costo) mapa.set(Number(r.producto_id), costo);
  }
  return mapa;
}

/**
 * El mismo costo, indexado por el id de ALEGRA (texto).
 *
 * SOLO para los tres scripts que todavía recorren `alegra_products_cache`
 * (simular-precios, auditar-costos y actualizar-costos-alegra). Se va con
 * ellos y con esa tabla (sección 16). Nada del sistema en marcha lo usa.
 */
async function obtenerCostosDerivadosPorAlegra() {
  const res = await query(`
    SELECT p.alegra_id, c.*
      FROM (${SQL_COSTO_DERIVADO}) c
      JOIN producto p ON p.id = c.producto_id
     WHERE p.alegra_id IS NOT NULL
  `);
  const mapa = new Map();
  for (const r of res.rows) {
    const costo = comoCosto(r);
    if (costo) mapa.set(String(r.alegra_id), costo);
  }
  return mapa;
}

module.exports = {
  obtenerCostosDerivados,
  obtenerCostosDerivadosPorAlegra,
  SQL_COSTO_DERIVADO,
  VENTANA_ENTRADAS,
  DESVIO_INESTABLE,
  MINIMO_PARA_JUZGAR
};
