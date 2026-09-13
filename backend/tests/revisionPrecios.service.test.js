/**
 * Tests de las funciones puras del módulo revision-precios:
 * - construirItemsFactura: arma el payload de items que se envía a Alegra
 *   al crear la factura de compra (aquí vivió el bug del 13% hardcodeado)
 * - inferirTipoIdentificacion: tipo de cédula para el contacto en Alegra
 *
 * Ejecutar con: npm test
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  construirItemsFactura,
  inferirTipoIdentificacion
} = require('../src/modules/revision-precios/revision-precios.service');
const { normalizarImpuestos } = require('../utils/impuestosAlegra');

// Impuestos reales de la cuenta de Alegra (GET /taxes, 11 de setiembre de 2026).
const IMPUESTOS = normalizarImpuestos(require('./fixtures/impuestosAlegra.json').impuestos);

/** Línea de factura de proveedor como sale de Prisma (ProductoFactura) */
function productoBase(overrides = {}) {
  return {
    alegraItemId: '900',
    descripcion: 'PRODUCTO DE PRUEBA',
    cantidad: 2,
    precioUnitario: 100,   // SIN IVA, como viene del XML
    descuento: 0,          // monto en colones, no porcentaje
    impuesto: 26,          // monto en colones (13% de 200)
    totalLinea: 226,
    ...overrides
  };
}

describe('construirItemsFactura', () => {
  test('asigna la tarifa real de la línea, no 13% fijo', () => {
    const productos = [
      // 13%: subtotal 200, impuesto 26
      productoBase(),
      // Exento: sin impuesto
      productoBase({ alegraItemId: '901', impuesto: 0, totalLinea: 200 }),
      // 1% (canasta básica): subtotal 200, impuesto 2
      productoBase({ alegraItemId: '902', impuesto: 2, totalLinea: 202 }),
      // 4% (privados de salud): subtotal 200, impuesto 8
      productoBase({ alegraItemId: '903', impuesto: 8, totalLinea: 208 })
    ];

    const [iva13, exento, iva1, iva4] = construirItemsFactura(productos, IMPUESTOS);

    // Los ids son los de la cuenta. Antes esta prueba esperaba 3, 6 y 8, que
    // en Alegra son 0,5 %, 4 % y un factor inactivo: validaba el error.
    assert.deepEqual(iva13.tax, [{ id: 1, percentage: 13 }]);
    assert.deepEqual(exento.tax, [{ id: 2, percentage: 0 }]);
    assert.deepEqual(iva1.tax, [{ id: 4, percentage: 1 }]);
    assert.deepEqual(iva4.tax, [{ id: 6, percentage: 4 }]);
  });

  test('sin la lista de impuestos de Alegra no arma la compra', () => {
    assert.throws(() => construirItemsFactura([productoBase()]), /lista de impuestos/);
  });

  test('omite tax cuando la tarifa no es reconocible (no fuerza un impuesto)', () => {
    // 6.5% no existe en Costa Rica: subtotal 200, impuesto 13
    const [item] = construirItemsFactura([
      productoBase({ impuesto: 13, totalLinea: 213 })
    ], IMPUESTOS);

    assert.equal(item.tax, undefined);
    // El resto del item debe seguir bien formado
    assert.equal(item.id, '900');
    assert.equal(item.price, 100);
  });

  test('envía el precio original SIN IVA redondeado a 2 decimales', () => {
    const [item] = construirItemsFactura([
      productoBase({ precioUnitario: 1234.5678, impuesto: 0, totalLinea: 2469.14 })
    ], IMPUESTOS);
    assert.equal(item.price, 1234.57);
  });

  test('convierte el monto de descuento a porcentaje', () => {
    // 2 unidades × ₡100 = ₡200; descuento ₡20 → 10%
    const [item] = construirItemsFactura([
      productoBase({ descuento: 20, impuesto: 23.4, totalLinea: 203.4 })
    ], IMPUESTOS);
    assert.equal(item.discount, 10);
  });

  test('sin descuento envía discount 0', () => {
    const [item] = construirItemsFactura([productoBase()], IMPUESTOS);
    assert.equal(item.discount, 0);
  });

  test('convierte el alegraItemId a string y respeta la cantidad', () => {
    const [item] = construirItemsFactura([
      productoBase({ alegraItemId: 900, cantidad: 3.5, impuesto: 45.5, totalLinea: 395.5 })
    ], IMPUESTOS);
    assert.equal(item.id, '900');
    assert.equal(typeof item.id, 'string');
    assert.equal(item.quantity, 3.5);
  });

  test('no explota con precio 0 o cantidad inválida', () => {
    const [item] = construirItemsFactura([
      productoBase({ precioUnitario: 0, cantidad: null, descuento: 5, impuesto: 0, totalLinea: 0 })
    ], IMPUESTOS);
    assert.equal(item.price, 0);
    assert.equal(item.quantity, 1); // fallback
    assert.equal(item.discount, 0); // sin base no hay porcentaje
  });
});

describe('inferirTipoIdentificacion', () => {
  test('cédula física (9 dígitos) → CF', () => {
    assert.equal(inferirTipoIdentificacion('109870654'), 'CF');
    assert.equal(inferirTipoIdentificacion('1-0987-0654'), 'CF'); // con guiones
  });

  test('cédula jurídica (10 dígitos) → CJ', () => {
    assert.equal(inferirTipoIdentificacion('3102809428'), 'CJ');
    assert.equal(inferirTipoIdentificacion('3-102-809428'), 'CJ');
  });

  test('NITE (10 dígitos iniciando en 4 o 5) → NITE', () => {
    assert.equal(inferirTipoIdentificacion('4000042139'), 'NITE');
    assert.equal(inferirTipoIdentificacion('5100248515'), 'NITE');
  });

  test('DIMEX (11-12 dígitos) → DIMEX', () => {
    assert.equal(inferirTipoIdentificacion('155812345678'), 'DIMEX');
    assert.equal(inferirTipoIdentificacion('15581234567'), 'DIMEX');
  });

  test('sin cédula o largo desconocido → CJ (la mayoría son empresas)', () => {
    assert.equal(inferirTipoIdentificacion(null), 'CJ');
    assert.equal(inferirTipoIdentificacion(''), 'CJ');
    assert.equal(inferirTipoIdentificacion('12345'), 'CJ');
  });
});
