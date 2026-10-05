const test = require('node:test');
const assert = require('node:assert');
const { facturaDesdeAlegra } = require('../src/modules/facturacion/desdeAlegra');

/**
 * Traducción de una factura de venta de Alegra a la factura propia.
 * El caso base tiene la forma de GET /invoices (con datos inventados).
 */

const FACTURA = {
  id: '5398',
  date: '2026-09-10',
  dueDate: '2026-09-10',
  datetime: '2026-09-10T14:32:11-06:00',
  status: 'closed',
  observations: 'Entregar en la tarde',
  anotation: null,
  numberTemplate: { id: '1', prefix: '00100001', number: '4835', fullNumber: '001000014835', documentType: 'invoice', isElectronic: false },
  client: { id: '128', name: 'BAZAR MARY RINCON', identification: '1-0000-0000', identificationObject: { type: 'CF', number: '100000000' }, email: 'mary@correo.com' },
  subtotal: 14070,
  discount: 0,
  tax: 1829,
  total: 15899,
  totalPaid: 15899,
  balance: 0,
  term: 'De contado',
  saleCondition: 'CASH',
  paymentMethod: 'CASH',
  seller: { name: 'Andrés' },
  economicActivity: { id: '523402', code: '523402' },
  isVoidedByCreditNote: false,
  items: [
    {
      id: '898', name: 'ACEITE 3 EN 1', reference: 'R9X14', description: null, unit: 'Unid',
      productKey: '2411000000100', quantity: 1, price: 7350, discount: 0, total: 8305.5,
      tax: [{ id: '1', name: 'IVA', percentage: '13.00', amount: 955.5, categoryFavorable: { id: '5038' } }]
    },
    {
      id: '1183', name: 'TORNILLO', reference: 'TOR02', description: 'de 3/4', unit: 'Unid',
      productKey: '4294401030100', quantity: 2, price: 3360, discount: 10, total: 6797.28,
      tax: [{ id: '1', name: 'IVA', percentage: '13.00', amount: 786.24 }]
    }
  ]
};

const contexto = {
  clientes: new Map([['128', 7]]),
  productos: new Map([['898', 11], ['1183', 12]]),
  impuestos: new Map([['1', 1]]),
  plazos: new Map([['de contado', 1], ['15 dias', 3]]),
  metodos: new Map([['CASH', 1], ['CREDIT', 2]])
};

test('el caso completo: documento, cliente, totales y líneas', () => {
  const { fila, lineas, avisos } = facturaDesdeAlegra(FACTURA, contexto);
  assert.equal(fila.tipo_documento, 'factura');
  assert.equal(fila.serie, '00100001');
  assert.equal(fila.consecutivo, 4835);
  assert.equal(fila.numero, '001000014835');
  assert.equal(fila.electronica, false);
  assert.equal(fila.estado, 'emitida');
  assert.equal(fila.fecha, '2026-09-10');
  assert.equal(fila.cliente_id, 7);
  assert.equal(fila.condicion_venta, 'contado');
  assert.equal(fila.plazo_credito_id, 1);
  assert.equal(fila.metodo_pago_id, 1);
  assert.equal(fila.total, 15899);
  assert.equal(fila.saldo, 0);
  assert.equal(fila.actividad_economica, '523402');
  assert.equal(fila.alegra_id, '5398');
  assert.equal(lineas.length, 2);
  assert.deepEqual(avisos, []);
});

test('la cédula del cliente se guarda limpia, y el nombre tal como se facturó', () => {
  const { fila } = facturaDesdeAlegra(FACTURA, contexto);
  // Copia fija: si mañana se corrige la ficha del cliente, este documento no cambia.
  assert.equal(fila.cliente_identificacion, '100000000');
  assert.equal(fila.cliente_tipo_identificacion, 'CF');
  assert.equal(fila.cliente_nombre, 'BAZAR MARY RINCON');
});

test('cada línea guarda su tarifa y su monto de impuesto, no una constante', () => {
  const { lineas } = facturaDesdeAlegra(FACTURA, contexto);
  assert.equal(lineas[0].tarifa, 13);
  assert.equal(lineas[0].impuesto_monto, 955.5);
  assert.equal(lineas[0].producto_id, 11);
  assert.equal(lineas[0].cabys, '2411000000100');
  assert.equal(lineas[1].numero_linea, 2);
});

