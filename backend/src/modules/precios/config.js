/**
 * Acceso a config_precios (margen meta/mínimo por categoría) — Fase 2 de la
 * estrategia de precios. Una sola query trae toda la config a un Map; con
 * 18-19 categorías no vale la pena una query por producto cuando se
 * procesa el catálogo entero (script de prueba en seco, futuros
 * recálculos masivos).
 */

const { query } = require('../../../config/database');

const CATEGORIA_DEFAULT = '__default__';

/**
 * @returns {Promise<Map<string, {margenMeta: number, margenMinimo: number}>>}
 */
async function obtenerConfigPrecios() {
  const res = await query('SELECT categoria, margen_meta, margen_minimo FROM config_precios');
  return new Map(res.rows.map(r => [r.categoria, { margenMeta: Number(r.margen_meta), margenMinimo: Number(r.margen_minimo) }]));
}

/**
 * Resuelve la config de una categoría contra un Map ya cargado (ver
 * obtenerConfigPrecios), cayendo a CATEGORIA_DEFAULT si la categoría no
 * tiene fila propia (categoría nueva en Alegra, vacía, etc).
 */
function resolverConfig(configMap, categoria) {
  return configMap.get(categoria) || configMap.get(CATEGORIA_DEFAULT) || { margenMeta: 25, margenMinimo: 12 };
}

module.exports = { obtenerConfigPrecios, resolverConfig, CATEGORIA_DEFAULT };
