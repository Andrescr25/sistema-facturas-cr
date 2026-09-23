const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * Pagos a proveedores como documento (migración 025).
 *
 * Lo que se cuida acá, que es plata:
 *  - que las facturas se tomen CON BLOQUEO antes de leer su saldo: dos
 *    personas pagando la misma factura a la vez no pueden pagarla dos veces;
 *  - que "pagar todo" use el saldo recién leído, no el de la pantalla;
 *  - que no se pague más que el saldo, ni facturas de dos proveedores juntas,
 *    ni una factura que todavía no se registró como compra;
 *  - que el pago diga de qué cuenta salió y con qué método (y referencia si
 *    el método la pide);
 *  - que anular no borre.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'pagos-proveedores', 'pagosProveedor.service.js');

const CXP_A = '11111111-1111-4111-8111-111111111111';
const CXP_B = '22222222-2222-4222-8222-222222222222';
const cuenta = (id, extra = {}) => ({
  id, proveedor_id: 24, proveedor_nombre: 'LIBERTY', proveedor_cedula: '3101000000',
  numero_consecutivo: id === CXP_A ? '00100001010000000100' : '00100001010000000200', liberada: true, ...extra
});
const EFECTIVO = { id: 1, nombre: 'Efectivo', pide_referencia: false };
const TRANSFERENCIA = { id: 3, nombre: 'Transferencia', pide_referencia: true };
const BANCO = { id: 2, nombre: 'Banco 1' };

function montar({
  cuentas = [cuenta(CXP_A)], saldos = { [CXP_A]: '10000.00' },
  metodo = EFECTIVO, cuentaDinero = BANCO, pago = null
} = {}) {
  const log = [];
  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    log.push({ sql: texto, params });
    if (/FROM cuentas_por_pagar WHERE id = ANY/.test(texto)) return { rows: cuentas.map((c) => ({ ...c })) };
    if (/FROM cuenta_por_pagar_saldo/.test(texto)) {
      return {
        rows: Object.entries(saldos).map(([id, saldo]) => ({
          id, saldo, estado: 'PENDIENTE', credito: '0', pagado: '0', pagado_sin_detalle: '0'
        }))
      };
    }
    if (/FROM cuenta_dinero WHERE id/.test(texto)) return { rows: cuentaDinero ? [{ ...cuentaDinero }] : [] };
    if (/FROM metodo_pago WHERE id/.test(texto)) return { rows: metodo ? [{ ...metodo }] : [] };
    if (/INSERT INTO pago_proveedor \(/.test(texto)) {
      const columnas = texto.match(/\(([^)]+)\) VALUES/)[1].split(', ');
      return { rows: [{ id: 90, ...Object.fromEntries(columnas.map((c, i) => [c, params[i]])) }] };
    }
    if (/FROM pago_proveedor WHERE id = \$1 FOR UPDATE/.test(texto)) return { rows: pago ? [{ ...pago }] : [] };
    if (/UPDATE pago_proveedor/.test(texto)) return { rows: [{ ...pago, anulado: true }] };
    if (/INSERT INTO bitacora_cambio/.test(texto)) return { rows: [{ id: '1' }] };
    return { rows: [], rowCount: 1 };
  };
  const clientePg = { query: ejecutar, release: () => {} };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { connect: async () => clientePg, query: ejecutar }, query: ejecutar }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), log };
}

const fila = (log, patron) => log.find((l) => patron.test(l.sql));
const indice = (log, patron) => log.findIndex((l) => patron.test(l.sql));
const BASE = { aplicaciones: [{ cuentaPorPagarId: CXP_A, monto: 3000 }], cuentaDineroId: 2, metodoPagoId: 1 };

beforeEach(() => { for (const r of [rutaDb, rutaServicio]) delete require.cache[r]; });

