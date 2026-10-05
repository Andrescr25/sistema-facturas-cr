const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, idValido, texto, booleano } = require('../../utils/validacion');
const { semanaValida } = require('./rutas.validacion');

// Mismo bloqueo ANTES de bloquear clientes en asignación, orden y ciclos.
// Evita que dos pantallas pierdan miembros o calculen el mismo último puesto.
const bloquearRutasEn = db => db.query('SELECT pg_advisory_xact_lock(44005, 1)');
const enRuta = trabajo => enTransaccion(pool, async db => { await bloquearRutasEn(db); return trabajo(db); });
const nombreValido = v => { const n = texto(120)(v, 'Nombre de ruta'); if (!n) throw httpError(400, 'Nombre de ruta: obligatorio.'); return n; };
async function rutaEn(db, id) {
  const { rows } = await db.query('SELECT * FROM ruta_cliente WHERE id=$1', [idValido(id)]);
  if (!rows[0]) throw httpError(404, 'No existe esa ruta.');
  return rows[0];
}
async function miembrosEn(db, id) {
  const { rows } = await db.query(`SELECT id, nombre, activo, orden_ruta, ubicacion_maps, dia_visita, dia_entrega,
    celular, telefono, canton, provincia FROM cliente WHERE ruta_id=$1 ORDER BY orden_ruta, id`, [id]);
  return rows;
}
async function listarRutas() {
  const { rows } = await pool.query(`SELECT r.*, COUNT(c.id)::int clientes,
    COUNT(c.id) FILTER(WHERE c.activo)::int clientes_activos FROM ruta_cliente r
    LEFT JOIN cliente c ON c.ruta_id=r.id GROUP BY r.id ORDER BY r.activo DESC, lower(r.nombre), r.id`);
  return rows;
}
async function obtenerRuta(id) {
  // Dos lecturas en una transacción para que versión y miembros sean coherentes.
  return enRuta(async db => ({ ...await rutaEn(db, id), clientes: await miembrosEn(db, idValido(id)) }));
}
async function crearRuta(datos, usuarioId) {
  const nombre = nombreValido(datos?.nombre);
  return enRuta(async db => {
    const existe = await db.query('SELECT id FROM ruta_cliente WHERE lower(trim(nombre))=lower($1)', [nombre]);
    if (existe.rows.length) throw httpError(409, 'Ya existe una ruta con ese nombre.');
    const { rows: [r] } = await db.query('INSERT INTO ruta_cliente(nombre) VALUES($1) RETURNING *', [nombre]);
    await registrarCambio(db, { entidad: 'ruta_cliente', entidadId: r.id, accion: 'crear', despues: r, usuarioId });
    return r;
  });
}
async function editarRuta(id, datos, usuarioId) {
  return enRuta(async db => {
    const antes = await rutaEn(db, id);
    const nombre = datos?.nombre === undefined ? antes.nombre : nombreValido(datos.nombre);
    const activo = datos?.activo === undefined ? antes.activo : booleano(datos.activo, 'Ruta activa');
    const existe = await db.query('SELECT id FROM ruta_cliente WHERE lower(trim(nombre))=lower($1) AND id<>$2', [nombre, antes.id]);
    if (existe.rows.length) throw httpError(409, 'Ya existe una ruta con ese nombre.');
    const { rows: [r] } = await db.query(`UPDATE ruta_cliente SET nombre=$1, activo=$2,
      version=version+1, actualizado_en=NOW() WHERE id=$3 RETURNING *`, [nombre, activo, antes.id]);
    await registrarCambio(db, { entidad: 'ruta_cliente', entidadId: r.id, accion: 'editar', antes, despues: r, usuarioId });
    return r;
  });
}
async function escribirOrdenEn(db, ids) {
  if (!ids.length) return;
  await db.query(`UPDATE cliente c SET orden_ruta=s.orden, actualizado_en=NOW()
    FROM unnest($1::int[]) WITH ORDINALITY s(id,orden) WHERE c.id=s.id`, [ids]);
}
async function reordenarRuta(id, { clienteIds, version } = {}, usuarioId) {
  if (!Array.isArray(clienteIds) || clienteIds.length > 5000) throw httpError(400, 'Orden: enviá la lista completa de clientes.');
  const ids = clienteIds.map(idValido);
  if (new Set(ids).size !== ids.length) throw httpError(400, 'Orden: hay clientes repetidos.');
  return enRuta(async db => {
    const r = await rutaEn(db, id), antes = await miembrosEn(db, r.id);
    if (version !== r.version) throw httpError(409, 'La ruta cambió en otra pantalla. Recargá antes de ordenar.');
    const actuales = new Set(antes.map(c => c.id));
    if (ids.length !== actuales.size || ids.some(n => !actuales.has(n))) throw httpError(409, 'La lista de clientes cambió. Recargá la ruta.');
    await escribirOrdenEn(db, ids);
    await db.query('UPDATE ruta_cliente SET version=version+1, actualizado_en=NOW() WHERE id=$1', [r.id]);
    await registrarCambio(db, { entidad: 'ruta_cliente', entidadId: r.id, accion: 'ordenar', antes: antes.map(c => c.id), despues: ids, usuarioId });
    return { ...r, version: r.version + 1, clientes: await miembrosEn(db, r.id) };
  });
}

