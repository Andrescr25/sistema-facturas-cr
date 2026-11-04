/**
 * Cheques a fecha a proveedores (migración 078, 2026-11-03).
 *
 * El usuario paga algunas facturas con un cheque fechado para dentro de un
 * mes («así el proveedor me da 30 días») y pidió que ese pago «no me lo quite
 * de una, sino que me salga una nota como cheque para x fecha, pendiente de
 * confirmación». Eligió confirmarlo él.
 *
 * 1. UN CHEQUE A FECHA NO ES UN PAGO TODAVÍA: la factura se sigue debiendo,
 *    no sale de Caja General, ni del cierre, ni del reporte del contador.
 *    Solo Cheque, y solo con fecha FUTURA: con la de hoy es un pago normal.
 * 2. LO QUE CUBRE NO SE VUELVE A PAGAR: el pago y otro cheque lo descuentan
 *    (`facturasAPagar`, con las mismas reglas y el mismo bloqueo del pago).
 * 3. CONFIRMAR ES REGISTRAR EL PAGO de siempre (`registrarPagoEn`), en la
 *    misma transacción, con la fecha en que salió del banco —por omisión la
 *    del cheque, o hoy si se cobró antes—. El cheque queda colgado del pago.
 * 4. ANULAR NO BORRA: queda con su motivo. Uno ya confirmado no se anula
 *    acá: se anula su pago.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, idValido } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { hoyEnCostaRica, sumarDias } = require('../../utils/fechaCR');
const { metodoDePago } = require('../../utils/cajaGeneral');
const { facturasAPagar, registrarPagoEn, leerAplicaciones } = require('./pagosProveedor.service');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);
const num = (v) => Number(v) || 0;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
// Un cheque a fecha es para unas semanas; más allá de esto es un error de tipeo.
const DIAS_MAXIMOS = 180;

const COLUMNAS = `ch.id, ch.proveedor_id, ch.proveedor_nombre, ch.proveedor_cedula, ch.numero,
  ch.fecha_emision::text AS fecha_emision, ch.fecha_cobro::text AS fecha_cobro, ch.monto, ch.observaciones,
  ch.confirmado_en, ch.pago_id, ch.anulado, ch.motivo_anulacion`;

function aCheque(r, facturas = []) {
  return {
    id: r.id,
    proveedorId: r.proveedor_id,
    proveedorNombre: r.proveedor_nombre,
    proveedorCedula: r.proveedor_cedula,
    numero: r.numero,
    fechaEmision: r.fecha_emision,
    fechaCobro: r.fecha_cobro,
    monto: num(r.monto),
    observaciones: r.observaciones,
    confirmado: Boolean(r.confirmado_en),
    pagoId: r.pago_id,
    anulado: r.anulado,
    motivoAnulacion: r.motivo_anulacion,
    facturas
  };
}

/**
 * Anotar un cheque a fecha sobre una o varias facturas del mismo proveedor.
 * @param {{aplicaciones, metodoPagoId, referencia, fechaCobro, observaciones?}} datos
 *   `referencia` es el número del cheque; `fechaCobro`, la fecha escrita en él.
 */
