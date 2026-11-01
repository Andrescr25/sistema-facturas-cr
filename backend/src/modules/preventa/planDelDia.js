/**
 * «Mi día»: el plan de visitas del agente para hoy (2026-11-01; tabla
 * `plan_visita`, migración 077).
 *
 * El usuario: «quiero que el agente pueda organizar mejor cuál cliente quiere
 * visitar primero… que este módulo de Preventa sea más dinámico, que el agente
 * lo edite a su gusto». Decidió un plan por día con clientes de todas sus
 * rutas. Por eso:
 * · La primera vez que lo abre en el día se arma solo: los atrasados y los que
 *   le tocan hoy en sus rutas, en el orden de cada ruta.
 * · Después él agrega (de cualquiera de sus rutas), quita y ordena. Quitar deja
 *   la fila marcada: el administrador ve a quién sacó sin visitarlo. Al que ya
 *   visitó no lo puede quitar.
 * · Visitado = ese día le facturó o le marcó «próxima visita». Se lee de sus
 *   facturas y visitas, no se guarda acá.
 * · Solo hoy se edita: un día no pasa al siguiente.
 * · «Guardar como orden de mi ruta» (parte 2; el usuario decidió que el agente
 *   también puede cambiar el orden de sus rutas): ver `guardarComoOrdenDeRuta`.
 */
const { pool, query } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');
const { enTransaccion } = require('../../utils/transaccion');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const { rutasDe } = require('../usuarios/rutasAsignadas');
const { listarRutasActuales } = require('../rutas/rutaActual.service');
const preventa = require('./preventa.service');
const rutas = require('../rutas/rutas.service');

const PARA_PROPONER = ['atrasado', 'hoy'];

// Un plan por agente se arma y se edita de a uno (dos teléfonos a la vez).
const bloquear = (db, usuarioId) => db.query('SELECT pg_advisory_xact_lock(44006, $1)', [usuarioId]);

/** Lo que le toca hoy en sus rutas, ruta por ruta y en el orden de cada una. */
async function propuesta(usuarioId) {
  const ids = [];
  for (const ruta of await listarRutasActuales(await rutasDe(usuarioId))) {
    const { clientes } = await preventa.agenda({ rutaId: String(ruta.id) });
    clientes.filter(c => PARA_PROPONER.includes(c.rotacion.estado))
      .sort((a, b) => (a.ordenRuta ?? Infinity) - (b.ordenRuta ?? Infinity) || String(a.nombre).localeCompare(String(b.nombre), 'es'))
      .forEach(c => ids.push(c.id));
  }
  return ids;
}

/** Si hoy todavía no tiene plan, lo arma con la propuesta. */
async function asegurarPlan(db, usuarioId, fecha) {
  await bloquear(db, usuarioId);
  const { rows: [hay] } = await db.query('SELECT 1 FROM plan_visita WHERE usuario_id = $1 AND fecha = $2 LIMIT 1', [usuarioId, fecha]);
  if (hay) return;
  const ids = await propuesta(usuarioId);
  if (!ids.length) return;
  await db.query(
    `INSERT INTO plan_visita (usuario_id, fecha, cliente_id, orden)
     SELECT $1, $2, s.id, s.orden FROM unnest($3::int[]) WITH ORDINALITY s(id, orden)
     ON CONFLICT (usuario_id, fecha, cliente_id) DO NOTHING`, [usuarioId, fecha, ids]);
}

/** Las filas del plan con lo que pasó en cada visita del día. */
async function filasDe(ejecutor, usuarioId, fecha) {
  const { rows } = await ejecutor.query(
    `SELECT p.cliente_id, p.orden, p.quitado,
            f.numero AS factura, to_char(f.creado_en, 'HH24:MI') AS hora_factura,
            to_char(v.proxima_fecha, 'YYYY-MM-DD') AS proxima_fecha, to_char(v.creado_en AT TIME ZONE 'America/Costa_Rica', 'HH24:MI') AS hora_visita
       FROM plan_visita p
       LEFT JOIN LATERAL (SELECT numero, creado_en FROM factura
                           WHERE creado_por = p.usuario_id AND cliente_id = p.cliente_id AND fecha = p.fecha AND estado = 'emitida'
                           ORDER BY creado_en DESC LIMIT 1) f ON TRUE
       LEFT JOIN LATERAL (SELECT proxima_fecha, creado_en FROM visita
                           WHERE usuario_id = p.usuario_id AND cliente_id = p.cliente_id AND fecha = p.fecha AND resultado = 'proxima_visita'
                           ORDER BY creado_en DESC LIMIT 1) v ON TRUE
      WHERE p.usuario_id = $1 AND p.fecha = $2
      ORDER BY p.orden, p.id`, [usuarioId, fecha]);
  return rows;
}

