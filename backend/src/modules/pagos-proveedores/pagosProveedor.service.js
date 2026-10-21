/**
 * Pagos a proveedores, como documento propio (migración 025).
 *
 * Antes, pagar era bajar a mano `cuentas_por_pagar.saldo_pendiente`: no
 * quedaba cuándo, de qué cuenta salió la plata, con qué método ni con qué
 * referencia. Ahora el pago es una fila con todo eso, y el saldo de cada
 * factura se CALCULA en la vista `cuenta_por_pagar_saldo` —total, menos
 * notas de crédito, menos lo pagado antes del corte, menos los pagos
 * vigentes—, así que no puede quedar viejo.
 *
 * Mismas reglas que los cobros a clientes (`cuentas-por-cobrar/cobros.service.js`):
 *
 * 1. EL SALDO SE RELEE CON BLOQUEO. Las filas de las facturas se toman con
 *    `FOR UPDATE` antes de leer la vista: si dos personas pagan la misma
 *    factura a la vez, la segunda espera y ve el saldo ya rebajado.
 * 2. "PAGAR TODO" USA EL SALDO RECIÉN LEÍDO, no el que mostraba la pantalla.
 * 3. NO SE PAGA MÁS QUE EL SALDO: un excedente no es un abono.
 * 4. UN PAGO NO SE BORRA: se anula con motivo, y el saldo vuelve solo.
 * 5. SALE DE CAJA GENERAL, siempre (decisión del usuario, 2026-09-23): no hay
 *    cajas separadas. El método dice cómo se pagó; la cuenta es una sola. El
 *    movimiento aparece en la vista `movimiento_caja` con sus facturas.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, idValido } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const { idCajaGeneral } = require('../../utils/cajaGeneral');
const { leerIdempotencia, pagoPrevio } = require('./pagoProveedorIdempotencia');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);
const dinero = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v) => Number(v) || 0;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Saldo, estado y de qué se compone, para varias cuentas a la vez.
 * @returns {Promise<Map<string, {saldo, estado, credito, pagado, pagadoSinDetalle}>>}
 */
