/** Compatibilidad retirada: no cargar cron, base ni servicios de borrado.
 * Decisión 2026-10-05: conservar ciclos e historia; archivo individual SQL050.
 * Mantener este archivo permite que lanzadores antiguos lo resuelvan sin
 * poder programar ni ejecutar la limpieza global.
 */
const { httpError } = require('../src/utils/validacion');
async function retirada() {
  throw httpError(410, 'La limpieza global fue retirada. Las órdenes recibidas pasan al historial a las 24 horas.');
}
module.exports = {
  iniciarLimpiezaProgramada: retirada,
  ejecutarLimpiezaFaltantes: retirada,
  reiniciarAsignacionesManuales: retirada
};