async function registrarCheque(datos = {}, usuarioId = null) {
  const aplicaciones = leerAplicaciones(datos);
  const hoy = hoyEnCostaRica();
  const fechaCobro = String(datos.fechaCobro || '').slice(0, 10);
  if (!FECHA.test(fechaCobro)) throw httpError(400, 'Falta la fecha del cheque.');
  if (fechaCobro <= hoy) throw httpError(400, 'Un cheque con fecha de hoy o anterior es un pago normal: regístrelo como pago.');
  if (fechaCobro > sumarDias(hoy, DIAS_MAXIMOS)) {
    throw httpError(400, `La fecha del cheque no puede pasar de ${DIAS_MAXIMOS} días desde hoy.`);
  }

  return enTransaccion(async (cliente) => {
    const { metodo, referencia } = await metodoDePago(cliente, datos.metodoPagoId, datos.referencia);
    const { rows: [clave] } = await cliente.query('SELECT clave FROM metodo_pago WHERE id = $1', [metodo.id]);
    if (clave?.clave !== 'cheque') throw httpError(400, 'Solo un cheque puede quedar a fecha.');
    if (!referencia) throw httpError(400, 'Falta el número del cheque.');

    const { cuentas, proveedorId, detalle, total } = await facturasAPagar(cliente, aplicaciones);
    const { rows: repetido } = await cliente.query(
      'SELECT id FROM cheque_proveedor WHERE proveedor_id = $1 AND numero = $2 AND NOT anulado', [proveedorId, referencia]);
    if (repetido.length) throw httpError(409, `El cheque #${referencia} ya está anotado para este proveedor.`);

    const primera = cuentas[0];
    const { rows: [cheque] } = await cliente.query(
      `INSERT INTO cheque_proveedor (proveedor_id, proveedor_nombre, proveedor_cedula, metodo_pago_id, numero,
                                     fecha_emision, fecha_cobro, monto, observaciones, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, proveedor_id, proveedor_nombre, proveedor_cedula, numero, fecha_emision::text AS fecha_emision,
                 fecha_cobro::text AS fecha_cobro, monto, observaciones, confirmado_en, pago_id, anulado, motivo_anulacion`,
      [proveedorId, primera.proveedor_nombre, primera.proveedor_cedula, metodo.id, referencia,
        hoy, fechaCobro, total, datos.observaciones ? String(datos.observaciones).slice(0, 2000) : null, usuarioId]
    ).catch((e) => {
      if (e.code === '23505') throw httpError(409, `El cheque #${referencia} ya está anotado para este proveedor.`);
      throw e;
    });
    for (const d of detalle) {
      await cliente.query(
        'INSERT INTO cheque_proveedor_cuenta (cheque_id, cuenta_por_pagar_id, monto) VALUES ($1, $2, $3)',
        [cheque.id, d.cuenta.id, d.monto]
      );
    }
    const facturas = detalle.map((d) => ({ cuentaPorPagarId: d.cuenta.id, numero: d.cuenta.numero_consecutivo, monto: d.monto }));
    await registrarCambio(cliente, {
      entidad: 'cheque_proveedor', entidadId: cheque.id, accion: 'crear',
      despues: { proveedor: primera.proveedor_nombre, numero: referencia, fechaCobro, monto: total, facturas },
      usuarioId
    });
    return aCheque(cheque, facturas);
  });
}

/**
 * Confirmar que el cheque se cobró: ahí sí es un pago.
 * @param {{fecha?: string}} datos  el día en que salió del banco
 */
