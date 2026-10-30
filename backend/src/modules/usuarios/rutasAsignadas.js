/**
 * Las rutas que atiende cada usuario (tabla `usuario_ruta`, migración 069).
 *
 * Para el agente de ventas (2026-10-29): «se hará cargo de las rutas poco a
 * poco». Se le marcan en su ficha de Usuarios y Preventa le muestra solo esas,
 * salvo que tenga «Ver todas las rutas» (`rutas-todas`).
 *
 * Cada cambio queda en la bitácora con quién lo hizo: es parte de saber qué
 * tenía a cargo el agente y desde cuándo.
 */
const { query } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError } = require('../../utils/validacion');

/** Ids de las rutas de un usuario. */
async function rutasDe(usuarioId) {
  const { rows } = await query('SELECT ruta_id FROM usuario_ruta WHERE usuario_id = $1 ORDER BY ruta_id', [usuarioId]);
  return rows.map(r => r.ruta_id);
}

/** Usuario → [{ id, nombre }], para la lista de Usuarios. */
async function rutasPorUsuario() {
  const { rows } = await query(
    `SELECT ur.usuario_id, r.id, r.nombre FROM usuario_ruta ur JOIN ruta_cliente r ON r.id = ur.ruta_id
      ORDER BY lower(r.nombre), r.id`);
  const porUsuario = new Map();
  for (const r of rows) {
    if (!porUsuario.has(r.usuario_id)) porUsuario.set(r.usuario_id, []);
    porUsuario.get(r.usuario_id).push({ id: r.id, nombre: r.nombre });
  }
  return porUsuario;
}

/** Reemplaza las rutas de un usuario por la lista que llega (como los módulos). */
async function guardarRutas(usuarioId, rutaIds, asignadaPor) {
  const pedidas = [...new Set((Array.isArray(rutaIds) ? rutaIds : []).map(Number))];
  if (pedidas.some(id => !Number.isSafeInteger(id) || id <= 0)) throw httpError(400, 'Hay una ruta inválida.');
  if (pedidas.length) {
    const { rows } = await query('SELECT id FROM ruta_cliente WHERE id = ANY($1::int[])', [pedidas]);
    if (rows.length !== pedidas.length) throw httpError(400, 'Alguna de esas rutas ya no existe.');
  }
  const antes = await rutasDe(usuarioId);
  const despues = [...pedidas].sort((a, b) => a - b);
  if (antes.join(',') === despues.join(',')) return despues;

  await query('DELETE FROM usuario_ruta WHERE usuario_id = $1', [usuarioId]);
  if (despues.length) {
    await query(
      `INSERT INTO usuario_ruta (usuario_id, ruta_id, asignada_por)
       SELECT $1, unnest($2::int[]), $3`, [usuarioId, despues, asignadaPor || null]);
  }
  await registrarCambio({ query }, {
    entidad: 'usuario', entidadId: usuarioId, accion: 'editar',
    antes: { rutas: antes }, despues: { rutas: despues }, usuarioId: asignadaPor
  });
  return despues;
}

module.exports = { rutasDe, rutasPorUsuario, guardarRutas };
