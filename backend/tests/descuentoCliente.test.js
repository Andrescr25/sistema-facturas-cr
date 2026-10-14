const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { descuentoAplicable, aplicarDescuentoEn } = require('../src/modules/facturacion/descuentoCliente.service');
const { armarLineas } = require('../src/modules/facturacion/facturaLineas');
const fuente = fs.readFileSync(path.join(__dirname, '../../frontend/src/utils/descuentoCliente.js'), 'utf8').replace(/^export /gm, '');
const { descuentoDelCliente, lineaConDescuentoCliente } = new Function(`${fuente}; return { descuentoDelCliente, lineaConDescuentoCliente };`)();
const cliente = { descuento_global: '5.00' };
const producto = { id: 12, alegra_id: 'otro-id', nombre: 'Producto', activo: true, precio: 100, costo: 79.1,
  tarifa: 13, impuesto_id: 1 }; // costo sin IVA 70, margen 30%
const db = { query: async () => ({ rows: [] }) };
const descontar = (items, productos = [producto], opciones = {}) => aplicarDescuentoEn(db, cliente, items, productos, p => p.id, opciones);

describe('descuento del cliente: la misma frontera en pantalla y servidor', () => {
  for (const [nombre, precio, costo, esperado] of [
    ['margen del 30%', 100, 70, 5], ['exactamente 21%', 100, 79, 0],
    ['debajo del 21%', 100, 80, 0], ['21% con decimales', 123.45, 97.5255, 0],
    ['arriba del 21%', 123.45, 97.5254, 5], ['sin costo', 100, undefined, 0],
    ['costo cero', 100, 0, 0], ['precio cero', 0, 70, 0], ['costo sospechoso', 100, 1, 0],
    ['costo infinito', 100, Infinity, 0]
  ]) test(nombre, () => {
    assert.equal(descuentoAplicable(precio, costo, 5), esperado);
    assert.equal(descuentoDelCliente(precio, costo, 5), esperado);
  });

  test('oferta o manual mayor gana, y cambiar cliente o precio retira solo la parte automática', () => {
    const condiciones = { porcentaje: 5, costos: new Map([[12, 70]]) };
    const original = { productoId: 12, price: 100, discount: 2 };
    const rebajada = lineaConDescuentoCliente(original, condiciones);
    assert.equal(rebajada.discount, 5);
    assert.equal(rebajada.descuentoBase, 2);
    assert.equal(lineaConDescuentoCliente({ ...rebajada, price: 80 }, condiciones).discount, 2);
    assert.equal(lineaConDescuentoCliente(rebajada, { porcentaje: 0, costos: new Map() }).discount, 2);
    assert.equal(lineaConDescuentoCliente({ ...original, discount: 10 }, condiciones).discount, 10);
    assert.equal(lineaConDescuentoCliente({ ...original, ofertaExceso: 10, descuentoBase: 2 }, condiciones).discount, 10);
    assert.equal(original.discount, 2);
  });
});