async function saldosDeCuentas(ids, ejecutor = pool) {
  if (!ids || ids.length === 0) return new Map();
  const { rows } = await ejecutor.query(
    `SELECT id, saldo, estado, credito, pagado, pagado_sin_detalle, de_contado
       FROM cuenta_por_pagar_saldo
      WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  return new Map(rows.map((r) => [r.id, {
    saldo: num(r.saldo),
    estado: r.estado,
    credito: num(r.credito),
    pagado: num(r.pagado),
    pagadoSinDetalle: num(r.pagado_sin_detalle),
    deContado: r.de_contado === true
  }]));
}

/** Los pagos de cada cuenta. Los anulados van MARCADOS, no escondidos. */
async function pagosDeCuentas(ids) {
  if (!ids || ids.length === 0) return new Map();
  const { rows } = await pool.query(
    `SELECT pc.cuenta_por_pagar_id, pc.monto, p.id, p.fecha, p.monto AS monto_pago,
            p.metodo_pago_texto, p.referencia, p.anulado, p.motivo_anulacion,
            cd.nombre AS cuenta_nombre
       FROM pago_proveedor_cuenta pc
       JOIN pago_proveedor p ON p.id = pc.pago_id
       JOIN cuenta_dinero cd ON cd.id = p.cuenta_dinero_id
      WHERE pc.cuenta_por_pagar_id = ANY($1::uuid[])
      ORDER BY p.fecha, p.id`,
    [ids]
  );
  const porCuenta = new Map();
  for (const r of rows) {
    if (!porCuenta.has(r.cuenta_por_pagar_id)) porCuenta.set(r.cuenta_por_pagar_id, []);
    porCuenta.get(r.cuenta_por_pagar_id).push({
      id: r.id,
      fecha: r.fecha,
      // Lo que este pago le descontó a ESTA factura; `montoPago` es el pago
      // entero, que puede haber cubierto varias.
      monto: num(r.monto),
      montoPago: num(r.monto_pago),
      metodo: r.metodo_pago_texto,
      cuenta: r.cuenta_nombre,
      referencia: r.referencia,
      anulado: r.anulado,
      motivoAnulacion: r.motivo_anulacion
    });
  }
  return porCuenta;
}

/** Valida y normaliza lo que se va a pagar de cada factura. */
function leerAplicaciones(datos) {
  const lista = Array.isArray(datos.aplicaciones) ? datos.aplicaciones : [];
  if (lista.length === 0) throw httpError(400, 'Falta a qué factura se aplica el pago.');
  const vistas = new Set();
  return lista.map((a) => {
    const id = String(a?.cuentaPorPagarId || '');
    if (!UUID.test(id)) throw httpError(400, 'Esa cuenta por pagar no existe.');
    if (vistas.has(id)) throw httpError(400, 'La misma factura viene dos veces en el pago.');
    vistas.add(id);
    const pagarTodo = a.pagarTodo === true;
    const monto = pagarTodo ? null : dinero(a.monto);
    if (!pagarTodo && !(monto > 0)) throw httpError(400, 'El monto de cada factura tiene que ser mayor que cero.');
    return { id, pagarTodo, monto };
  });
}

/**
 * Registrar un pago a un proveedor, repartido entre una o varias de sus facturas.
 *
 * @param {object} datos
 * @param {Array<{cuentaPorPagarId: string, monto?: number, pagarTodo?: boolean}>} datos.aplicaciones
 * @param {number} datos.metodoPagoId  cómo se pagó (sale siempre de Caja General)
 * @param {string} [datos.referencia]    obligatoria si el método la pide
 * @param {string} [datos.fecha]         YYYY-MM-DD; por omisión, hoy en Costa Rica
 */
async function registrarPago(datos = {}, usuarioId = null) {
  const aplicaciones = leerAplicaciones(datos);
  const metodoId = Number(datos.metodoPagoId);
  if (!metodoId) throw httpError(400, 'Falta el método de pago.');

  const fecha = datos.fecha ? String(datos.fecha).slice(0, 10) : hoyEnCostaRica();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw httpError(400, 'La fecha del pago no es válida.');
  if (fecha > hoyEnCostaRica()) throw httpError(400, 'La fecha del pago no puede ser futura.');
  const intento = leerIdempotencia(datos, aplicaciones, fecha, usuarioId);

  return enTransaccion(async (cliente) => {
    const previo = await pagoPrevio(cliente, intento);
    if (previo) return { ...previo, monto: num(previo.monto), existente: true };
    const ids = aplicaciones.map((a) => a.id);
    // El bloqueo va sobre las filas de la tabla; la vista se lee DESPUÉS,
    // ya con las facturas tomadas.
    const { rows: cuentas } = await cliente.query(
      `SELECT id, proveedor_id, proveedor_nombre, proveedor_cedula, numero_consecutivo, liberada
         FROM cuentas_por_pagar
        WHERE id = ANY($1::uuid[])
        FOR UPDATE`,
      [ids]
    );
    if (cuentas.length !== ids.length) throw httpError(404, 'Alguna de esas facturas no existe.');
    const porId = new Map(cuentas.map((c) => [c.id, c]));

    const noLiberada = cuentas.find((c) => !c.liberada);
    if (noLiberada) {
      throw httpError(409,
        `La factura ${noLiberada.numero_consecutivo} todavía no se registró como compra: no se le puede pagar.`);
    }
    const proveedores = new Set(cuentas.map((c) => c.proveedor_id));
    if (proveedores.size > 1) throw httpError(400, 'Un pago solo puede cubrir facturas del mismo proveedor.');
    const proveedorId = cuentas[0].proveedor_id;
    if (!proveedorId) {
      throw httpError(409, `La factura ${cuentas[0].numero_consecutivo} no tiene el proveedor enlazado.`);
    }

    const saldos = await saldosDeCuentas(ids, cliente);
    const detalle = aplicaciones.map((a) => {
      const cuenta = porId.get(a.id);
      const saldo = saldos.get(a.id)?.saldo ?? 0;
      if (saldo <= 0) throw httpError(409, `La factura ${cuenta.numero_consecutivo} ya no tiene saldo pendiente.`);
      const monto = a.pagarTodo ? saldo : a.monto;
      if (monto > saldo + 0.01) {
        throw httpError(400,
          `El pago de ₡${monto} supera el saldo de la factura ${cuenta.numero_consecutivo}, que es ₡${saldo}.`);
      }
      return { cuenta, monto: dinero(monto), saldoAntes: saldo };
    });
    const total = dinero(detalle.reduce((s, d) => s + d.monto, 0));

    const cuentaDineroId = await idCajaGeneral(cliente);

    const { rows: metodos } = await cliente.query(
      'SELECT id, nombre, pide_referencia FROM metodo_pago WHERE id = $1 AND activo = TRUE', [metodoId]
    );
    const metodo = metodos[0];
    if (!metodo) throw httpError(400, 'Ese método de pago no existe o está inactivo.');
    const referencia = datos.referencia ? String(datos.referencia).trim().slice(0, 60) : null;
    if (metodo.pide_referencia && !referencia) {
      throw httpError(400, `${metodo.nombre}: falta el número de referencia del pago.`);
    }

    const primera = cuentas[0];
    const { rows } = await cliente.query(
      `INSERT INTO pago_proveedor (fecha, proveedor_id, proveedor_nombre, proveedor_cedula,
                                   cuenta_dinero_id, metodo_pago_id, metodo_pago_texto, referencia,
                                   monto, observaciones, registrado_por, clave_idempotencia, huella_idempotencia)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        fecha, proveedorId, primera.proveedor_nombre, primera.proveedor_cedula,
        cuentaDineroId, metodo.id, String(metodo.nombre).slice(0, 40), referencia,
        total, datos.observaciones ? String(datos.observaciones).slice(0, 2000) : null, usuarioId,
        intento?.clave || null, intento?.huella || null
      ]
    );
    const pago = rows[0];

    for (const d of detalle) {
      await cliente.query(
        'INSERT INTO pago_proveedor_cuenta (pago_id, cuenta_por_pagar_id, monto) VALUES ($1, $2, $3)',
        [pago.id, d.cuenta.id, d.monto]
      );
    }

    await registrarCambio(cliente, {
      entidad: 'pago_proveedor', entidadId: pago.id, accion: 'crear',
      despues: {
        proveedor: primera.proveedor_nombre, monto: total, metodo: metodo.nombre,
        referencia,
        facturas: detalle.map((d) => ({
          factura: d.cuenta.numero_consecutivo, monto: d.monto,
          saldoAntes: d.saldoAntes, saldoDespues: dinero(d.saldoAntes - d.monto)
        }))
      },
      usuarioId
    });

    return {
      ...pago,
      monto: num(pago.monto),
      facturas: detalle.map((d) => ({
        cuentaPorPagarId: d.cuenta.id,
        numero: d.cuenta.numero_consecutivo,
        monto: d.monto,
        saldoAnterior: d.saldoAntes,
        saldoNuevo: dinero(d.saldoAntes - d.monto)
      }))
    };
  });
}

