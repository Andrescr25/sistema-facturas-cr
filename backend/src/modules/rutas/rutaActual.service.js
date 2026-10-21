const { query } = require('../../../config/database');
const { httpError } = require('../../utils/validacion');

/** La ruta de la ficha, compartida por Reporte Clientes y la agenda.
 * No expone ubicaciones en el selector de rutas.
 */
function filtroRutaActual(rutaId, params) {
  if (rutaId == null || rutaId === '') return '';
  if (rutaId === 'sin-ruta') return 'AND c.ruta_id IS NULL';
  if (!((typeof rutaId === 'string' && /^[1-9]\d*$/.test(rutaId)) ||
    (typeof rutaId === 'number' && Number.isSafeInteger(rutaId) && rutaId > 0)) || Number(rutaId) > 2147483647) {
    throw httpError(400, 'Ruta inválida.');
  }
  params.push(Number(rutaId));
  return `AND c.ruta_id=$${params.length}`;
}

/** Las rutas inactivas con fichas asignadas siguen siendo consultables. */
async function listarRutasActuales() {
  return (await query(`SELECT r.id, r.nombre, r.activo FROM ruta_cliente r
    WHERE r.activo OR EXISTS(SELECT 1 FROM cliente c WHERE c.ruta_id=r.id)
    ORDER BY lower(r.nombre), r.id`)).rows;
}

module.exports = { filtroRutaActual, listarRutasActuales };
