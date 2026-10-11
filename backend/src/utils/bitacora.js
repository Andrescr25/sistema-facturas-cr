/**
 * Bitácora de cambios: quién cambió qué y cuándo.
 *
 * Alegra lleva hoy el historial de cada producto y documento. Al editar en
 * nuestra base eso se pierde si no se guarda acá. Toda operación que cree,
 * edite, desactive o anule algo registra una línea.
 *
 * Recibe el `ejecutor` (el pool o el cliente de una transacción) para que la
 * línea de bitácora entre en la MISMA transacción que el cambio: si el cambio
 * se revierte, su registro también. Una bitácora que dice que algo cambió
 * cuando no cambió es peor que no tenerla.
 */

// Campos que cambian solos en cada guardado y no dicen nada de lo que hizo
// una persona.
const CAMPOS_IGNORADOS = new Set([
  'updated_at', 'updatedAt', 'actualizado_en', 'search_text', 'searchText'
]);

/** Solo lo que cambió: { campo: [antes, después] }. */
function diferencias(antes, despues) {
  const cambios = {};
  const claves = new Set([...Object.keys(antes || {}), ...Object.keys(despues || {})]);
  for (const campo of claves) {
    if (CAMPOS_IGNORADOS.has(campo)) continue;
    const a = antes?.[campo] ?? null;
    const d = despues?.[campo] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(d)) cambios[campo] = [a, d];
  }
  return cambios;
}

/**
 * El id del usuario llega de `req.usuario.id`, que sale del `sub` del token y
 * es texto ("4"). La columna es numérica: se convierte acá una sola vez en vez
 * de confiar en que cada módulo se acuerde.
 */
function aUsuarioId(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`bitácora: usuarioId inválido (${valor})`);
  return n;
}

/**
 * @param {{query: Function}} ejecutor pool de pg o cliente de una transacción
 * @returns {Promise<number|null>} id de la línea, o null si una edición no cambió nada
 */
async function registrarCambio(ejecutor, {
  entidad, entidadId, accion, antes = null, despues = null, usuarioId = null, motivo = null
}) {
  if (!entidad || entidadId === undefined || entidadId === null || entidadId === '' || !accion) {
    throw new Error('bitácora: hacen falta entidad, entidadId y acción');
  }

  const usuario = aUsuarioId(usuarioId);

  let cambios = null;
  if (accion === 'editar') {
    cambios = diferencias(antes, despues);
    // Guardar sin cambios no es una edición: no se ensucia la bitácora.
    if (Object.keys(cambios).length === 0) return null;
  }

  const r = await ejecutor.query(
    `INSERT INTO bitacora_cambio (entidad, entidad_id, accion, antes, despues, cambios, usuario_id, motivo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      entidad, String(entidadId), accion,
      antes === null ? null : JSON.stringify(antes),
      despues === null ? null : JSON.stringify(despues),
      cambios === null ? null : JSON.stringify(cambios),
      usuario, motivo
    ]
  );
  return Number(r.rows[0].id);
}

module.exports = { registrarCambio, diferencias, CAMPOS_IGNORADOS };
