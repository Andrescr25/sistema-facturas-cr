const { query } = require('../../../config/database');
const { COLUMNAS_CICLO, JOIN_CICLO, aCiclo, filtrarCiclo } = require('./documentosCiclo.service');
const { ubicacionMaps } = require('./rutas.validacion');
const { httpError } = require('../../utils/validacion');

// Bodega y reportes leen el recorrido FIJO del documento. Nunca la ruta de
// la ficha actual, ni una semana deducida de la fecha de facturación.
function filtrosOperacion({ rutaId, cicloId } = {}, where = [], params = []) {
  for (const v of [rutaId, cicloId]) {
    if (v != null && v !== '' && v !== 'sin-ciclo' &&
      (!((typeof v === 'string' && /^[1-9]\d*$/.test(v)) || (typeof v === 'number' && Number.isSafeInteger(v) && v > 0)) || Number(v)>2147483647)) {
      throw httpError(400, 'Ruta o ciclo inválido.');
    }
  }
  filtrarCiclo({ rutaId, cicloId }, where, v => { params.push(v); return '$' + params.length; });
  return { where, params };
}
async function listarCiclos() {
  const { rows } = await query(`SELECT id, ruta_id AS "rutaId", ruta_nombre AS "rutaNombre", semana::text, estado
    FROM ciclo_ruta WHERE recorrido_fijado ORDER BY semana DESC, id DESC`);
  // Disponible por el permiso de CADA módulo, sin requerir permiso Clientes
  // ni entregar paradas, Maps, cuentas o saldos en los selectores.
  return rows;
}
function contextoDocumento(fila) {
  let maps = null;
  try { if (fila.ubicacion_maps) maps = ubicacionMaps(fila.ubicacion_maps) } catch { /* dato ajeno al flujo validado: no abrir un enlace inseguro */ }
  return { ciclo: aCiclo(fila), anticipado: fila.preventa_anticipada === true,
    ubicacion_maps: maps };
}
module.exports = { COLUMNAS_CICLO, JOIN_CICLO, contextoDocumento, filtrosOperacion, listarCiclos };
