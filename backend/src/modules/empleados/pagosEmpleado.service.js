/**
 * Los pagos a un empleado (E4 de la planilla, 2026-10-30; migración 074).
 *
 * El usuario: se paga por QUINCENA, «como salida de caja», y la gasolina
 * «que ahí le salga si ya se lo pagué o no». Por eso:
 * · Todo pago sale de Caja General con su método (y referencia si la pide),
 *   como un pago a proveedor: la vista `movimiento_caja` lo muestra y el cierre
 *   resta el efectivo del día.
 * · «Pagar quincena» paga lo que falta de ella (horas, clientes nuevos,
 *   comisión del mes si es la 2.ª, y los días de gasolina que no se habían
 *   pagado) y CONGELA el desglose y las tarifas. Si después algo cambia —se
 *   corrigió una jornada—, lo que falte se paga como «ajuste» del mismo período.
 *   Se paga desde su último día.
 * · La gasolina también se puede pagar por días sueltos, cuando se le da.
 * · Anular devuelve a pendiente lo que ese pago cubría. Solo administrador.
 *
 * Las cuentas de lo ganado no viven acá: son las de `empleados.service` (una
 * sola regla para lo que se ve y lo que se paga).
 */
const { pool, query } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');
const { registrarCambio } = require('../../utils/bitacora');
const { enTransaccion } = require('../../utils/transaccion');
const { idCajaGeneral, metodoDePago } = require('../../utils/cajaGeneral');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const { dinero, quincenaPorClave } = require('./liquidacion');

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MOTIVO_MAXIMO = 300;

/** Los pagos vigentes de una quincena y los días de gasolina ya pagados en ella. */
async function pagadoEnQuincena(usuarioId, q) {
  const { rows: pagos } = await query(
    `SELECT id, concepto, to_char(fecha, 'YYYY-MM-DD') AS fecha, monto, desglose, metodo_pago_texto AS metodo, referencia
       FROM pago_empleado WHERE usuario_id = $1 AND periodo = $2 AND NOT anulado ORDER BY id`, [usuarioId, q.clave]);
  const { rows: dias } = await query(
    `SELECT to_char(gp.fecha, 'YYYY-MM-DD') AS fecha, gp.monto, p.id AS pago_id, p.concepto, to_char(p.fecha, 'YYYY-MM-DD') AS pagado_el
       FROM gasolina_pagada gp JOIN pago_empleado p ON p.id = gp.pago_id
      WHERE gp.usuario_id = $1 AND gp.fecha BETWEEN $2::date AND $3::date`, [usuarioId, q.desde, q.hasta]);
  return {
    pagos: pagos.map(p => ({ ...p, monto: Number(p.monto) })),
    gasolina: new Map(dias.map(d => [d.fecha, { monto: Number(d.monto), pagoId: d.pago_id, concepto: d.concepto, pagadoEl: d.pagado_el }]))
  };
}

/** El historial de pagos de un empleado, con los anulados. */
async function pagosDe(usuarioId, limite = 60) {
  const { rows } = await query(
    `SELECT p.id, p.concepto, p.periodo, to_char(p.fecha, 'YYYY-MM-DD') AS fecha, p.monto, p.metodo_pago_texto AS metodo, p.referencia,
            p.observaciones, p.anulado, p.motivo_anulacion, r.nombre AS registrado_por,
            (SELECT array_agg(to_char(gp.fecha, 'YYYY-MM-DD') ORDER BY gp.fecha) FROM gasolina_pagada gp WHERE gp.pago_id = p.id) AS dias
       FROM pago_empleado p LEFT JOIN usuario r ON r.id = p.registrado_por
      WHERE p.usuario_id = $1 ORDER BY p.fecha DESC, p.id DESC LIMIT $2`, [usuarioId, limite]);
  return rows.map(p => ({ ...p, monto: Number(p.monto), dias: p.dias || [], periodoNombre: p.periodo ? quincenaPorClave(p.periodo)?.nombre : null }));
}

