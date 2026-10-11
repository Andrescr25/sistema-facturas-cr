/**
 * Respuesta para un error que llegó al manejador global de Express.
 *
 * Antes todo salía como 500 "Error interno", también un JSON mal formado, que
 * es un error de quien llama y no del servidor. Un 500 hace creer que el
 * sistema se cayó y no dice qué corregir.
 *
 * - JSON que no se puede leer → 400 con un mensaje que lo dice.
 * - Otros errores con un código 4xx propio (cuerpo demasiado grande, etc.)
 *   → ese código.
 * - Lo demás → 500, sin mostrar el detalle fuera de desarrollo.
 */
function respuestaDeError(err, { desarrollo = false } = {}) {
  if (err && err.type === 'entity.parse.failed') {
    return { status: 400, cuerpo: { success: false, error: 'El cuerpo de la petición no es un JSON válido.', message: 'El cuerpo de la petición no es un JSON válido.' } };
  }
  const status = Number(err?.status || err?.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    const mensaje = err.expose === false ? 'La petición no es válida.' : (err.message || 'La petición no es válida.');
    return { status, cuerpo: { success: false, error: mensaje, message: mensaje } };
  }
  return {
    status: 500,
    cuerpo: { success: false, error: 'Error interno del servidor', message: desarrollo ? String(err?.message || err) : 'Error interno' }
  };
}

module.exports = { respuestaDeError };
