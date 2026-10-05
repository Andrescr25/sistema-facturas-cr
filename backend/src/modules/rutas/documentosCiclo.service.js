const { query } = require('../../../config/database');
const { idValido, httpError } = require('../../utils/validacion');

// Lista blanca: ni Maps, ni el resto de las paradas, ni datos financieros.
const COLUMNAS_CICLO = `cr.id AS ciclo_id, cr.ruta_id AS ciclo_ruta_id,
  cr.ruta_nombre AS ciclo_ruta_nombre, cr.semana::text AS ciclo_semana, rc.orden AS ciclo_orden`;
const JOIN_CICLO = alias => `LEFT JOIN ciclo_ruta_cliente rc ON rc.id=${alias}.ciclo_ruta_cliente_id
  LEFT JOIN ciclo_ruta cr ON cr.id=rc.ciclo_id`;
function aCiclo(fila) {
  return fila.ciclo_id ? { id: fila.ciclo_id, rutaId: fila.ciclo_ruta_id,
    rutaNombre: fila.ciclo_ruta_nombre, semana: fila.ciclo_semana, orden: fila.ciclo_orden } : null;
}
async function disponibles(clienteId, db = { query }) {
  const { rows } = await db.query(`SELECT ${COLUMNAS_CICLO}, cr.estado
    FROM ciclo_ruta_cliente rc JOIN ciclo_ruta cr ON cr.id=rc.ciclo_id
    WHERE rc.cliente_id=$1 AND cr.recorrido_fijado
      AND cr.estado IN ('preventa','preparacion','entrega')
    ORDER BY cr.semana, cr.id`, [idValido(clienteId)]);
  return rows.map(r => ({ ...aCiclo(r), estado: r.estado }));
}
async function disponiblesParaClientes(ids, db = { query }) {
  if (!ids.length) return new Map();
  const { rows } = await db.query(`SELECT rc.cliente_id, ${COLUMNAS_CICLO}, cr.estado
    FROM ciclo_ruta_cliente rc JOIN ciclo_ruta cr ON cr.id=rc.ciclo_id
    WHERE rc.cliente_id=ANY($1::int[]) AND cr.recorrido_fijado
      AND cr.estado IN ('preventa','preparacion','entrega') ORDER BY cr.semana, cr.id`, [ids]);
  const mapa = new Map();
  for (const r of rows) {
    if (!mapa.has(r.cliente_id)) mapa.set(r.cliente_id, []);
    mapa.get(r.cliente_id).push({ ...aCiclo(r), estado: r.estado });
  }
  return mapa;
}
async function paraCuenta(cuentaId) {
  const { rows: [cuenta] } = await query(`SELECT cp.cliente_id FROM cliente_portal cp
    JOIN cliente c ON c.id=cp.cliente_id WHERE cp.id=$1 AND cp.activo AND c.activo`, [idValido(cuentaId)]);
  if (!cuenta) throw httpError(403, 'Su cuenta está desactivada.');
  return disponibles(cuenta.cliente_id);
}
async function validarEn(db, clienteId, cicloId) {
  // Compatibilidad: una cola antigua sigue siendo Sin ciclo. Nunca se le
  // asigna el ciclo actual al reenviarla días después.
  if (cicloId == null) return null;
  const { rows: [fila] } = await db.query(`SELECT rc.id AS recorrido_id, ${COLUMNAS_CICLO}, cr.estado
    FROM ciclo_ruta_cliente rc JOIN ciclo_ruta cr ON cr.id=rc.ciclo_id
    WHERE rc.cliente_id=$1 AND cr.id=$2 AND cr.recorrido_fijado FOR SHARE OF cr`,
    [idValido(clienteId), idValido(cicloId)]);
  if (!fila) throw httpError(400, 'El cliente no pertenece al recorrido de ese ciclo.');
  // El cierre espera a las escrituras en curso. Una cola rechazada permanece
  // pendiente y visible; nunca se traslada silenciosamente a otra semana.
  if (!['preventa','preparacion','entrega'].includes(fila.estado)) {
    throw httpError(409, 'Ese ciclo está cerrado o cancelado. El envío sigue pendiente; revise su semana antes de reenviarlo.');
  }
  return { recorridoId: fila.recorrido_id, ciclo: aCiclo(fila), estado: fila.estado };
}
function filtrarCiclo({ rutaId, cicloId }, where, agregar) {
  if (rutaId === 'sin-ciclo' || cicloId === 'sin-ciclo') {
    where.push('rc.id IS NULL');
    // Combinar "Sin ciclo" con una ruta/ciclo conocido no debe ignorar el filtro.
  }
  if (rutaId && rutaId !== 'sin-ciclo') where.push(`cr.ruta_id=${agregar(idValido(rutaId))}`);
  if (cicloId && cicloId !== 'sin-ciclo') where.push(`cr.id=${agregar(idValido(cicloId))}`);
}
module.exports = { COLUMNAS_CICLO, JOIN_CICLO, aCiclo, disponibles, disponiblesParaClientes, paraCuenta, validarEn, filtrarCiclo };
