/**
 * Cuánto cobró cada usuario y el efectivo que entregó (migración 071).
 *
 * El usuario, sobre el agente de ventas (2026-10-29): «cuánto dinero recogió
 * por usuario y todo más acomodado a cierre de caja». Hoy el agente no cobra
 * (su usuario va sin «Cobrar al facturar» ni Cuentas por Cobrar); esto queda
 * listo para cuando cobre.
 *
 * · `porUsuario`: los cobros vigentes del día, agrupados por quien los
 *   registró, con el efectivo aparte (es lo que se cuenta en billetes) y los
 *   demás métodos de referencia. Sale de las mismas filas del cierre de caja.
 * · `recibirEfectivo`: quien está en caja anota cuánto le entregó ese usuario.
 *   Lo cobrado se CONGELA en ese momento y queda la diferencia; un usuario se
 *   recibe una vez por día, y no con la caja ya cerrada.
 */
const { pool } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');
const { registrarCambio } = require('../../utils/bitacora');

const dinero = (v) => Math.round((Number(v) || 0) * 100) / 100;
const NOTA_MAXIMA = 500;

/**
 * @param {object[]} vigentes  los cobros del día sin anular, como los lee el cierre
 *   (`registrado_por`, `registrado_nombre`, `monto` y la clave/nombre del método)
 * @param {(fila) => {clave: string, nombre: string}} metodoDe  la misma regla del cierre
 * @param {object[]} rendiciones  las filas de `rendicion_efectivo` del día
 */
function agruparPorUsuario(vigentes, metodoDe, rendiciones = []) {
  const porUsuario = new Map();
  for (const r of vigentes) {
    const id = r.registrado_por ?? null;
    if (!porUsuario.has(id)) {
      porUsuario.set(id, { usuarioId: id, nombre: r.registrado_nombre || 'Sin usuario anotado', cantidad: 0, total: 0, efectivo: 0, otros: new Map() });
    }
    const u = porUsuario.get(id);
    const { clave, nombre } = metodoDe(r);
    u.cantidad += 1;
    u.total = dinero(u.total + Number(r.monto));
    if (clave === 'efectivo') u.efectivo = dinero(u.efectivo + Number(r.monto));
    else u.otros.set(clave, { metodo: nombre, monto: dinero((u.otros.get(clave)?.monto || 0) + Number(r.monto)) });
  }
  const porId = new Map(rendiciones.map(r => [r.usuario_id, r]));
  return [...porUsuario.values()]
    .map(u => {
      const r = porId.get(u.usuarioId);
      return {
        ...u,
        otros: [...u.otros.values()],
        rendicion: r ? {
          efectivoCobrado: Number(r.efectivo_cobrado), efectivoEntregado: Number(r.efectivo_entregado),
          diferencia: Number(r.diferencia), observaciones: r.observaciones, recibidoPor: r.recibido_por_nombre, recibidoEn: r.recibido_en
        } : null
      };
    })
    .sort((a, b) => b.total - a.total || String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

/** Las entregas de efectivo de un día, con el nombre de quien recibió. */
async function rendicionesDe(ejecutor, dia) {
  const { rows } = await ejecutor.query(
    `SELECT r.*, u.nombre AS recibido_por_nombre FROM rendicion_efectivo r
       LEFT JOIN usuario u ON u.id = r.recibido_por WHERE r.fecha = $1::date`, [dia]);
  return rows;
}

/**
 * @param {{fecha, usuarioId, efectivoEntregado, observaciones?}} datos
 * @param {number} recibidoPor  quien está en caja
 * @param {(fecha) => Promise<object>} resumenDelDia  el del cierre (una sola regla de qué es efectivo)
 */
async function recibirEfectivo(datos = {}, recibidoPor, resumenDelDia) {
  const usuarioId = idValido(datos.usuarioId);
  const entregado = Number(datos.efectivoEntregado);
  if (datos.efectivoEntregado === '' || datos.efectivoEntregado === null || datos.efectivoEntregado === undefined
      || !Number.isFinite(entregado) || entregado < 0) {
    throw httpError(400, 'Escribí cuánto efectivo entregó (cero si no entregó nada).');
  }
  const observaciones = String(datos.observaciones || '').trim();
  if (observaciones.length > NOTA_MAXIMA) throw httpError(400, `Las observaciones van hasta ${NOTA_MAXIMA} caracteres.`);

  const dia = await resumenDelDia(datos.fecha);
  // Reabrir borra la fila del cierre: si hay cierre, la caja está cerrada.
  if (dia.cierre) throw httpError(409, 'La caja de ese día ya está cerrada: reábrala para recibir el efectivo.');
  const cobrador = dia.porUsuario.find(u => u.usuarioId === usuarioId);
  if (!cobrador) throw httpError(400, 'Ese usuario no registró cobros ese día.');
  if (cobrador.rendicion) throw httpError(409, `Ya se recibió el efectivo de ${cobrador.nombre} ese día.`);

  const fila = {
    fecha: dia.fecha, usuario_id: usuarioId, efectivo_cobrado: cobrador.efectivo, efectivo_entregado: dinero(entregado),
    diferencia: dinero(entregado - cobrador.efectivo), otros_metodos: cobrador.otros, observaciones: observaciones || null, recibido_por: recibidoPor || null
  };
  try {
    const { rows: [guardada] } = await pool.query(
      `INSERT INTO rendicion_efectivo (fecha, usuario_id, efectivo_cobrado, efectivo_entregado, diferencia, otros_metodos, observaciones, recibido_por)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8) RETURNING *`,
      [fila.fecha, fila.usuario_id, fila.efectivo_cobrado, fila.efectivo_entregado, fila.diferencia, JSON.stringify(fila.otros_metodos), fila.observaciones, fila.recibido_por]);
    await registrarCambio(pool, { entidad: 'rendicion_efectivo', entidadId: guardada.id, accion: 'crear', despues: fila, usuarioId: recibidoPor });
    return guardada;
  } catch (e) {
    if (e.code === '23505') throw httpError(409, `Ya se recibió el efectivo de ${cobrador.nombre} ese día.`);
    throw e;
  }
}

module.exports = { agruparPorUsuario, rendicionesDe, recibirEfectivo };
