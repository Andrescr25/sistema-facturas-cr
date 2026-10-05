const test = require('node:test');
const assert = require('node:assert');
const { notaDesdeAlegra, motivoDe } = require('../src/modules/facturacion/notaDesdeAlegra');

/**
 * Traducción de una nota de crédito de Alegra a la nota propia.
 * El caso base tiene la forma de GET /credit-notes (con datos inventados).
 */

const NOTA = {
  id: '27',
  date: '2026-08-11',
  status: 'open',
  observations: null,
  anotation: null,
  cause: 'error ',
  client: { id: '71', name: 'CENTRO DE TORNILLOS PALMARES LIMITADA', identification: '3-102-496518' },
  subtotal: 5040,
  discount: 0,
  tax: 655.2,
  total: 5695,
  totalApplied: 5695,
  balance: 0,
  numberTemplate: { prefix: '0010000103', number: '81', fullNumber: '00100001030000000081', documentType: 'creditNote', isElectronic: true },
  stamp: { uuid: '5'.repeat(50), legalStatus: 'STAMPED_AND_ACCEPTED' },
  invoices: [{ id: '5042', fullNumber: '00100001010000002420', number: '2420', amount: 5695, total: 5695, balance: 0 }],
  items: [{
    id: '298', name: 'CINTA P/ZATO 216. CTE', reference: 'CIN01', unit: 'Unid', productKey: '4294401030100',
    quantity: 12, price: 420, discount: 0, total: 5695.2,
    tax: [{ id: '1', percentage: '13.00', amount: 655.2 }]
  }]
};

const contexto = {
  clientes: new Map([['71', 22]]),
  productos: new Map([['298', 33]]),
  impuestos: new Map([['1', 1]]),
  facturas: new Map([['5042', 700]])
};

test('el caso completo: serie propia, motivo, líneas y la factura que corrige', () => {
  const { fila, lineas, aplicaciones, avisos } = notaDesdeAlegra(NOTA, contexto);
  assert.equal(fila.serie, '0010000103', 'la nota tiene su propia serie, distinta de la de facturas');
  assert.equal(fila.consecutivo, 81);
  assert.equal(fila.electronica, true);
  assert.equal(fila.estado, 'emitida');
  assert.equal(fila.cliente_id, 22);
  assert.equal(fila.cliente_identificacion, '3102496518');
  assert.equal(fila.total, 5695);
  assert.equal(lineas.length, 1);
  assert.equal(lineas[0].producto_id, 33);
  assert.equal(lineas[0].tarifa, 13);
  // El número que se guarda es el de la FACTURA acreditada, no el de la nota.
  assert.deepEqual(aplicaciones, [{ factura_id: 700, factura_numero: '00100001010000002420', monto: 5695 }]);
  assert.deepEqual(avisos, []);
});

test('el motivo se normaliza para poder contarlo, y se guarda como venía', () => {
  const { fila } = notaDesdeAlegra(NOTA, contexto);
  // En Alegra es texto libre: este venía como "error " con un espacio de más.
  assert.equal(fila.motivo, 'error');
  assert.equal(fila.motivo_texto, 'error');

  assert.equal(motivoDe('Devolución de mercadería'), 'devolucion');
  assert.equal(motivoDe('ANULACION'), 'anulacion');
  assert.equal(motivoDe('descuento por volumen'), 'descuento');
  assert.equal(motivoDe('cualquier otra cosa'), 'otro');
  assert.equal(motivoDe(''), null);
});

test('un motivo que nadie reconoce queda anotado, no se pierde', () => {
  const { fila, avisos } = notaDesdeAlegra({ ...NOTA, cause: 'porque sí' }, contexto);
  assert.equal(fila.motivo, 'otro');
  assert.equal(fila.motivo_texto, 'porque sí');
  assert.ok(avisos.includes('motivo_no_reconocido'));
});

test('una nota que no acredita ninguna factura se marca: no corrige nada', () => {
  const { aplicaciones, avisos } = notaDesdeAlegra({ ...NOTA, invoices: [] }, contexto);
  assert.deepEqual(aplicaciones, []);
  assert.ok(avisos.includes('no_acredita_ninguna_factura'));
});

test('si la factura acreditada no está en la base, se cuenta y se guarda su número', () => {
  const { aplicaciones, avisos } = notaDesdeAlegra(
    { ...NOTA, invoices: [{ id: '99999', fullNumber: '00100001010000009999', amount: 5695 }] },
    contexto
  );
  assert.equal(aplicaciones[0].factura_id, null);
  assert.equal(aplicaciones[0].factura_numero, '00100001010000009999');
  assert.ok(avisos.includes('factura_no_encontrada'));
});

test('si lo aplicado no calza con lo que dice Alegra, se avisa', () => {
  const { avisos } = notaDesdeAlegra({ ...NOTA, totalApplied: 9999 }, contexto);
  assert.ok(avisos.includes('lo_aplicado_no_calza_con_alegra'));
});

test('los estados se traducen igual que en la factura', () => {
  for (const [alegra, propio] of Object.entries({ draft: 'borrador', open: 'emitida', closed: 'emitida', void: 'anulada' })) {
    assert.equal(notaDesdeAlegra({ ...NOTA, status: alegra }, contexto).fila.estado, propio, alegra);
  }
});

test('sin id no se carga a medias', () => {
  assert.throws(() => notaDesdeAlegra({ date: '2026-08-11' }, contexto), /sin id/);
});
