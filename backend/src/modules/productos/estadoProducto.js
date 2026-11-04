/** Una misma validación y acción para la ficha y las selecciones del catálogo. */
const { booleano, httpError } = require('../../utils/validacion');

function cambiosDeEstado({ activo, oculto } = {}) {
  const cambios = {};
  if (activo !== undefined) cambios.activo = booleano(activo, 'Activo');
  if (oculto !== undefined) cambios.oculto = booleano(oculto, 'Oculto');
  if (Object.keys(cambios).length === 0) throw httpError(400, 'Hay que indicar activo u oculto.');
  return cambios;
}

function accionDeEstado(antes, despues) {
  if (antes.activo !== despues.activo) return despues.activo ? 'activar' : 'desactivar';
  if (antes.oculto !== despues.oculto) return despues.oculto ? 'ocultar' : 'mostrar';
  return null;
}

module.exports = { cambiosDeEstado, accionDeEstado };
