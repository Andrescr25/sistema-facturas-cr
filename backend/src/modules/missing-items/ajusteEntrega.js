const { httpError } = require('../../utils/validacion');

/** Una respuesta significa lo mismo en Reporte de Clientes y en Impresión. */
function validarEntrega(cantidadFaltante, { cantidadEntregada, estado, revisado }) {
  const cantidad = typeof cantidadEntregada === 'number' ||
    (typeof cantidadEntregada === 'string' && /^\d+$/.test(cantidadEntregada)) ? Number(cantidadEntregada) : NaN;
  const faltante = Number(cantidadFaltante);
  if (!Number.isSafeInteger(cantidad) || cantidad < 0 || cantidad > faltante) {
    throw httpError(400, `La cantidad entregada debe ser un entero entre 0 y ${faltante}.`);
  }
  if (!['completo', 'parcial', 'no_llego'].includes(estado)) {
    throw httpError(400, 'Elija si llegó todo, una parte o nada.');
  }
  if ((estado === 'completo' && cantidad !== faltante) ||
      (estado === 'no_llego' && cantidad !== 0) ||
      (estado === 'parcial' && (cantidad === 0 || cantidad === faltante))) {
    throw httpError(400, 'La respuesta no coincide con la cantidad entregada.');
  }
  if (revisado !== undefined && typeof revisado !== 'boolean') {
    throw httpError(400, 'La confirmación de revisión debe ser sí o no.');
  }
  return { cantidad, estado, requiereActualizacion: cantidad < faltante, revisado };
}

module.exports = { validarEntrega };
