const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { liberarCuentaPorPagar, crearCuentaDeContado } = require('../src/modules/compras/liberarCuentaPorPagar');

/**
 * Se extrajo de `compras.service.js` para que la transacción de una compra
 * normal y la de un gasto recurrente usen la MISMA función.
 *
 * Desde la migración 025 ya no calcula saldo ni estado —los dos salen de la
 * vista `cuenta_por_pagar_saldo`—: libera la cuenta y la cuelga de la compra
 * y de su proveedor por id propio. Lo que se cuida acá es que no vuelva a
 * escribir un saldo (sería una segunda copia que se queda vieja) y que corra
 * en la conexión de la transacción.
 */

function montarCliente({ cxp = null } = {}) {
  const log = [];
  const cliente = {
    query: async (sql, params) => {
      const texto = String(sql).replace(/\s+/g, ' ').trim();
      log.push({ sql: texto, params });
      if (/UPDATE cuentas_por_pagar/.test(texto)) {
        return { rows: cxp ? [{ ...cxp, liberada: true, compra_id: params[1] }] : [] };
      }
      return { rows: [] };
    }
  };
  return { cliente, log };
}

describe('liberarCuentaPorPagar', () => {
  test('sin cuenta por pagar (compra de contado), devuelve null', async () => {
    const { cliente } = montarCliente({ cxp: null });
    assert.equal(await liberarCuentaPorPagar(cliente, 'factura-1', 501), null);
  });

  test('libera la cuenta de ESA factura y la cuelga de la compra', async () => {
    const { cliente, log } = montarCliente({ cxp: { id: 'cxp-1', monto_total: '10000.00' } });
    const r = await liberarCuentaPorPagar(cliente, 'factura-1', 501);

    assert.equal(r.liberada, true);
    const update = log.find((l) => /UPDATE cuentas_por_pagar/.test(l.sql));
    assert.deepEqual(update.params, ['factura-1', 501]);
    assert.match(update.sql, /liberada = TRUE/);
    assert.match(update.sql, /compra_id = \$2/);
  });

  test('toma el proveedor de la compra, sin pisar uno que ya tenga', async () => {
    const { cliente, log } = montarCliente({ cxp: { id: 'cxp-1' } });
    await liberarCuentaPorPagar(cliente, 'factura-1', 501);
    const update = log.find((l) => /UPDATE cuentas_por_pagar/.test(l.sql));
    assert.match(update.sql, /proveedor_id = COALESCE\(c\.proveedor_id, \(SELECT proveedor_id FROM compra WHERE id = \$2\)\)/);
  });

  test('no escribe saldo ni estado: salen de la vista cuenta_por_pagar_saldo', async () => {
    const { cliente, log } = montarCliente({ cxp: { id: 'cxp-1' } });
    await liberarCuentaPorPagar(cliente, 'factura-1', 501);
    for (const { sql } of log) {
      assert.doesNotMatch(sql, /saldo_pendiente|estado =/);
    }
  });
});

describe('crearCuentaDeContado', () => {
  test('una compra de total cero no deja nada que pagar', async () => {
    const { cliente, log } = montarCliente();
    const r = await crearCuentaDeContado(cliente, { id: 'factura-1' }, { id: 501, total: '0.00' });
    assert.equal(r, null);
    assert.equal(log.length, 0);
  });

  test('nace pendiente, de contado, venciendo el día de la factura', async () => {
    const { cliente, log } = montarCliente();
    await crearCuentaDeContado(cliente,
      { id: 'factura-1', proveedor_nombre: ' LIBERTY ', proveedor_cedula: '3101', numero_consecutivo: '001' },
      { id: 501, total: '1500.00', fecha_emision: '2026-09-23', proveedor_id: 24 });
    const insert = log[0];
    assert.match(insert.sql, /INSERT INTO cuentas_por_pagar/);
    assert.match(insert.sql, /VALUES \(\$1, \$2, \$3, \$4, '01', 0, \$5, \$5, \$6, \$6, 'PENDIENTE', TRUE, \$7, \$8, TRUE\)/);
    assert.deepEqual(insert.params, ['factura-1', 'LIBERTY', '3101', '001', '2026-09-23', '1500.00', 501, 24]);
  });
});
