const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { liberarCuentaPorPagar } = require('../src/modules/compras/liberarCuentaPorPagar');

/**
 * Se extrajo de `compras.service.js` para que la transacción de una compra
 * normal y la de un gasto recurrente usen la MISMA función — antes de esto,
 * escribirla dos veces era el camino más corto y quedó anotado como deuda.
 *
 * Lo que se cuida es el mismo cálculo que
 * `pagosProveedoresService.liberarCuentaPorFactura`: el saldo se reinicia al
 * total y se le vuelve a descontar el crédito ya aplicado por notas de
 * crédito, para que una NC que llegó antes de liberar la factura no se
 * pierda.
 */

function montarCliente({ cxp = null, credito = 0 } = {}) {
  const log = [];
  const cliente = {
    query: async (sql, params) => {
      const texto = String(sql).replace(/\s+/g, ' ').trim();
      log.push({ sql: texto, params });
      if (/FROM cuentas_por_pagar WHERE factura_id = \$1 FOR UPDATE/.test(texto)) {
        return { rows: cxp ? [{ ...cxp }] : [] };
      }
      if (/FROM nota_credito_aplicacion WHERE cuenta_por_pagar_id/.test(texto)) {
        return { rows: [{ total: String(credito) }] };
      }
      if (/UPDATE cuentas_por_pagar/.test(texto)) {
        return { rows: [{ ...cxp, liberada: true, estado: params[0], saldo_pendiente: params[1], compra_id: params[2] }] };
      }
      return { rows: [] };
    }
  };
  return { cliente, log };
}

describe('liberarCuentaPorPagar', () => {
  test('sin cuenta por pagar (compra de contado), devuelve null sin escribir nada', async () => {
    const { cliente, log } = montarCliente({ cxp: null });
    const r = await liberarCuentaPorPagar(cliente, 'factura-1', 501);

    assert.equal(r, null);
    assert.equal(log.some((l) => /UPDATE cuentas_por_pagar/.test(l.sql)), false);
  });

  test('sin crédito aplicado, el saldo queda igual al monto total', async () => {
    const cxp = { id: 'cxp-1', monto_total: '10000.00', fecha_vencimiento: '2099-01-01' };
    const { cliente, log } = montarCliente({ cxp, credito: 0 });
    await liberarCuentaPorPagar(cliente, 'factura-1', 501);

    const update = log.find((l) => /UPDATE cuentas_por_pagar/.test(l.sql));
    assert.equal(update.params[1], 10000); // saldo_pendiente
    assert.equal(update.params[0], 'PENDIENTE'); // no vencida, con saldo
    assert.equal(update.params[2], 501); // compra_id
  });

  test('descuenta el crédito ya aplicado por notas de crédito', async () => {
    // Sin esto, una NC que llegó antes de liberar la factura se perdería y
    // se terminaría pagando de más.
    const cxp = { id: 'cxp-1', monto_total: '10000.00', fecha_vencimiento: '2099-01-01' };
    const { cliente, log } = montarCliente({ cxp, credito: 3000 });
    await liberarCuentaPorPagar(cliente, 'factura-1', 501);

    const update = log.find((l) => /UPDATE cuentas_por_pagar/.test(l.sql));
    assert.equal(update.params[1], 7000);
  });

  test('el crédito nunca deja el saldo negativo', async () => {
    const cxp = { id: 'cxp-1', monto_total: '10000.00', fecha_vencimiento: '2099-01-01' };
    const { cliente, log } = montarCliente({ cxp, credito: 15000 });
    await liberarCuentaPorPagar(cliente, 'factura-1', 501);

    const update = log.find((l) => /UPDATE cuentas_por_pagar/.test(l.sql));
    assert.equal(update.params[1], 0);
    assert.equal(update.params[0], 'PAGADA');
  });

  test('vencida y con saldo: queda VENCIDA, no PENDIENTE', async () => {
    const cxp = { id: 'cxp-1', monto_total: '10000.00', fecha_vencimiento: '2020-01-01' };
    const { cliente, log } = montarCliente({ cxp, credito: 0 });
    await liberarCuentaPorPagar(cliente, 'factura-1', 501);

    const update = log.find((l) => /UPDATE cuentas_por_pagar/.test(l.sql));
    assert.equal(update.params[0], 'VENCIDA');
  });
});
