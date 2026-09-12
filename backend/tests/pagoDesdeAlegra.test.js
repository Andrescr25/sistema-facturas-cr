const test = require('node:test');
const assert = require('node:assert');
const { pagoDesdeAlegra, esCobro } = require('../src/modules/cobros/desdeAlegra');

/**
 * Traducción de un pago de Alegra al cobro propio.
 * El caso base tiene la forma de GET /payments (con datos inventados).
 */

const PAGO = {
  id: '1349',
  date: '2026-09-10',
  number: '1349',
  amount: 73262,
  observations: 'SINPE 12345678',
  anotation: null,
  type: 'in',
  paymentMethod: 'cash',
  status: 'open',
  bankAccount: { id: '2', name: 'Caja general', type: 'cash' },
  client: { id: '128', name: 'BAZAR MARY RINCON' },
  invoices: [{ id: '5398', number: '001000014835', amount: 73262, balance: 0 }]
};

const contexto = {
  clientes: new Map([['128', 7]]),
  metodos: new Map([['cash', 1], ['CASH', 1], ['transfer', 3], ['TRANSFER', 3]]),
  cuentas: new Map([['2', 3], ['1', 4]]),
  facturas: new Map([['5398', 500], ['5397', 499]])
};

test('el caso completo: cliente, método, cuenta y la factura a la que se aplicó', () => {
  const { fila, aplicaciones, avisos } = pagoDesdeAlegra(PAGO, contexto);
  assert.equal(fila.alegra_id, '1349');
  assert.equal(fila.fecha, '2026-09-10');
  assert.equal(fila.cliente_id, 7);
  assert.equal(fila.metodo_pago_id, 1);
  assert.equal(fila.cuenta_dinero_id, 3);
  assert.equal(fila.cuenta_texto, 'Caja general');
  assert.equal(fila.monto, 73262);
  assert.equal(fila.anulado, false);
  assert.deepEqual(aplicaciones, [{ factura_id: 500, factura_numero: '001000014835', monto: 73262 }]);
  assert.deepEqual(avisos, []);
});

test('el método viene en minúsculas en los pagos y en mayúsculas en las facturas', () => {
  // Por eso el mapa trae las dos grafías; acá se comprueba que ambas calzan.
  assert.equal(pagoDesdeAlegra({ ...PAGO, paymentMethod: 'cash' }, contexto).fila.metodo_pago_id, 1);
  assert.equal(pagoDesdeAlegra({ ...PAGO, paymentMethod: 'CASH' }, contexto).fila.metodo_pago_id, 1);
});

test('un cobro se puede repartir entre varias facturas', () => {
  const { aplicaciones, avisos } = pagoDesdeAlegra({
    ...PAGO,
    amount: 100000,
    invoices: [
      { id: '5398', number: '001000014835', amount: 73262 },
      { id: '5397', number: '001000014834', amount: 26738 }
    ]
  }, contexto);
  assert.equal(aplicaciones.length, 2);
  assert.deepEqual(aplicaciones.map(a => a.factura_id), [500, 499]);
  assert.deepEqual(avisos, [], 'suma exacta: no hay nada que avisar');
});

test('si lo aplicado no suma el cobro, se avisa', () => {
  const { avisos } = pagoDesdeAlegra({ ...PAGO, amount: 100000 }, contexto);
  assert.ok(avisos.includes('lo_aplicado_no_suma_el_cobro'));
  // Un colón de diferencia por redondeo no es un problema.
  const redondeo = pagoDesdeAlegra({ ...PAGO, amount: 73262.5 }, contexto);
  assert.equal(redondeo.avisos.includes('lo_aplicado_no_suma_el_cobro'), false);
});

test('el pago a proveedor no es un cobro', () => {
  assert.equal(esCobro({ type: 'out' }), false);
  assert.equal(esCobro({ type: 'in' }), true);
  assert.equal(esCobro({}), true, 'sin tipo se asume entrada, que es lo que hay en esta cuenta');
  assert.ok(pagoDesdeAlegra({ ...PAGO, type: 'out' }, contexto).avisos.includes('no_es_cobro'));
});

test('una factura o un cliente que no está en la base se cuenta, no se inventa', () => {
  const { fila, aplicaciones, avisos } = pagoDesdeAlegra({
    ...PAGO,
    client: { id: '999', name: 'CLIENTE BORRADO' },
    invoices: [{ id: '77777', number: '001000000001', amount: 73262 }]
  }, contexto);
  assert.equal(fila.cliente_id, null);
  assert.equal(fila.cliente_nombre, 'CLIENTE BORRADO', 'el nombre se conserva');
  assert.equal(aplicaciones[0].factura_id, null);
  assert.equal(aplicaciones[0].factura_numero, '001000000001', 'el número queda como copia fija');
  assert.ok(avisos.includes('cliente_no_encontrado'));
  assert.ok(avisos.includes('factura_no_encontrada'));
});

test('un cobro sin factura aplicada queda anotado', () => {
  const { avisos } = pagoDesdeAlegra({ ...PAGO, invoices: [] }, contexto);
  assert.ok(avisos.includes('cobro_sin_factura'));
});

test('un pago anulado se guarda como anulado, no se pierde', () => {
  const { fila } = pagoDesdeAlegra({ ...PAGO, status: 'void' }, contexto);
  assert.equal(fila.anulado, true);
});

test('la referencia no se adivina de las observaciones', () => {
  // El número de SINPE viene escrito en las observaciones, pero sacarlo de ahí
  // con una expresión regular sería inventar un dato fiscal.
  const { fila } = pagoDesdeAlegra(PAGO, contexto);
  assert.equal(fila.referencia, null);
  assert.equal(fila.observaciones, 'SINPE 12345678');
});

test('sin id no se carga a medias', () => {
  assert.throws(() => pagoDesdeAlegra({ date: '2026-09-10' }, contexto), /sin id/);
});