async function confirmarCheque(id, datos = {}, usuarioId = null) {
  const chequeId = idValido(id);
  return enTransaccion(async (cliente) => {
    const { rows: [ch] } = await cliente.query(`SELECT ${COLUMNAS}, ch.metodo_pago_id FROM cheque_proveedor ch WHERE ch.id = $1 FOR UPDATE`, [chequeId]);
    if (!ch) throw httpError(404, 'No existe ese cheque.');
    if (ch.anulado) throw httpError(409, `El cheque #${ch.numero} está anulado.`);
    // Confirmar lo ya confirmado no es un error: el resultado es el que se pedía.
    if (ch.confirmado_en) return aCheque(ch);

    const hoy = hoyEnCostaRica();
    const fecha = datos.fecha ? String(datos.fecha).slice(0, 10) : (ch.fecha_cobro <= hoy ? ch.fecha_cobro : hoy);
    if (!FECHA.test(fecha)) throw httpError(400, 'La fecha del cobro no es válida.');
    if (fecha < ch.fecha_emision) throw httpError(400, 'El cheque no se pudo cobrar antes de girarse.');

    // Primero deja de contar como pendiente; después el pago lo cubre.
    await cliente.query(
      'UPDATE cheque_proveedor SET confirmado_en = CURRENT_TIMESTAMP, confirmado_por = $2 WHERE id = $1', [chequeId, usuarioId]);
    const { rows: partes } = await cliente.query(
      'SELECT cuenta_por_pagar_id, monto FROM cheque_proveedor_cuenta WHERE cheque_id = $1 ORDER BY id', [chequeId]);
    const pago = await registrarPagoEn(cliente, {
      aplicaciones: partes.map((p) => ({ cuentaPorPagarId: p.cuenta_por_pagar_id, monto: num(p.monto) })),
      metodoPagoId: ch.metodo_pago_id,
      referencia: ch.numero,
      fecha,
      observaciones: `Cheque a fecha #${ch.numero} del ${ch.fecha_cobro}${ch.observaciones ? ` · ${ch.observaciones}` : ''}`
    }, usuarioId);
    await cliente.query('UPDATE cheque_proveedor SET pago_id = $2 WHERE id = $1', [chequeId, pago.id]);

    await registrarCambio(cliente, {
      entidad: 'cheque_proveedor', entidadId: chequeId, accion: 'confirmar',
      antes: { pendiente: true }, despues: { pagoId: pago.id, fecha, monto: num(ch.monto) },
      usuarioId
    });
    return { ...aCheque({ ...ch, confirmado_en: true, pago_id: pago.id }), pago };
  });
}

/** Un cheque que no se va a cobrar (se rompió, se cambió por otro). */
async function anularCheque(id, { motivo } = {}, usuarioId = null) {
  const chequeId = idValido(id);
  const razon = motivo ? String(motivo).trim().slice(0, 500) : '';
  if (!razon) throw httpError(400, 'Escriba por qué se anula el cheque.');
  return enTransaccion(async (cliente) => {
    const { rows: [ch] } = await cliente.query(`SELECT ${COLUMNAS} FROM cheque_proveedor ch WHERE ch.id = $1 FOR UPDATE`, [chequeId]);
    if (!ch) throw httpError(404, 'No existe ese cheque.');
    if (ch.anulado) return aCheque(ch);
    if (ch.confirmado_en) throw httpError(409, `El cheque #${ch.numero} ya se confirmó: anule su pago.`);
    const { rows: [anulado] } = await cliente.query(
      `UPDATE cheque_proveedor ch SET anulado = TRUE, motivo_anulacion = $2, anulado_por = $3, anulado_en = CURRENT_TIMESTAMP
        WHERE ch.id = $1 RETURNING ${COLUMNAS}`,
      [chequeId, razon, usuarioId]
    );
    await registrarCambio(cliente, {
      entidad: 'cheque_proveedor', entidadId: chequeId, accion: 'anular',
      antes: { anulado: false, monto: num(ch.monto) }, despues: { anulado: true, motivo: razon },
      usuarioId
    });
    return aCheque(anulado);
  });
}

/** Los cheques por confirmar, del más próximo al más lejano, con sus facturas. */
async function chequesPendientes() {
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS},
            json_agg(json_build_object('cuentaPorPagarId', cc.cuenta_por_pagar_id, 'numero', c.numero_consecutivo,
                                       'monto', cc.monto) ORDER BY cc.id) AS facturas
       FROM cheque_proveedor ch
       JOIN cheque_proveedor_cuenta cc ON cc.cheque_id = ch.id
       JOIN cuentas_por_pagar c ON c.id = cc.cuenta_por_pagar_id
      WHERE ch.confirmado_en IS NULL AND NOT ch.anulado
      GROUP BY ch.id
      ORDER BY ch.fecha_cobro, ch.id`
  );
  return rows.map((r) => aCheque(r, r.facturas.map((f) => ({ ...f, monto: num(f.monto) }))));
}

module.exports = { registrarCheque, confirmarCheque, anularCheque, chequesPendientes, DIAS_MAXIMOS };