/**
 * Anular un pago. No lo borra: queda con su motivo, y el saldo de cada
 * factura que cubría vuelve solo, porque se calcula.
 */
async function anularPago(id, { motivo } = {}, usuarioId = null) {
  const pagoId = idValido(id);
  const razon = motivo ? String(motivo).trim().slice(0, 500) : '';
  if (!razon) throw httpError(400, 'Escriba por qué se anula el pago.');

  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query('SELECT * FROM pago_proveedor WHERE id = $1 FOR UPDATE', [pagoId]);
    const pago = rows[0];
    if (!pago) throw httpError(404, 'No existe ese pago.');
    // Anular lo ya anulado no es un error: el resultado es el que se pedía.
    if (pago.anulado) return { ...pago, monto: num(pago.monto) };

    const { rows: actualizado } = await cliente.query(
      `UPDATE pago_proveedor
          SET anulado = TRUE, motivo_anulacion = $2, anulado_por = $3, anulado_en = CURRENT_TIMESTAMP
        WHERE id = $1
      RETURNING *`,
      [pagoId, razon, usuarioId]
    );

    await registrarCambio(cliente, {
      entidad: 'pago_proveedor', entidadId: pagoId, accion: 'anular',
      antes: { anulado: false, monto: num(pago.monto) },
      despues: { anulado: true, motivo: razon },
      usuarioId
    });

    return { ...actualizado[0], monto: num(actualizado[0].monto) };
  });
}

module.exports = {
  saldosDeCuentas,
  pagosDeCuentas,
  registrarPago,
  anularPago,
  leerAplicaciones
};
