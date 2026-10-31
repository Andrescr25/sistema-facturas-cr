const { MODULOS } = require('./modulos');
const { httpError } = require('../../utils/validacion');

const CLAVES_VISTA = new Set(MODULOS.map(m => m.clave));

/** Solo pantallas del menú: los permisos de acción no se ocultan. */
function limpiarModulosOcultos(lista, esAdmin) {
  if (!Array.isArray(lista) || lista.some(c => typeof c !== 'string' || !CLAVES_VISTA.has(c))) {
    throw httpError(400, 'Los módulos ocultos deben ser una lista de módulos válidos.');
  }
  if (!esAdmin && lista.length) throw httpError(400, 'Solo un administrador puede personalizar su vista de módulos.');
  return [...new Set(lista)];
}

function modulosOcultosDe(row) {
  return row.es_admin && Array.isArray(row.modulos_ocultos)
    ? row.modulos_ocultos.filter(c => CLAVES_VISTA.has(c)) : [];
}

module.exports = { limpiarModulosOcultos, modulosOcultosDe };