describe('registrar un pago a proveedor', () => {
  test('las facturas se toman CON BLOQUEO antes de leer el saldo', async () => {
    const { servicio, log } = montar();
    await servicio.registrarPago(BASE, 4);
    const bloqueo = indice(log, /FROM cuentas_por_pagar WHERE id = ANY/);
    assert.match(log[bloqueo].sql, /FOR UPDATE/);
    assert.ok(bloqueo < indice(log, /FROM cuenta_por_pagar_saldo/), 'el saldo se leyó antes de tomar las facturas');
  });

  test('deja el pago, de qué cuenta salió, y su enlace con la factura', async () => {
    const { servicio, log } = montar();
    const r = await servicio.registrarPago(BASE, 4);
    const insert = fila(log, /INSERT INTO pago_proveedor \(/);
    const col = (nombre) => insert.params[insert.sql.match(/\(([^)]+)\) VALUES/)[1].split(', ').indexOf(nombre)];
    assert.equal(col('monto'), 3000);
    assert.equal(col('cuenta_dinero_id'), 2);
    assert.equal(col('metodo_pago_id'), 1);
    assert.equal(col('proveedor_id'), 24);
    assert.deepEqual(fila(log, /INSERT INTO pago_proveedor_cuenta/).params, [90, CXP_A, 3000]);
    assert.equal(r.facturas[0].saldoAnterior, 10000);
    assert.equal(r.facturas[0].saldoNuevo, 7000);
    assert.ok(fila(log, /INSERT INTO bitacora_cambio/));
  });

  test('"pagar todo" usa el saldo recién leído, no el de la pantalla', async () => {
    // La pantalla creía que eran 10.000, pero alguien ya pagó 6.000.
    const { servicio, log } = montar({ saldos: { [CXP_A]: '4000.00' } });
    await servicio.registrarPago({ ...BASE, aplicaciones: [{ cuentaPorPagarId: CXP_A, monto: 10000, pagarTodo: true }] }, 4);
    assert.deepEqual(fila(log, /INSERT INTO pago_proveedor_cuenta/).params, [90, CXP_A, 4000]);
  });

  test('un pago puede cubrir varias facturas del mismo proveedor', async () => {
    const { servicio, log } = montar({
      cuentas: [cuenta(CXP_A), cuenta(CXP_B)],
      saldos: { [CXP_A]: '10000.00', [CXP_B]: '5000.00' }
    });
    const r = await servicio.registrarPago({
      ...BASE,
      aplicaciones: [{ cuentaPorPagarId: CXP_A, pagarTodo: true }, { cuentaPorPagarId: CXP_B, monto: 2000 }]
    }, 4);
    assert.equal(r.monto, 12000);
    assert.equal(log.filter((l) => /INSERT INTO pago_proveedor \(/.test(l.sql)).length, 1);
    assert.equal(log.filter((l) => /INSERT INTO pago_proveedor_cuenta/.test(l.sql)).length, 2);
  });

  test('no se paga más que el saldo', async () => {
    const { servicio, log } = montar({ saldos: { [CXP_A]: '2000.00' } });
    await assert.rejects(servicio.registrarPago(BASE, 4), (e) => e.status === 400 && /supera el saldo/.test(e.message));
    assert.equal(fila(log, /INSERT INTO pago_proveedor/), undefined);
  });

  test('una factura ya pagada no recibe otro pago', async () => {
    const { servicio } = montar({ saldos: { [CXP_A]: '0.00' } });
    await assert.rejects(servicio.registrarPago(BASE, 4), (e) => e.status === 409);
  });

  test('facturas de dos proveedores no van en el mismo pago', async () => {
    const { servicio } = montar({
      cuentas: [cuenta(CXP_A), cuenta(CXP_B, { proveedor_id: 30 })],
      saldos: { [CXP_A]: '10000.00', [CXP_B]: '5000.00' }
    });
    await assert.rejects(
      servicio.registrarPago({ ...BASE, aplicaciones: [{ cuentaPorPagarId: CXP_A, monto: 1 }, { cuentaPorPagarId: CXP_B, monto: 1 }] }, 4),
      /mismo proveedor/
    );
  });

  test('una factura que no se registró como compra no se paga', async () => {
    const { servicio } = montar({ cuentas: [cuenta(CXP_A, { liberada: false })] });
    await assert.rejects(servicio.registrarPago(BASE, 4), (e) => e.status === 409 && /no se registró como compra/.test(e.message));
  });

  test('el método que pide referencia no pasa sin ella', async () => {
    const { servicio } = montar({ metodo: TRANSFERENCIA });
    await assert.rejects(servicio.registrarPago({ ...BASE, metodoPagoId: 3 }, 4), /referencia/);
  });

  test('la cuenta de dinero tiene que existir y estar activa', async () => {
    const { servicio } = montar({ cuentaDinero: null });
    await assert.rejects(servicio.registrarPago(BASE, 4), /cuenta de dinero/);
  });

  test('sin cuenta de dinero o sin método, ni siquiera abre la transacción', async () => {
    const { servicio, log } = montar();
    await assert.rejects(servicio.registrarPago({ ...BASE, cuentaDineroId: null }, 4), /de qué cuenta/);
    await assert.rejects(servicio.registrarPago({ ...BASE, metodoPagoId: null }, 4), /método/);
    assert.equal(log.length, 0);
  });

  test('una fecha futura no pasa', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.registrarPago({ ...BASE, fecha: '2999-01-01' }, 4), /futura/);
  });

  test('la misma factura dos veces en el mismo pago no pasa', async () => {
    const { servicio } = montar();
    await assert.rejects(
      servicio.registrarPago({ ...BASE, aplicaciones: [{ cuentaPorPagarId: CXP_A, monto: 1 }, { cuentaPorPagarId: CXP_A, monto: 1 }] }, 4),
      /dos veces/
    );
  });
});

describe('anular un pago a proveedor', () => {
  const PAGO = { id: 90, monto: '3000.00', anulado: false };

  test('sin motivo no se anula', async () => {
    const { servicio } = montar({ pago: PAGO });
    await assert.rejects(servicio.anularPago(90, {}, 4), /por qué/);
  });

  test('marca el pago, no lo borra', async () => {
    const { servicio, log } = montar({ pago: PAGO });
    await servicio.anularPago(90, { motivo: 'se registró dos veces' }, 4);
    assert.match(fila(log, /UPDATE pago_proveedor/).sql, /SET anulado = TRUE/);
    assert.equal(log.some((l) => /DELETE/.test(l.sql)), false);
  });

  test('anular lo ya anulado no escribe nada', async () => {
    const { servicio, log } = montar({ pago: { ...PAGO, anulado: true } });
    await servicio.anularPago(90, { motivo: 'otra vez' }, 4);
    assert.equal(fila(log, /UPDATE pago_proveedor/), undefined);
  });
});
