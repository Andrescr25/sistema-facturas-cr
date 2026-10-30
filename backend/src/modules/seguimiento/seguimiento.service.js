/**
 * Seguimiento del agente de ventas (F5, 2026-10-29): qué hizo un día.
 *
 * El usuario: «quiero tenerlo completamente monitoreado». Todo sale de lo que
 * ya queda guardado —las facturas que creó (`factura.creado_por`) y sus visitas
 * (`visita`, migración 070)—; esta pantalla no escribe nada ni guarda copias.
 *
 * · El recorrido: cada factura y cada «próxima visita», en orden de hora, con
 *   el GPS del momento (la distancia al cliente la calcula la pantalla con la
 *   ubicación de la ficha, la misma regla de «Cómo llegar»).
 * · Si el día es HOY, lo que le falta: los clientes de sus rutas que le tocan
 *   (atrasados u hoy, la misma agenda de Preventa) y todavía no visitó.
 *
 * Las horas se dan en Costa Rica: la conexión trabaja en esa zona, así que
 * `factura.creado_en` ya es hora local; `visita.creado_en` lleva zona y se
 * convierte.
 */
const { query } = require('../../../config/database');
const { hoyEnCostaRica, diasEntre } = require('../../utils/fechaCR');
const { httpError, idValido } = require('../../utils/validacion');
const { rutasDe, rutasPorUsuario } = require('../usuarios/rutasAsignadas');
const preventa = require('../preventa/preventa.service');

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const num = (v) => (v === null || v === undefined ? null : Number(v));
const gps = (r) => ({ estado: r.ubicacion_estado || null, latitud: num(r.latitud), longitud: num(r.longitud), precision: num(r.precision_m) });