/** Cómo y cuándo se pagó. La fecha, de hoy para atrás, sin pasar de lo que se paga. */
async function medioDePago(db, datos, { noAntesDe = null } = {}) {
  const fecha = datos.fecha ? String(datos.fecha).slice(0, 10) : hoyEnCostaRica();
  if (!FECHA.test(fecha)) throw httpError(400, 'La fecha del pago no es válida.');
  if (fecha > hoyEnCostaRica()) throw httpError(400, 'La fecha del pago no puede ser futura.');
  if (noAntesDe && fecha < noAntesDe) throw httpError(400, 'La fecha del pago no puede ser antes de lo que se paga.');
  const { metodo, referencia } = await metodoDePago(db, datos.metodoPagoId, datos.referencia);
  const observaciones = String(datos.observaciones || '').trim().slice(0, 500) || null;
  return { fecha, metodo, referencia, observaciones, cuentaDineroId: await idCajaGeneral(db) };
}

// La ficha se bloquea: dos pagos del mismo empleado van de a uno, y el segundo
// calcula lo que falta YA con el primero guardado.
async function bloquear(db, usuarioId) {
  const { rows: [e] } = await db.query('SELECT usuario_id FROM empleado WHERE usuario_id = $1 FOR UPDATE', [usuarioId]);
  if (!e) throw httpError(404, 'Ese usuario no es empleado.');
}

