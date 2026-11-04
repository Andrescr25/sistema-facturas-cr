/**
 * Bitácora de cambios: quién cambió qué y cuándo.
 *
 * El maestro propio conserva el historial de cada producto y documento en
 * esta tabla. Toda operación que cree,
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

/** Validar todo antes de enviar un INSERT, tanto individual como en lote. */
function entradaDeCambio({
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

  return { entidad, entidad_id: String(entidadId), accion, antes, despues, cambios, usuario_id: usuario, motivo };
}

/** @returns {Promise<number|null>} id de la línea, o null si no hubo edición. */
async function registrarCambio(ejecutor, datos) {
  const fila = entradaDeCambio(datos);
  if (!fila) return null;
  const r = await ejecutor.query(
    `INSERT INTO bitacora_cambio (entidad, entidad_id, accion, antes, despues, cambios, usuario_id, motivo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      fila.entidad, fila.entidad_id, fila.accion,
      fila.antes === null ? null : JSON.stringify(fila.antes),
      fila.despues === null ? null : JSON.stringify(fila.despues),
      fila.cambios === null ? null : JSON.stringify(fila.cambios),
      fila.usuario_id, fila.motivo
    ]
  );
  return Number(r.rows[0].id);
}

/** Una ida a la base para todo el lote, con las mismas reglas que una ficha. */
async function registrarCambios(ejecutor, entradas) {
  if (!Array.isArray(entradas)) throw new Error('bitácora: hace falta una lista de cambios');
  const filas = entradas.map(entradaDeCambio).filter(Boolean);
  if (!filas.length) return [];
  const r = await ejecutor.query(
    `INSERT INTO bitacora_cambio (entidad, entidad_id, accion, antes, despues, cambios, usuario_id, motivo)
     SELECT entidad, entidad_id, accion, antes, despues, cambios, usuario_id, motivo
       FROM jsonb_to_recordset($1::jsonb) AS fila(
         entidad text, entidad_id text, accion text, antes jsonb, despues jsonb,
         cambios jsonb, usuario_id integer, motivo text)
     RETURNING id`,
    [JSON.stringify(filas)]
  );
  return r.rows.map(fila => Number(fila.id));
}

module.exports = { registrarCambio, registrarCambios, diferencias, CAMPOS_IGNORADOS };