/** Se llama desde la MISMA transacción de la ficha, antes de INSERT/UPDATE. */
async function prepararAsignacionEn(db, cambios, anterior = {}) {
  if (!('ruta_id' in cambios) && !('orden_ruta' in cambios)) return null;
  const destino = 'ruta_id' in cambios ? cambios.ruta_id : anterior.ruta_id;
  const origen = anterior.ruta_id || null;
  if (!destino && cambios.orden_ruta != null) throw httpError(400, 'Elegí una ruta antes de indicar el orden.');
  const afectados = [...new Set([origen, destino].filter(Boolean))];
  const antes = {};
  for (const id of afectados) antes[id] = await miembrosEn(db, id);
  if (destino) {
    const r = await rutaEn(db, destino);
    if (!r.activo && destino !== origen) throw httpError(400, 'La ruta está inactiva.');
    const otros = antes[destino].filter(c => c.id !== anterior.id).map(c => c.id);
    const puesto = cambios.orden_ruta ?? (destino === origen ? anterior.orden_ruta : otros.length + 1);
    if (!Number.isInteger(puesto) || puesto < 1 || puesto > otros.length + 1) throw httpError(400, `Orden: entre 1 y ${otros.length + 1}.`);
    // Se deja el hueco del cliente editado/nuevo; UNIQUE es diferida hasta COMMIT.
    const previo = otros.slice(0, puesto - 1), posterior = otros.slice(puesto - 1);
    await escribirOrdenEn(db, previo);
    if (posterior.length) await db.query(`UPDATE cliente c SET orden_ruta=s.orden+$2, actualizado_en=NOW()
      FROM unnest($1::int[]) WITH ORDINALITY s(id,orden) WHERE c.id=s.id`, [posterior, puesto]);
    cambios.ruta_id = destino; cambios.orden_ruta = puesto;
  } else { cambios.ruta_id = null; cambios.orden_ruta = null; }
  if (origen && origen !== destino) await escribirOrdenEn(db, antes[origen].filter(c => c.id !== anterior.id).map(c => c.id));
  return { afectados, antes };
}
async function registrarAsignacionEn(db, contexto, usuarioId) {
  if (!contexto) return;
  for (const id of contexto.afectados) {
    await db.query('UPDATE ruta_cliente SET version=version+1, actualizado_en=NOW() WHERE id=$1', [id]);
    await registrarCambio(db, { entidad: 'ruta_cliente', entidadId: id, accion: 'asignar',
      antes: contexto.antes[id].map(c => c.id), despues: (await miembrosEn(db, id)).map(c => c.id), usuarioId });
  }
}