const atendidoDe = (f) => (f.factura ? { como: 'venta', hora: f.hora_factura, factura: f.factura }
  : f.proxima_fecha ? { como: 'proxima_visita', hora: f.hora_visita, proximaFecha: f.proxima_fecha } : null);

async function leer(usuarioId, fecha) {
  const filas = await filasDe({ query }, usuarioId, fecha);
  const clientes = await preventa.clientesPorId(filas.map(f => f.cliente_id));
  const enPlan = filas.filter(f => !f.quitado && clientes.has(f.cliente_id))
    .map(f => ({ cliente: clientes.get(f.cliente_id), atendido: atendidoDe(f) }));
  return {
    fecha, hoy: hoyEnCostaRica(),
    clientes: enPlan,
    quitados: filas.filter(f => f.quitado && clientes.has(f.cliente_id)).map(f => ({ id: f.cliente_id, nombre: clientes.get(f.cliente_id).nombre })),
    siguiente: enPlan.find(x => !x.atendido)?.cliente.id ?? null,
    visitados: enPlan.filter(x => x.atendido).length
  };
}

/**
 * El plan que quedó guardado un día, SIN armarlo (parte 4: «Su día» en
 * Empleados). Null si ese día no abrió «Mi día».
 */
async function planGuardado(usuarioId, fecha) {
  const { rows: [hay] } = await query('SELECT 1 FROM plan_visita WHERE usuario_id = $1 AND fecha = $2 LIMIT 1', [usuarioId, fecha]);
  return hay ? leer(usuarioId, fecha) : null;
}

/** Su plan de hoy; la primera vez del día, se arma solo. */
async function planDe(usuarioId) {
  const id = idValido(usuarioId);
  const hoy = hoyEnCostaRica();
  await enTransaccion(pool, (db) => asegurarPlan(db, id, hoy));
  return leer(id, hoy);
}

/**
 * Agrega clientes al final de su día (de cualquiera de sus rutas). Uno que
 * había quitado vuelve, al final. Uno que ya estaba, queda donde estaba.
 * @param {{rutasPermitidas: number[]|null}} quien  null = ve todas las rutas
 */
async function agregar(usuarioId, clienteIds, { rutasPermitidas = null } = {}) {
  const id = idValido(usuarioId);
  const ids = [...new Set((Array.isArray(clienteIds) ? clienteIds : []).map(idValido))];
  if (!ids.length) throw httpError(400, 'Elegí los clientes que agregás a tu día.');
  const { rows } = await query('SELECT id, nombre, activo, ruta_id FROM cliente WHERE id = ANY($1::int[])', [ids]);
  if (rows.length !== ids.length || rows.some(c => !c.activo)) throw httpError(404, 'Alguno de esos clientes no existe o está inactivo.');
  const ajeno = rutasPermitidas && rows.find(c => !rutasPermitidas.includes(Number(c.ruta_id)));
  if (ajeno) throw httpError(403, `${ajeno.nombre} no es de una ruta asignada a tu usuario.`);
  const hoy = hoyEnCostaRica();
  await enTransaccion(pool, async (db) => {
    await asegurarPlan(db, id, hoy);
    for (const clienteId of ids) {
      await db.query(
        `INSERT INTO plan_visita (usuario_id, fecha, cliente_id, orden)
         VALUES ($1, $2, $3, (SELECT COALESCE(MAX(orden), 0) + 1 FROM plan_visita WHERE usuario_id = $1 AND fecha = $2))
         ON CONFLICT (usuario_id, fecha, cliente_id) DO UPDATE SET quitado = FALSE, orden = EXCLUDED.orden
         WHERE plan_visita.quitado`, [id, hoy, clienteId]);
    }
  });
  return leer(id, hoy);
}

/** Lo saca de su día. Al que ya visitó hoy no: queda como lo que hizo. */
async function quitar(usuarioId, clienteId) {
  const id = idValido(usuarioId);
  const cliente = idValido(clienteId);
  const hoy = hoyEnCostaRica();
  await enTransaccion(pool, async (db) => {
    await asegurarPlan(db, id, hoy);
    const fila = (await filasDe(db, id, hoy)).find(f => f.cliente_id === cliente && !f.quitado);
    if (!fila) throw httpError(404, 'Ese cliente no está en tu día.');
    if (atendidoDe(fila)) throw httpError(409, 'Ya lo visitaste hoy: queda en tu día.');
    await db.query('UPDATE plan_visita SET quitado = TRUE WHERE usuario_id = $1 AND fecha = $2 AND cliente_id = $3', [id, hoy, cliente]);
  });
  return leer(id, hoy);
}