test('el descuento por porcentaje se convierte también a monto', () => {
  const { lineas } = facturaDesdeAlegra(FACTURA, contexto);
  // 2 × 3.360 = 6.720, menos 10 % = 672
  assert.equal(lineas[1].descuento_porcentaje, 10);
  assert.equal(lineas[1].descuento_monto, 672);
});

test('los estados de Alegra se traducen a lo que es el documento', () => {
  const casos = { draft: 'borrador', open: 'emitida', closed: 'emitida', void: 'anulada' };
  for (const [alegra, propio] of Object.entries(casos)) {
    const { fila } = facturaDesdeAlegra({ ...FACTURA, status: alegra }, contexto);
    assert.equal(fila.estado, propio, alegra);
  }
});

test('un tiquete no se guarda como factura', () => {
  const { fila } = facturaDesdeAlegra(
    { ...FACTURA, numberTemplate: { ...FACTURA.numberTemplate, documentType: 'saleTicket' } },
    contexto
  );
  assert.equal(fila.tipo_documento, 'tiquete');
});

test('la aceptación fiscal del origen y una clave válida demuestran emisión', () => {
  const { fila } = facturaDesdeAlegra(
    { ...FACTURA, numberTemplate: { ...FACTURA.numberTemplate, isElectronic: true }, stamp: { legalStatus:'STAMPED_AND_ACCEPTED', uuid: '5'.repeat(50) } },
    contexto
  );
  assert.equal(fila.electronica, true);
  assert.equal(fila.clave_hacienda.length, 50);
  assert.equal(fila.hacienda_estado, 'aceptada');
});

test('el plazo viene como texto: si no calza, se guarda igual y se avisa', () => {
  const { fila, avisos } = facturaDesdeAlegra({ ...FACTURA, term: '22 dias' }, contexto);
  assert.equal(fila.plazo_credito_id, null);
  assert.equal(fila.plazo_texto, '22 dias');
  assert.ok(avisos.includes('plazo_no_calza'));
});

test('un cliente o un producto que no está en la base se cuenta, no se inventa', () => {
  const { fila, lineas, avisos } = facturaDesdeAlegra(
    { ...FACTURA, client: { id: '999', name: 'CLIENTE BORRADO EN ALEGRA' } },
    contexto
  );
  assert.equal(fila.cliente_id, null);
  assert.equal(fila.cliente_nombre, 'CLIENTE BORRADO EN ALEGRA', 'el nombre se conserva para poder recrearlo');
  assert.ok(avisos.includes('cliente_no_encontrado'));

  const otra = facturaDesdeAlegra(
    { ...FACTURA, items: [{ ...FACTURA.items[0], id: '77777' }] },
    contexto
  );
  assert.equal(otra.lineas[0].producto_id, null);
  assert.ok(otra.avisos.includes('producto_no_encontrado'));
});

test('si la suma no da el total, se avisa en vez de guardar algo que no cuadra', () => {
  const { avisos } = facturaDesdeAlegra({ ...FACTURA, total: 99999 }, contexto);
  assert.ok(avisos.includes('los_totales_no_cuadran'));
  // Una diferencia de redondeo de un colón no es un problema.
  const redondeo = facturaDesdeAlegra({ ...FACTURA, total: 15898.5 }, contexto);
  assert.equal(redondeo.avisos.includes('los_totales_no_cuadran'), false);
});

test('las 153 facturas sin condición de venta se cargan igual, contadas', () => {
  const { fila, avisos } = facturaDesdeAlegra({ ...FACTURA, saleCondition: null }, contexto);
  assert.equal(fila.condicion_venta, null);
  assert.ok(avisos.includes('sin_condicion_de_venta'));
});

test('una anulada sin líneas no se cuenta como error', () => {
  const { avisos } = facturaDesdeAlegra({ ...FACTURA, status: 'void', items: [] }, contexto);
  assert.equal(avisos.includes('sin_lineas'), false);
});

test('sin id no se carga a medias', () => {
  assert.throws(() => facturaDesdeAlegra({ date: '2026-09-10' }, contexto), /sin id/);
});
