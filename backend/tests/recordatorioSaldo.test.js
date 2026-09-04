/**
 * El texto del recordatorio de saldo.
 *
 * POR QUÉ LO ARMA EL SERVIDOR Y NO LA PANTALLA
 * Si el navegador mandara el texto, el monto del mensaje podría no coincidir
 * con el de la pantalla que lo originó: basta con que alguien tuviera la
 * lista abierta desde antes de un abono. El cliente recibiría una cifra que
 * ya no debe, y de cobro de más nadie se entera hasta que reclama.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const rutaDb = require.resolve('../config/database');
const rutaPrisma = require.resolve('../lib/prisma');
const rutaServicio = require.resolve('../src/modules/cuentas-por-cobrar/cuentas-por-cobrar.service');

/** Carga el servicio sin base ni red. */
function servicio() {
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { query: async () => ({ rows: [] }) }
  };
  require.cache[rutaPrisma] = {
    id: rutaPrisma, filename: rutaPrisma, loaded: true,
    exports: { cuentaPorCobrar: { findMany: async () => [] }, abonoCobro: { findMany: async () => [] } }
  };
  delete require.cache[rutaServicio];
  return require(rutaServicio);
}

const factura = (numeroFactura, saldo, diasRestantes) => ({ numeroFactura, saldo, diasRestantes });

describe('el mensaje de saldo pendiente', () => {
  test('lista cada factura con su saldo y suma el total', () => {
    const { textoRecordatorio } = servicio();
    const t = textoRecordatorio('TOSCANA', [
      factura('00100001010000002448', 279113, 9),
      factura('00100001010000002450', 11001, 9)
    ]);

    assert.match(t, /00100001010000002448 — ₡279\.113/);
    assert.match(t, /00100001010000002450 — ₡11\.001/);
    assert.match(t, /Total: ₡290\.114/);
  });

  test('una factura ya pagada no entra en el recordatorio', () => {
    // Cobrarle a alguien algo que ya pagó es peor que no escribirle.
    const { textoRecordatorio } = servicio();
    const t = textoRecordatorio('TOSCANA', [
      factura('A', 5000, 3),
      factura('B', 0, 10)
    ]);

    assert.ok(!t.includes('• B'), 'la pagada no debe aparecer');
    assert.match(t, /Total: ₡5\.000/);
  });

  test('dice si está vencida y desde hace cuánto', () => {
    // No es lo mismo "vence en 9 días" que "vencida hace 20": el tono del
    // cobro depende de eso.
    const { textoRecordatorio } = servicio();
    const t = textoRecordatorio('X', [factura('A', 1000, -20)]);
    assert.match(t, /vencida hace 20 día/);
  });

  test('las más urgentes van primero', () => {
    const { textoRecordatorio } = servicio();
    const t = textoRecordatorio('X', [
      factura('AL_DIA', 1000, 30),
      factura('VENCIDA', 2000, -5)
    ]);
    assert.ok(t.indexOf('VENCIDA') < t.indexOf('AL_DIA'));
  });

  test('una factura sin fecha de vencimiento no dice una fecha inventada', () => {
    const { textoRecordatorio } = servicio();
    const t = textoRecordatorio('X', [factura('A', 1000, null)]);
    assert.match(t, /sin fecha de vencimiento/);
  });

  test('lleva el nombre del cliente y el del negocio', () => {
    const { textoRecordatorio } = servicio();
    const t = textoRecordatorio('PULPERÍA LA ESQUINA', [factura('A', 1000, 5)]);
    assert.match(t, /PULPERÍA LA ESQUINA/);
    assert.match(t, /Distribuidora Tachi/);
  });

  test('los miles llevan punto, no el espacio duro de es-CR', () => {
    // toLocaleString('es-CR') separa con U+00A0, que en WhatsApp se ve como
    // un espacio raro en medio del monto.
    const { textoRecordatorio } = servicio();
    const t = textoRecordatorio('X', [factura('A', 1234567, 5)]);
    assert.match(t, /₡1\.234\.567/);
    assert.ok(!t.includes(' '), 'no debe quedar ningún espacio duro');
  });
});
