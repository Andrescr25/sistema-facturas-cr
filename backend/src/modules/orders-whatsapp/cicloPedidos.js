/** Consulta de envíos históricos. No reiniciar por lunes/domingo.
 * SQL050 conserva la tabla y el último corte ya existente. Sin corte, leer
 * toda la historia; el contexto nuevo pertenece a cada orden/ciclo propio.
 */
const { httpError } = require('../../utils/validacion');
const SQL_INICIO_CICLO = `COALESCE(
  (SELECT reiniciado_en FROM ciclo_pedidos WHERE id = 1),
  '-infinity'::timestamp
)`;
async function reiniciar() {
  throw httpError(410, 'El reinicio global de pedidos fue retirado. Cada ruta conserva su ciclo.');
}
module.exports = { SQL_INICIO_CICLO, reiniciar };