/** A quiénes se les puede dar seguimiento: quien atiende rutas o anotó visitas en los últimos 90 días. */
async function agentes() {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.usuario, u.activo FROM usuario u
      WHERE NOT u.es_admin
        AND (EXISTS (SELECT 1 FROM usuario_ruta ur WHERE ur.usuario_id = u.id)
          OR EXISTS (SELECT 1 FROM visita v WHERE v.usuario_id = u.id AND v.fecha >= CURRENT_DATE - 90))
      ORDER BY u.activo DESC, lower(u.nombre), u.id`);
  const rutas = await rutasPorUsuario();
  return rows.map(u => ({ ...u, rutas: rutas.get(u.id) || [] }));
}

/** Los clientes que le tocan hoy (atrasados u hoy) en sus rutas y todavía no visitó. */
async function pendientesDeHoy(usuarioId, visitados) {
  const pendientes = [];
  for (const rutaId of await rutasDe(usuarioId)) {
    const { clientes } = await preventa.agenda({ rutaId: String(rutaId) });
    for (const c of clientes) {
      if (!['atrasado', 'hoy'].includes(c.rotacion.estado) || visitados.has(c.id)) continue;
      pendientes.push({ id: c.id, nombre: c.nombre, ruta: c.ruta, estado: c.rotacion.estado, proximaVisita: c.rotacion.proximaVisita });
    }
  }
  return pendientes;
}

/**
 * @param {{usuarioId, fecha?}} filtros  `fecha` "AAAA-MM-DD" de Costa Rica; por omisión, hoy
 */
async function dia({ usuarioId, fecha } = {}) {
  const id = idValido(usuarioId);
  const hoy = hoyEnCostaRica();
  const elDia = fecha ? String(fecha) : hoy;
  if (!FECHA.test(elDia) || diasEntre(hoy, elDia) > 0) throw httpError(400, 'Elegí un día de hoy para atrás.');
  const { rows: [agente] } = await query('SELECT id, nombre, usuario FROM usuario WHERE id = $1', [id]);
  if (!agente) throw httpError(404, 'No existe ese usuario.');

  const { rows: facturas } = await query(
    `SELECT f.id, f.numero, f.total, f.estado, f.cliente_id, f.cliente_nombre, c.ubicacion_maps,
            to_char(f.creado_en, 'HH24:MI') AS hora, f.creado_en AS momento,
            v.id AS visita_id, v.ubicacion_estado, v.latitud, v.longitud, v.precision_m
       FROM factura f
       LEFT JOIN visita v ON v.factura_id = f.id
       LEFT JOIN cliente c ON c.id = f.cliente_id
      WHERE f.creado_por = $1 AND f.fecha = $2 AND f.estado <> 'borrador'
      ORDER BY f.creado_en, f.id`, [id, elDia]);
  const { rows: visitas } = await query(
    `SELECT v.id, v.cliente_id, c.nombre AS cliente_nombre, c.ubicacion_maps, v.motivo, v.nota, v.proxima_fecha,
            to_char(v.creado_en AT TIME ZONE 'America/Costa_Rica', 'HH24:MI') AS hora,
            v.creado_en AT TIME ZONE 'America/Costa_Rica' AS momento,
            v.ubicacion_estado, v.latitud, v.longitud, v.precision_m
       FROM visita v JOIN cliente c ON c.id = v.cliente_id
      WHERE v.usuario_id = $1 AND v.fecha = $2 AND v.resultado = 'proxima_visita'
      ORDER BY v.creado_en, v.id`, [id, elDia]);

  const { rows: cobros } = await query(
    `SELECT p.id, p.numero, p.monto, p.anulado, p.cliente_id, p.cliente_nombre, c.ubicacion_maps,
            COALESCE(mp.nombre, p.metodo_pago_texto) AS metodo,
            to_char(p.creado_en, 'HH24:MI') AS hora, p.creado_en AS momento
       FROM pago p
       LEFT JOIN metodo_pago mp ON mp.id = p.metodo_pago_id
       LEFT JOIN cliente c ON c.id = p.cliente_id
      WHERE p.registrado_por = $1 AND p.fecha = $2
      ORDER BY p.creado_en, p.id`, [id, elDia]);

  const recorrido = [
    ...cobros.map(p => ({
      tipo: 'cobro', hora: p.hora, momento: p.momento,
      cliente: { id: p.cliente_id, nombre: p.cliente_nombre, ubicacionMaps: p.ubicacion_maps },
      cobro: { id: p.id, numero: p.numero, monto: Number(p.monto), metodo: p.metodo, anulado: p.anulado }
    })),
    ...facturas.map(f => ({
      tipo: 'venta', hora: f.hora, momento: f.momento,
      cliente: { id: f.cliente_id, nombre: f.cliente_nombre, ubicacionMaps: f.ubicacion_maps },
      factura: { id: f.id, numero: f.numero, total: Number(f.total), anulada: f.estado === 'anulada' },
      desdeVisita: Boolean(f.visita_id), gps: f.visita_id ? gps(f) : null
    })),
    ...visitas.map(v => ({
      tipo: 'proxima_visita', hora: v.hora, momento: v.momento,
      cliente: { id: v.cliente_id, nombre: v.cliente_nombre, ubicacionMaps: v.ubicacion_maps },
      motivo: v.motivo, nota: v.nota, proximaFecha: v.proxima_fecha, gps: gps(v)
    }))
  ].sort((a, b) => new Date(a.momento) - new Date(b.momento)).map(({ momento, ...paso }) => paso);

  const ventas = recorrido.filter(p => p.tipo === 'venta' && !p.factura.anulada);
  const visitados = new Set(recorrido.filter(p => p.tipo !== 'cobro').map(p => p.cliente.id));
  const pendientes = elDia === hoy ? await pendientesDeHoy(id, visitados) : null;

  return {
    fecha: elDia, hoy, agente,
    resumen: {
      clientesVisitados: visitados.size,
      ventas: ventas.length,
      monto: Math.round(ventas.reduce((s, p) => s + p.factura.total, 0) * 100) / 100,
      sinVenta: recorrido.filter(p => p.tipo === 'proxima_visita').length,
      sinGps: recorrido.filter(p => p.gps && p.gps.estado !== 'tomada').length,
      fueraDeVisita: recorrido.filter(p => p.tipo === 'venta' && !p.desdeVisita).length,
      // Lo que cobró (cuando cobre: hoy su usuario no tiene «Cobrar al facturar»).
      cobrado: Math.round(recorrido.filter(p => p.tipo === 'cobro' && !p.cobro.anulado).reduce((s, p) => s + p.cobro.monto, 0) * 100) / 100,
      pendientes: pendientes ? pendientes.length : null
    },
    recorrido,
    pendientes
  };
}

module.exports = { agentes, dia };