describe('cálculo autorizado antes de guardar la factura', () => {
  test('la pantalla y la factura coinciden en centavos, con descuentos e IVA por línea', async () => {
    const { calcularTotal, calcularSubtotal, calcularImpuestos } = await import('../../frontend/src/utils/facturacionUtils.js');
    const items = [{ productoId: 12, quantity: 1, price: 20.05, discount: 5, tax: [{ percentage: 13 }] },
      { productoId: 12, quantity: 1, price: 0.10, discount: 5, tax: [{ percentage: 13 }] }];
    const armado = armarLineas(items, new Map([['12', producto]]), i => i.productoId);
    assert.equal(calcularSubtotal(items), armado.subtotal);
    assert.equal(calcularImpuestos(items, null, []), armado.impuesto);
    assert.equal(calcularTotal(items, 0, null, []), armado.total);
    assert.equal(armado.total, 21.63);
  });
  test('5% automático y 10% manual se guardan como 5 y 10, sin acumular', async () => {
    const items = await descontar([{ productoId: 12, price: 100, quantity: 2, discount: 0 },
      { productoId: 12, price: 100, quantity: 1, discount: 10 }]);
    const factura = armarLineas(items, new Map([['12', producto]]), i => i.productoId);
    assert.deepEqual(factura.lineas.map(l => l.descuento_porcentaje), [5, 10]);
    assert.equal(factura.subtotal, 280);
    assert.equal(factura.descuento, 20);
    assert.equal(factura.impuesto, 36.4);
    assert.equal(factura.total, 316.4);
  });

  for (const tarifa of [0, 1, 2, 4, 8, 13]) test(`margen al IVA ${tarifa}%`, async () => {
    const p = { ...producto, tarifa, costo: 70 * (1 + tarifa / 100) };
    assert.equal((await descontar([{ productoId: 12, price: 100 }], [p]))[0].discount, 5);
    p.costo = 79 * (1 + tarifa / 100);
    assert.equal((await descontar([{ productoId: 12, price: 100 }], [p]))[0].discount, 0);
  });

  test('precio final del portal se convierte a sin IVA antes de medir margen', async () => {
    const items = await descontar([{ productoId: 12, price: 113, quantity: 2, discount: 0 }], [producto], { preciosConImpuesto: true });
    const factura = armarLineas(items, new Map([['12', producto]]), i => i.productoId, { preciosConImpuesto: true });
    assert.equal(factura.total, 214.7);
    assert.equal(factura.lineas[0].precio_unitario, 100);
  });

  test('no concede la rebaja cuando falta un costo confiable', async () => {
    assert.equal((await descontar([{ productoId: 12, price: 100 }], [{ ...producto, costo: null }]))[0].discount, 0);
    assert.equal((await descontar([{ productoId: 12, price: 100 }], [{ ...producto, tarifa: null }]))[0].discount, 0);
  });

  test('rechaza una vista previa vencida antes de crear un documento o un cobro', async () => {
    const item = { productoId: 12, price: 100, discount: 5, descuentoBase: 0 };
    assert.equal((await descontar([item], [producto], { revisado: 5 }))[0].discount, 5);
    await assert.rejects(descontar([item], [producto], { revisado: 10 }), e => e.status === 409);
    await assert.rejects(descontar([item], [{ ...producto, costo: 90.4 }], { revisado: 5 }), e => e.status === 409);
  });

  test('porcentajes no finitos o fuera de rango nunca producen importes negativos', async () => {
    for (const discount of [-1, 101, Infinity, 'texto']) {
      await assert.rejects(descontar([{ productoId: 12, price: 100, discount }]), e => e.status === 400);
    }
  });

  test('el costo se consulta en lote por ids propios, en la transacción recibida', async () => {
    const consultas = [];
    const local = { query: async (sql, params) => { consultas.push({ sql, params }); return { rows: [] }; } };
    await aplicarDescuentoEn(local, cliente, [{ productoId: 12, price: 100 }], [producto], p => p.id);
    assert.equal(consultas.length, 1);
    assert.deepEqual(consultas[0].params, [[12]]);
    assert.match(consultas[0].sql, /ch.producto_id = ANY\(\$1::int\[\]\)/);
  });

  test('el descuento y sus impuestos pasan al XML fiscal y el motivo sigue siendo explícito', async () => {
    const { venta, certificado } = require('./helpers/hacienda');
    const { firmar } = require('../src/integrations/hacienda/firma/xades');
    const { generarVenta } = require('../src/integrations/hacienda/xml/v4.4');
    const { validarXml } = require('../src/integrations/hacienda/xml/validar');
    const items = await descontar([{ productoId: 12, quantity: 2, price: 100, discount: 0 }]);
    const armado = armarLineas(items, new Map([['12', producto]]), i => i.productoId);
    for (const tipo of ['01', '04']) {
      const dato = venta(tipo);
      dato.documento = { ...dato.documento, total: armado.total, impuesto: armado.impuesto, descuento: armado.descuento };
      dato.lineas = armado.lineas.map(l => ({ ...l, cabys: '1234567890123', unidad: 'Unid', codigo_tarifa_hacienda: '08' }));
      assert.throws(() => generarVenta(dato), e => e.code === 'DATO_FISCAL_FALTANTE');
      dato.opciones.lineas = [{ numeroLinea: 1, codigoDescuento: '06' }];
      const xml = generarVenta(dato);
      assert.match(xml, /<TotalDescuentos>10.00000<\/TotalDescuentos>/);
      assert.match(xml, /<TotalComprobante>214.70000<\/TotalComprobante>/);
      const cert = certificado();
      await validarXml(firmar(xml, cert.p12, cert.pin), tipo);
    }
  });
});
