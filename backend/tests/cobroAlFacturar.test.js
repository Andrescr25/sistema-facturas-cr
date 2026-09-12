const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * Cobrar en el mismo momento de facturar.
 *
 * El cobro va APARTE de la condición de venta. "De contado" es lo que dice el
 * documento; si el cliente pagó es otra cosa. Un cliente con crédito puede
 * pagar de una, y uno de contado puede quedar debiendo. Derivar una de la otra
 * deja facturas mostrando un saldo que nadie debe.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'facturaPropia.service.js');

const EFECTIVO = { id: 1, nombre: 'Efectivo', pide_referencia: false };
const SINPE = { id: 2, nombre: 'SINPE Móvil', pide_referencia: true };

function montar({ metodo = EFECTIVO } = {}) {
  const log = [];
  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    log.push({ sql: texto, params });
    if (/FROM metodo_pago WHERE id/.test(texto)) return { rows: metodo ? [{ ...metodo }] : [] };
    if (/INSERT INTO pago \(/.test(texto)) return { rows: [{ id: 77 }] };
    return { rows: [], rowCount: 1 };
  };
  const clientePg = { query: ejecutar, release: () => {} };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { connect: async () => clientePg, query: ejecutar }, query: ejecutar }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), log, clientePg };
}

const FACTURA = { id: 500, fecha: '2026-09-12', cliente_id: 7, cliente_nombre: 'PULPERÍA LA ESQUINA' };
const ARMADO = { total: 3051 };

beforeEach(() => { for (const r of [rutaDb, rutaServicio]) delete require.cache[r]; });

describe('cobrar al facturar', () => {
  test('en efectivo queda el pago y su enlace con la factura', async () => {
    const { servicio, log, clientePg } = montar();
    await servicio.registrarCobro(clientePg, {
      factura: FACTURA, armado: ARMADO, cobro: { metodoPagoId: 1 }, usuarioId: 4
    });

    const pago = log.find(l => /INSERT INTO pago \(/.test(l.sql));
    assert.ok(pago, 'no registró el pago');
    assert.equal(pago.params[6], 3051, 'cobra el total de la factura');
    assert.equal(pago.params[4], 'Efectivo');

    const enlace = log.find(l => /INSERT INTO pago_factura/.test(l.sql));
    assert.deepEqual(enlace.params, [77, 500, 3051]);
  });

  test('SINPE sin referencia no pasa', async () => {
    // Un SINPE sin número es imposible de cuadrar después contra el banco.
    const { servicio, log, clientePg } = montar({ metodo: SINPE });
    await assert.rejects(
      servicio.registrarCobro(clientePg, { factura: FACTURA, armado: ARMADO, cobro: { metodoPagoId: 2 } }),
      e => e.status === 400 && /referencia/.test(e.message)
    );
    assert.equal(log.some(l => /INSERT INTO pago \(/.test(l.sql)), false);
  });

  test('SINPE con referencia sí', async () => {
    const { servicio, log, clientePg } = montar({ metodo: SINPE });
    await servicio.registrarCobro(clientePg, {
      factura: FACTURA, armado: ARMADO, cobro: { metodoPagoId: 2, referencia: '8827-2453' }
    });
    const pago = log.find(l => /INSERT INTO pago \(/.test(l.sql));
    assert.equal(pago.params[5], '8827-2453');
  });

  test('un método que no existe o está inactivo no pasa', async () => {
    const { servicio, clientePg } = montar({ metodo: null });
    await assert.rejects(
      servicio.registrarCobro(clientePg, { factura: FACTURA, armado: ARMADO, cobro: { metodoPagoId: 99 } }),
      e => e.status === 400
    );
  });

  test('no se cobra más de lo que dice la factura', async () => {
    const { servicio, clientePg } = montar();
    await assert.rejects(
      servicio.registrarCobro(clientePg, { factura: FACTURA, armado: ARMADO, cobro: { metodoPagoId: 1, monto: 5000 } }),
      e => e.status === 400 && /3051/.test(e.message)
    );
  });

  test('un abono parcial se registra por lo que se abonó', async () => {
    const { servicio, log, clientePg } = montar();
    await servicio.registrarCobro(clientePg, {
      factura: FACTURA, armado: ARMADO, cobro: { metodoPagoId: 1, monto: 1000 }
    });
    assert.equal(log.find(l => /INSERT INTO pago \(/.test(l.sql)).params[6], 1000);
  });

  test('cero o negativo no es un cobro', async () => {
    const { servicio, clientePg } = montar();
    for (const monto of [0, -50]) {
      await assert.rejects(
        servicio.registrarCobro(clientePg, { factura: FACTURA, armado: ARMADO, cobro: { metodoPagoId: 1, monto } }),
        e => e.status === 400
      );
    }
  });
});