/**
 * El orden que eligió: la lista entera de los que están en su día. Si no
 * calza con lo guardado (lo cambió en otro teléfono), se rechaza y se recarga.
 */
async function ordenar(usuarioId, clienteIds) {
  const id = idValido(usuarioId);
  const ids = (Array.isArray(clienteIds) ? clienteIds : []).map(idValido);
  const hoy = hoyEnCostaRica();
  await enTransaccion(pool, async (db) => {
    await asegurarPlan(db, id, hoy);
    const { rows } = await db.query('SELECT cliente_id FROM plan_visita WHERE usuario_id = $1 AND fecha = $2 AND NOT quitado', [id, hoy]);
    const guardados = new Set(rows.map(r => r.cliente_id));
    if (ids.length !== guardados.size || new Set(ids).size !== ids.length || ids.some(x => !guardados.has(x))) {
      throw httpError(409, 'Tu día cambió en otro lado: se volvió a cargar, ordenalo de nuevo.');
    }
    await db.query(
      `UPDATE plan_visita p SET orden = s.orden FROM unnest($3::int[]) WITH ORDINALITY s(id, orden)
        WHERE p.usuario_id = $1 AND p.fecha = $2 AND p.cliente_id = s.id`, [id, hoy, ids]);
  });
  return leer(id, hoy);
}

/**
 * El orden nuevo de una ruta: los clientes que están en su día toman los
 * lugares que YA ocupaban en la ruta, en el orden de su día; los demás no se
 * mueven. Así guardar su día no desarma la ruta de los que no visitó.
 * @param {number[]} miembros  la ruta entera, en su orden
 * @param {number[]} enDia     los de su día que son de esa ruta, en el orden del día
 */
function ordenConElDia(miembros, enDia) {
  const delDia = enDia.filter(id => miembros.includes(id));
  const lugares = miembros.map((id, i) => (delDia.includes(id) ? i : -1)).filter(i => i >= 0);
  const nuevo = [...miembros];
  lugares.forEach((lugar, k) => { nuevo[lugar] = delDia[k]; });
  return nuevo;
}

/**
 * «Guardar como orden de mi ruta»: pasa el orden de su día a cada ruta que
 * tenga clientes en él. Solo sus rutas (o todas, con «Ver todas las rutas»).
 * Va por el mismo `reordenarRuta` de Clientes → Rutas: control de versión y
 * bitácora a su nombre. Las rutas que ya estaban en ese orden no se tocan.
 */
async function guardarComoOrdenDeRuta(usuarioId, { rutasPermitidas = null } = {}) {
  const id = idValido(usuarioId);
  const hoy = hoyEnCostaRica();
  const { clientes } = await leer(id, hoy);
  const porRuta = new Map();
  for (const { cliente } of clientes) {
    if (!cliente.ruta?.id) continue;
    if (!porRuta.has(cliente.ruta.id)) porRuta.set(cliente.ruta.id, { nombre: cliente.ruta.nombre, ids: [] });
    porRuta.get(cliente.ruta.id).ids.push(cliente.id);
  }
  if (!porRuta.size) throw httpError(400, 'Tu día no tiene clientes de una ruta.');
  const ajena = rutasPermitidas && [...porRuta.entries()].find(([rutaId]) => !rutasPermitidas.includes(rutaId));
  if (ajena) throw httpError(403, `${ajena[1].nombre} no es una de tus rutas: su orden no lo podés cambiar.`);
  const guardadas = [];
  for (const [rutaId, { ids }] of porRuta) {
    const ruta = await rutas.obtenerRuta(rutaId);
    const miembros = ruta.clientes.map(c => c.id);
    const nuevo = ordenConElDia(miembros, ids);
    if (nuevo.every((x, i) => x === miembros[i])) continue;
    await rutas.reordenarRuta(rutaId, { clienteIds: nuevo, version: ruta.version }, id);
    guardadas.push({ id: rutaId, nombre: ruta.nombre });
  }
  return { rutas: guardadas, plan: await leer(id, hoy) };
}

module.exports = { planDe, planGuardado, agregar, quitar, ordenar, ordenConElDia, guardarComoOrdenDeRuta };
