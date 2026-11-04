const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * Cheques a fecha a proveedores (migración 078, 2026-11-03).
 *
 * El usuario: «pongo el cheque con fecha dentro de un mes… que este pago no me
 * lo quite de una, sino que me salga una nota como cheque para x fecha,
 * pendiente de confirmación». Eligió confirmarlo él.
 *
 * Contra PostgreSQL local (con la 078 aplicada), en una transacción que se
 * deshace. Las cuentas se crean con el mismo código de la compra a mano.
 */

const CEDULA = 'ZZ-CED-CHEQUE';

describe('cheques a fecha a proveedores — contra PostgreSQL local', () => {
  let pool, conexion, cheques, pagos, lista, pendientes, hoy, enUnMes, metodoCheque, metodoEfectivo;
  let cuentaA, cuentaB, cuentaC, proveedorId;
  const q = (sql, params) => conexion.query(sql, params).then((r) => r.rows);
  const saldo = async (id) => Number((await q('SELECT saldo FROM cuenta_por_pagar_saldo WHERE id = $1', [id]))[0].saldo);
  const pagosDe = (id) => q(`SELECT p.* FROM pago_proveedor p JOIN pago_proveedor_cuenta pc ON pc.pago_id = p.id
                              WHERE pc.cuenta_por_pagar_id = $1 AND NOT p.anulado`, [id]);
  const caja = (pagoId) => q("SELECT * FROM movimiento_caja WHERE tipo = 'pago_proveedor' AND documento_id = $1", [pagoId]);
  const cheque = (datos) => cheques.registrarCheque({
    metodoPagoId: metodoCheque, referencia: datos.numero, fechaCobro: datos.fechaCobro || enUnMes,
    aplicaciones: datos.aplicaciones
  }, null);

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    for (const r of Object.keys(require.cache)) {
      if (r.includes(`${path.sep}src${path.sep}`) || r.includes(`${path.sep}services${path.sep}`)) delete require.cache[r];
    }
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(conexion, 'cheques') };
    cheques = require('../src/modules/pagos-proveedores/chequesProveedor.service');
    pagos = require('../src/modules/pagos-proveedores/pagosProveedor.service');
    lista = require('../services/pagosProveedoresService');
    pendientes = require('../src/modules/pagos-proveedores/chequesPendientes');
    const { hoyEnCostaRica, sumarDias } = require('../src/utils/fechaCR');
    hoy = hoyEnCostaRica();
    enUnMes = sumarDias(hoy, 30);

    [{ id: metodoCheque }] = await q("SELECT id FROM metodo_pago WHERE clave = 'cheque'");
    [{ id: metodoEfectivo }] = await q("SELECT id FROM metodo_pago WHERE clave = 'efectivo'");
    [{ id: proveedorId }] = await q("INSERT INTO proveedor (nombre, identificacion) VALUES ('zz-proveedor cheques', $1) RETURNING id", [CEDULA]);
    const liberar = require('../src/modules/compras/liberarCuentaPorPagar');
    const cuenta = (numero, total) => liberar.crearCuentaACredito(conexion,
      { proveedor_nombre: 'zz-proveedor cheques', proveedor_cedula: CEDULA, numero_consecutivo: numero },
      { id: null, proveedor_id: proveedorId, fecha_emision: hoy, total }, 30);
    cuentaA = (await cuenta('ZZ-CHEQUE-A', 50000)).id;
    cuentaB = (await cuenta('ZZ-CHEQUE-B', 20000)).id;
    cuentaC = (await cuenta('ZZ-CHEQUE-C', 10000)).id;
  });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('anotar un cheque a fecha NO es un pago: la factura se sigue debiendo y no sale de caja', async () => {
    const ch = await cheque({ numero: 'ZZ-1001', aplicaciones: [{ cuentaPorPagarId: cuentaA, pagarTodo: true }] });
    assert.equal(ch.monto, 50000);
    assert.equal(ch.fechaCobro, enUnMes);
    assert.equal(ch.confirmado, false);
    assert.equal(await saldo(cuentaA), 50000, 'el saldo no baja');
    assert.deepEqual(await pagosDe(cuentaA), [], 'no hay pago');
    const { data } = await lista.listarCuentas({ proveedor: CEDULA });
    const a = data.find((c) => c.id === cuentaA);
    assert.equal(a.saldoPendiente, 50000);
    assert.equal(a.enCheques, 50000);
    assert.deepEqual(a.chequesPendientes.map((c) => [c.numero, c.fechaCobro, c.monto]), [['ZZ-1001', enUnMes, 50000]]);
    assert.deepEqual((await cheques.chequesPendientes()).filter((c) => c.proveedorId === proveedorId).map((c) => c.facturas.map((f) => f.numero)), [['ZZ-CHEQUE-A']]);
  });

  test('lo que cubre el cheque no se vuelve a pagar ni a cubrir con otro cheque', async () => {
    await assert.rejects(() => pagos.registrarPago({ metodoPagoId: metodoEfectivo, aplicaciones: [{ cuentaPorPagarId: cuentaA, pagarTodo: true }] }, null),
      (e) => e.status === 409 && /cubierta por un cheque a fecha/.test(e.message));
    await assert.rejects(() => cheque({ numero: 'ZZ-1002', aplicaciones: [{ cuentaPorPagarId: cuentaA, monto: 10 }] }),
      (e) => e.status === 409);
  });

  test('un cheque por una parte deja pagar solo el resto', async () => {
    await cheque({ numero: 'ZZ-2001', aplicaciones: [{ cuentaPorPagarId: cuentaB, monto: 15000 }] });
    await assert.rejects(() => pagos.registrarPago({ metodoPagoId: metodoEfectivo, aplicaciones: [{ cuentaPorPagarId: cuentaB, monto: 6000 }] }, null),
      (e) => e.status === 400 && /fuera del cheque a fecha, que es ₡5000/.test(e.message));
    const p = await pagos.registrarPago({ metodoPagoId: metodoEfectivo, aplicaciones: [{ cuentaPorPagarId: cuentaB, pagarTodo: true }] }, null);
    assert.equal(p.monto, 5000, '«pagar todo» paga lo que falta fuera del cheque');
    assert.equal(await saldo(cuentaB), 15000);
  });

  test('solo Cheque, con número, con fecha futura y no más allá de 180 días; el mismo número no se anota dos veces', async () => {
    const { sumarDias } = require('../src/utils/fechaCR');
    const base = { aplicaciones: [{ cuentaPorPagarId: cuentaC, monto: 1 }] };
    await assert.rejects(() => cheque({ ...base, numero: 'ZZ-3001', fechaCobro: hoy }), (e) => e.status === 400 && /pago normal/.test(e.message));
    await assert.rejects(() => cheque({ ...base, numero: 'ZZ-3002', fechaCobro: sumarDias(hoy, 181) }), (e) => e.status === 400 && /180/.test(e.message));
    await assert.rejects(() => cheques.registrarCheque({ ...base, metodoPagoId: metodoEfectivo, referencia: 'x', fechaCobro: enUnMes }, null),
      (e) => e.status === 400 && /Solo un cheque/.test(e.message));
    await assert.rejects(() => cheque({ ...base, numero: '' }), (e) => e.status === 400);
    await assert.rejects(() => cheque({ ...base, numero: 'ZZ-1001' }), (e) => e.status === 409 && /ya está anotado/.test(e.message));
  });

  test('confirmar el cobro registra el pago de siempre: baja la deuda y sale de Caja General, una sola vez', async () => {
    const [ch] = (await cheques.chequesPendientes()).filter((c) => c.numero === 'ZZ-1001');
    await assert.rejects(() => cheques.confirmarCheque(ch.id, { fecha: enUnMes }, null), (e) => e.status === 400 && /futura/.test(e.message));
    const r = await cheques.confirmarCheque(ch.id, {}, null);
    assert.equal(r.confirmado, true);
    assert.equal(await saldo(cuentaA), 0);
    const [pago] = await pagosDe(cuentaA);
    assert.equal(pago.referencia, 'ZZ-1001');
    assert.equal(pago.metodo_pago_texto, 'Cheque');
    assert.equal(Number(pago.monto), 50000);
    assert.equal(pago.fecha.toISOString ? require('../src/utils/fechaCR').diaDeBase(pago.fecha) : pago.fecha, hoy,
      'cobrado antes de su fecha: sale hoy');
    assert.equal((await caja(pago.id)).length, 1, 'aparece en Caja General');
    const otra = await cheques.confirmarCheque(ch.id, {}, null);
    assert.equal(otra.pagoId, pago.id, 'confirmar dos veces no paga dos veces');
    assert.equal((await pagosDe(cuentaA)).length, 1);
    assert.equal((await pendientes.pendientesPorCuenta([cuentaA])).size, 0);
  });

  test('anular un cheque pendiente libera la factura; uno ya confirmado no se anula acá', async () => {
    const [ch] = (await cheques.chequesPendientes()).filter((c) => c.numero === 'ZZ-2001');
    await assert.rejects(() => cheques.anularCheque(ch.id, {}, null), (e) => e.status === 400);
    const anulado = await cheques.anularCheque(ch.id, { motivo: 'zz: el proveedor pidió transferencia' }, null);
    assert.equal(anulado.anulado, true);
    const p = await pagos.registrarPago({ metodoPagoId: metodoEfectivo, aplicaciones: [{ cuentaPorPagarId: cuentaB, pagarTodo: true }] }, null);
    assert.equal(p.monto, 15000);
    const [confirmado] = await q("SELECT id FROM cheque_proveedor WHERE numero = 'ZZ-1001' AND proveedor_id = $1", [proveedorId]);
    await assert.rejects(() => cheques.anularCheque(confirmado.id, { motivo: 'zz' }, null), (e) => e.status === 409 && /anule su pago/.test(e.message));
  });

  test('cada paso queda en la bitácora del cheque', async () => {
    const filas = await q(`SELECT accion FROM bitacora_cambio WHERE entidad = 'cheque_proveedor'
                            AND entidad_id IN (SELECT id::text FROM cheque_proveedor WHERE proveedor_id = $1) ORDER BY id`, [proveedorId]);
    assert.deepEqual(filas.map((f) => f.accion), ['crear', 'crear', 'confirmar', 'anular']);
  });
});
