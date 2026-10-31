/**
 * Lo que el agente puede corregir de la ficha desde la visita (2026-10-29).
 *
 * El usuario: «ocupo que el agente pueda editar la rotación, pueda asignarle
 * ubicación con punto exacto en el mapa». El agente no tiene Clientes: esto le
 * abre SOLO esos dos datos, y solo en clientes de sus rutas.
 *
 * La ubicación se guarda como siempre —un enlace de Maps en `ubicacion_maps`—,
 * pero con las coordenadas exactas del punto (`?q=lat,lng`): así sirven «Ir con
 * Waze» y la distancia del Seguimiento. Se pasa por `editarCliente`, la misma
 * edición de la pantalla de Clientes: su validación, su transacción y su
 * bitácora (con quién lo cambió, y el antes y el después).
 */
const { query } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');
const { ROTACION_MAXIMA } = require('../clientes/rotacion');
const clientes = require('../clientes/clientes.service');

// Costa Rica con margen: un punto afuera es casi seguro un error de dedo.
const LIMITES = { latMin: 8, latMax: 11.5, lngMin: -86.2, lngMax: -82.5 };

/** El enlace de Maps de un punto exacto. */
const enlaceDePunto = (lat, lng) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

/** El punto marcado en el mapa, revisado, como enlace de Maps. También lo usa «Cliente nuevo». */
function enlaceDeUbicacion(ubicacion) {
  const lat = Number(ubicacion?.latitud), lng = Number(ubicacion?.longitud);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw httpError(400, 'Marcá el punto en el mapa.');
  if (lat < LIMITES.latMin || lat > LIMITES.latMax || lng < LIMITES.lngMin || lng > LIMITES.lngMax) {
    throw httpError(400, 'Ese punto queda fuera de Costa Rica: revisá el mapa.');
  }
  return enlaceDePunto(lat, lng);
}

/** Cada cuántos días se le visita: un entero de 1 a 365. */
function rotacionValida(v) {
  const n = Number(v);
  if (v === null || v === '' || !Number.isInteger(n) || n < 1 || n > ROTACION_MAXIMA) {
    throw httpError(400, `La rotación va de 1 a ${ROTACION_MAXIMA} días.`);
  }
  return n;
}

/**
 * @param {number|string} clienteId
 * @param {{rotacionDias?: number, ubicacion?: {latitud: number, longitud: number}}} datos
 * @param {{usuarioId: number, rutasPermitidas: number[]|null}} quien
 */
async function corregirFicha(clienteId, datos = {}, { usuarioId, rutasPermitidas = null } = {}) {
  const id = idValido(clienteId);
  const { rows: [cliente] } = await query('SELECT id, activo, ruta_id FROM cliente WHERE id = $1', [id]);
  if (!cliente || !cliente.activo) throw httpError(404, 'No existe ese cliente.');
  if (rutasPermitidas && !rutasPermitidas.includes(Number(cliente.ruta_id))) {
    throw httpError(403, 'Ese cliente no es de una ruta asignada a su usuario.');
  }

  const cambios = {};
  if (datos.rotacionDias !== undefined) cambios.rotacion_dias = rotacionValida(datos.rotacionDias);
  if (datos.ubicacion !== undefined) cambios.ubicacion_maps = enlaceDeUbicacion(datos.ubicacion);
  if (Object.keys(cambios).length === 0) throw httpError(400, 'No vino nada para cambiar.');

  return clientes.editarCliente(id, cambios, usuarioId);
}

module.exports = { corregirFicha, enlaceDePunto, enlaceDeUbicacion, rotacionValida };