async function insertarPago(db, { usuarioId, concepto, periodo = null, monto, desglose, medio, registradoPor }) {
  const { rows: [pago] } = await db.query(
    `INSERT INTO pago_empleado (usuario_id, concepto, periodo, fecha, monto, desglose, cuenta_dinero_id, metodo_pago_id, metodo_pago_texto,
                                referencia, observaciones, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [usuarioId, concepto, periodo, medio.fecha, monto, JSON.stringify(desglose), medio.cuentaDineroId, medio.metodo.id,
      String(medio.metodo.nombre).slice(0, 40), medio.referencia, medio.observaciones, registradoPor || null]);
  return pago.id;
}

async function marcarGasolina(db, usuarioId, pagoId, dias) {
  for (const d of dias) {
    await db.query('INSERT INTO gasolina_pagada (pago_id, usuario_id, fecha, monto) VALUES ($1, $2, $3, $4)', [pagoId, usuarioId, d.fecha, d.monto]);
  }
}

/**
 * Paga lo que falta de una quincena: la primera vez es «quincena», después «ajuste».
 * @param {(usuarioId, periodo) => Promise<{ficha, quincena}>} leer  la cuenta de empleados.service
 */
async function pagarQuincena(usuarioId, datos = {}, registradoPor, leer) {
  const id = idValido(usuarioId);
  return enTransaccion(pool, async (db) => {
    if (!datos.periodo) throw httpError(400, 'Elegí la quincena que se paga.');
    await bloquear(db, id);
    const { quincena: q } = await leer(id, datos.periodo);
    if (hoyEnCostaRica() < q.periodo.hasta) {
      throw httpError(409, `La ${q.periodo.nombre} termina el ${Number(q.periodo.hasta.slice(8))}: se paga ese día o después. La gasolina se puede pagar por días.`);
    }
    if (!(q.pagos.porPagar > 0)) throw httpError(409, 'No hay nada pendiente en esa quincena.');
    const medio = await medioDePago(db, datos, { noAntesDe: q.periodo.desde });
    const gasolina = q.gasolina.dias.filter(d => !d.pagada).map(d => ({ fecha: d.fecha, monto: d.monto }));
    const concepto = q.pagos.pagos.some(p => p.concepto === 'quincena') ? 'ajuste' : 'quincena';
    const desglose = {
      tarifas: q.tarifas, minutos: q.minutos, porHoras: q.porHoras,
      clientesNuevos: q.clientesNuevos.cuentan.map(c => ({ id: c.id, nombre: c.nombre, primeraCompra: c.primeraCompra })),
      montoClientes: q.clientesNuevos.monto,
      gasolina: { dias: gasolina, monto: dinero(gasolina.reduce((s, d) => s + d.monto, 0)) },
      comision: q.comision.enEstaQuincena
        ? { mes: q.comision.mes, ventas: q.comision.ventas, devoluciones: q.comision.devoluciones, netas: q.comision.netas, porcentaje: q.comision.porcentaje, monto: q.comision.monto }
        : null,
      total: q.total, pagadoAntes: q.pagos.pagado
    };
    try {
      const pagoId = await insertarPago(db, { usuarioId: id, concepto, periodo: q.periodo.clave, monto: q.pagos.porPagar, desglose, medio, registradoPor });
      await marcarGasolina(db, id, pagoId, gasolina);
      await registrarCambio(db, { entidad: 'pago_empleado', entidadId: pagoId, accion: 'crear', usuarioId: registradoPor,
        despues: { usuario_id: id, concepto, periodo: q.periodo.clave, monto: q.pagos.porPagar, metodo: medio.metodo.nombre, desglose } });
      return { id: pagoId, concepto, monto: q.pagos.porPagar };
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'Esa quincena (o uno de sus días de gasolina) ya se pagó.');
      throw e;
    }
  });
}

/**
 * Paga días de gasolina sueltos: los que tienen jornada y no se pagaron.
 * @param {(usuarioId, periodo) => Promise<{ficha, quincena}>} leer
 */
async function pagarGasolina(usuarioId, datos = {}, registradoPor, leer, quincenaDeDia) {
  const id = idValido(usuarioId);
  const fechas = [...new Set(Array.isArray(datos.fechas) ? datos.fechas.map(String) : [])];
  if (!fechas.length || fechas.some(f => !FECHA.test(f))) throw httpError(400, 'Elegí los días de gasolina que se pagan.');
  return enTransaccion(pool, async (db) => {
    await bloquear(db, id);
    const dias = [];
    for (const clave of [...new Set(fechas.map(quincenaDeDia))]) {
      const { quincena: q } = await leer(id, clave);
      for (const f of fechas.filter(x => quincenaDeDia(x) === clave)) {
        const dia = q.gasolina.dias.find(d => d.fecha === f);
        if (!dia) throw httpError(400, `El ${f.split('-').reverse().slice(0, 2).join('/')} no tiene jornada: no lleva gasolina.`);
        if (dia.pagada) throw httpError(409, `La gasolina del ${f.split('-').reverse().slice(0, 2).join('/')} ya se pagó.`);
        dias.push({ fecha: f, monto: dia.monto });
      }
    }
    const monto = dinero(dias.reduce((s, d) => s + d.monto, 0));
    if (!(monto > 0)) throw httpError(409, 'Esos días no tienen gasolina que pagar.');
    const medio = await medioDePago(db, datos, { noAntesDe: [...fechas].sort()[0] });
    try {
      const pagoId = await insertarPago(db, { usuarioId: id, concepto: 'gasolina', monto, desglose: { dias }, medio, registradoPor });
      await marcarGasolina(db, id, pagoId, dias);
      await registrarCambio(db, { entidad: 'pago_empleado', entidadId: pagoId, accion: 'crear', usuarioId: registradoPor,
        despues: { usuario_id: id, concepto: 'gasolina', monto, metodo: medio.metodo.nombre, dias } });
      return { id: pagoId, concepto: 'gasolina', monto };
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'Uno de esos días de gasolina ya se pagó.');
      throw e;
    }
  });
}

/** Anula un pago: deja de salir de caja y lo que cubría vuelve a quedar pendiente. */
async function anular(pagoId, datos = {}, anulaId) {
  const id = idValido(pagoId);
  const motivo = String(datos.motivo || '').trim();
  if (motivo.length < 3) throw httpError(400, 'Escribí por qué se anula el pago.');
  if (motivo.length > MOTIVO_MAXIMO) throw httpError(400, `El motivo va hasta ${MOTIVO_MAXIMO} caracteres.`);
  return enTransaccion(pool, async (db) => {
    const { rows: [pago] } = await db.query('SELECT id, usuario_id, concepto, periodo, monto, anulado FROM pago_empleado WHERE id = $1 FOR UPDATE', [id]);
    if (!pago) throw httpError(404, 'No existe ese pago.');
    if (pago.anulado) throw httpError(409, 'Ese pago ya está anulado.');
    await db.query(`UPDATE pago_empleado SET anulado = TRUE, motivo_anulacion = $2, anulado_por = $3, anulado_en = now() WHERE id = $1`, [id, motivo, anulaId]);
    const { rowCount } = await db.query('DELETE FROM gasolina_pagada WHERE pago_id = $1', [id]);
    await registrarCambio(db, { entidad: 'pago_empleado', entidadId: id, accion: 'anular', usuarioId: anulaId, motivo,
      antes: { anulado: false }, despues: { anulado: true, concepto: pago.concepto, periodo: pago.periodo, monto: Number(pago.monto), diasDevueltos: rowCount } });
    return { id, anulado: true, diasDevueltos: rowCount };
  });
}

module.exports = { pagadoEnQuincena, pagosDe, pagarQuincena, pagarGasolina, anular };