async function listarCiclos({ rutaId } = {}) {
  const params = [], filtro = rutaId ? (params.push(idValido(rutaId)), 'AND c.ruta_id=$1') : '';
  const { rows } = await pool.query(`SELECT c.*, c.semana::text AS semana,
    (SELECT COUNT(*)::int FROM ciclo_ruta_cliente m WHERE m.ciclo_id=c.id) clientes
    FROM ciclo_ruta c WHERE c.recorrido_fijado ${filtro}
    ORDER BY CASE WHEN c.estado IN('preparacion','entrega') THEN 0 WHEN c.estado='preventa' THEN 1 ELSE 2 END,
    c.semana DESC, c.id DESC`, params);
  return rows;
}
async function cicloEn(db, id) {
  const { rows: [c] } = await db.query('SELECT *, semana::text AS semana FROM ciclo_ruta WHERE id=$1 AND recorrido_fijado', [idValido(id)]);
  if (!c) throw httpError(404, 'No existe ese ciclo.');
  const { rows } = await db.query('SELECT * FROM ciclo_ruta_cliente WHERE ciclo_id=$1 ORDER BY orden', [c.id]);
  return { ...c, clientes: rows };
}
const obtenerCiclo = id => cicloEn(pool, id);
async function crearCiclo(rutaId, datos, usuarioId) {
  const semana = semanaValida(datos?.semana);
  return enRuta(async db => {
    const r = await rutaEn(db, rutaId);
    if (!r.activo) throw httpError(400, 'La ruta está inactiva.');
    const miembros = (await miembrosEn(db, r.id)).filter(c => c.activo);
    if (!miembros.length) throw httpError(400, 'Asigná clientes activos antes de crear el ciclo.');
    const existe = await db.query('SELECT id FROM ciclo_ruta WHERE ruta_id=$1 AND semana=$2', [r.id, semana]);
    if (existe.rows.length) throw httpError(409, 'Ya existe un ciclo de esa ruta para esa semana.');
    const { rows: [c] } = await db.query('INSERT INTO ciclo_ruta(ruta_id,ruta_nombre,semana) VALUES($1,$2,$3) RETURNING id', [r.id, r.nombre, semana]);
    for (const [i, m] of miembros.entries()) await db.query(`INSERT INTO ciclo_ruta_cliente
      (ciclo_id,cliente_id,orden,cliente_nombre,ubicacion_maps,dia_visita,dia_entrega) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [c.id, m.id, i + 1, m.nombre, m.ubicacion_maps, m.dia_visita, m.dia_entrega]);
    await db.query('UPDATE ciclo_ruta SET recorrido_fijado=TRUE WHERE id=$1', [c.id]);
    const resultado = await cicloEn(db, c.id);
    await registrarCambio(db, { entidad: 'ciclo_ruta', entidadId: c.id, accion: 'crear', despues: resultado, usuarioId });
    return resultado;
  });
}
const TRANSICIONES = { preventa: ['preparacion', 'cancelado'], preparacion: ['entrega', 'cancelado'], entrega: ['cerrado'], cerrado: [], cancelado: [] };
async function cambiarEstadoCiclo(id, datos, usuarioId) {
  return enRuta(async db => {
    const antes = await cicloEn(db, id);
    if (antes.estado === datos?.estado) return antes;
    if (datos?.estadoAnterior !== antes.estado) throw httpError(409, 'El estado del ciclo cambió. Recargá antes de continuar.');
    if (!TRANSICIONES[antes.estado].includes(datos?.estado)) throw httpError(400, 'Ese cambio de estado no corresponde al ciclo.');
    if (['preparacion', 'entrega'].includes(datos.estado)) {
      const activo = await db.query("SELECT id FROM ciclo_ruta WHERE estado IN('preparacion','entrega') AND id<>$1", [antes.id]);
      if (activo.rows.length) throw httpError(409, 'Hay otro ciclo actual. Cerralo antes de activar el próximo.');
    }
    await db.query('UPDATE ciclo_ruta SET estado=$1, actualizado_en=NOW() WHERE id=$2', [datos.estado, antes.id]);
    const resultado = await cicloEn(db, antes.id);
    await registrarCambio(db, { entidad: 'ciclo_ruta', entidadId: antes.id, accion: 'estado', antes, despues: resultado, usuarioId });
    return resultado;
  });
}
module.exports = { bloquearRutasEn, prepararAsignacionEn, registrarAsignacionEn, listarRutas, obtenerRuta,
  crearRuta, editarRuta, reordenarRuta, listarCiclos, obtenerCiclo, crearCiclo, cambiarEstadoCiclo };
