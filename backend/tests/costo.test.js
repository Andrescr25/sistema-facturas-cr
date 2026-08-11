/**
 * Tests del cálculo de costo unitario real (backend/src/modules/precios/costo.js).
 *
 * Esta función vivía triplicada (revision-precios, proveedorAsignacionService,
 * productos-revision) sin un solo test. Se extrajo a un módulo único como
 * parte del rediseño de la estrategia de precios — ver el plan en
 * /Users/joseandres/.claude/plans/ok-ya-lo-vi-adaptive-sky.md.
 *
 * Casos elegidos a partir de un error real encontrado en producción: el
 * costo de "SILICON BARRA DELGADA" en Alegra (₡3.551, con IVA, por caja de
 * 60) parecía diez veces mayor que el precio de venta unitario (₡111) hasta
 * aplicarle el factorConversion — no era una venta con pérdida, era una
 * unidad sin convertir. Ejecutar con: npm test
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  calcularCostoUnitarioProveedor,
  calcularCostoUnitarioPropio
} = require('../src/modules/precios/costo');

// Los cálculos intermedios (ej. 26/200*100) no siempre caen en un número
// exacto en binario — se compara redondeado a 2 decimales, como hace
// cualquier caller real antes de mostrar o guardar el costo.
const round2 = (n) => Math.round(n * 100) / 100;

describe('calcularCostoUnitarioProveedor', () => {
  test('sin descuento, IVA 13% — costo con IVA en unidades del proveedor', () => {
    const r = calcularCostoUnitarioProveedor({
      precioUnitario: 100, descuento: 0, cantidad: 2, impuesto: 26, totalLinea: 226
    });
    assert.equal(r.descuentoPorcentaje, 0);
    assert.equal(r.costoSinIvaConDescuento, 100);
    assert.equal(round2(r.porcentajeIva), 13);
    assert.equal(round2(r.costoConIva), 113);
  });

  test('con descuento del 10% aplicado antes del IVA', () => {
    // 2 unidades a 100 = 200 sin descuento; descuento 20 = 10%; sobre 180
    // queda un IVA de 23.4 (13%).
    const r = calcularCostoUnitarioProveedor({
      precioUnitario: 100, descuento: 20, cantidad: 2, impuesto: 23.4, totalLinea: 203.4
    });
    assert.equal(r.descuentoPorcentaje, 10);
    assert.equal(r.costoSinIvaConDescuento, 90);
    assert.equal(Math.round(r.costoConIva * 100) / 100, 101.7);
  });

  test('tarifa de IVA distinta a 13% (canasta básica, 1%) se respeta', () => {
    const r = calcularCostoUnitarioProveedor({
      precioUnitario: 100, descuento: 0, cantidad: 1, impuesto: 1, totalLinea: 101
    });
    assert.equal(r.porcentajeIva, 1);
    assert.equal(r.costoConIva, 101);
  });

  test('producto exento (impuesto 0) no agrega IVA', () => {
    const r = calcularCostoUnitarioProveedor({
      precioUnitario: 500, descuento: 0, cantidad: 1, impuesto: 0, totalLinea: 500
    });
    assert.equal(r.porcentajeIva, 0);
    assert.equal(r.costoConIva, 500);
  });

  test('cantidad ausente o 0 se trata como 1 (evita división por cero/NaN)', () => {
    // Consistente con el patrón "|| 1" ya usado en 2 de las 3 implementaciones
    // originales — cantidad 0/null no debería significar "descuento infinito".
    const r = calcularCostoUnitarioProveedor({
      precioUnitario: 100, descuento: 5, cantidad: 0, impuesto: 0, totalLinea: 0
    });
    assert.ok(Number.isFinite(r.descuentoPorcentaje));
    assert.ok(Number.isFinite(r.costoConIva));
    assert.equal(round2(r.descuentoPorcentaje), 5); // 5 de descuento sobre 100 (cantidad→1)
  });

  test('sin datos (línea vacía) devuelve 0, no NaN', () => {
    const r = calcularCostoUnitarioProveedor({});
    assert.equal(r.costoConIva, 0);
    assert.equal(r.descuentoPorcentaje, 0);
  });

  test('acepta valores como string (vienen así de Prisma/XML)', () => {
    const r = calcularCostoUnitarioProveedor({
      precioUnitario: '100', descuento: '0', cantidad: '2', impuesto: '26', totalLinea: '226'
    });
    assert.equal(round2(r.costoConIva), 113);
  });
});

describe('calcularCostoUnitarioPropio', () => {
  test('caso real: proveedor factura por caja, nosotros vendemos por unidad', () => {
    // Caja de 60 unidades a ₡3.000 sin IVA -> con 13% de IVA, ₡3.390 la caja.
    // factor = unidadesPropias / unidadProveedor = 60.
    const r = calcularCostoUnitarioPropio(
      { precioUnitario: 3000, descuento: 0, cantidad: 1, impuesto: 390, totalLinea: 3390 },
      60
    );
    assert.equal(round2(r.costoConIva), 3390);
    assert.equal(r.factor, 60);
    assert.equal(round2(r.costoUnitario), 56.5);
  });

  test('sin factorConversion (null/undefined), asume 1:1', () => {
    const linea = { precioUnitario: 100, descuento: 0, cantidad: 1, impuesto: 13, totalLinea: 113 };
    const sinFactor = calcularCostoUnitarioPropio(linea, null);
    const conFactorUno = calcularCostoUnitarioPropio(linea, 1);
    assert.equal(sinFactor.factor, 1);
    assert.equal(sinFactor.costoUnitario, conFactorUno.costoUnitario);
  });

  test('factor 0 o inválido cae a 1, no divide por cero', () => {
    const linea = { precioUnitario: 100, descuento: 0, cantidad: 1, impuesto: 13, totalLinea: 113 };
    const factorCero = calcularCostoUnitarioPropio(linea, 0);
    const factorNaN = calcularCostoUnitarioPropio(linea, 'abc');
    assert.equal(factorCero.factor, 1);
    assert.equal(factorNaN.factor, 1);
    assert.ok(Number.isFinite(factorCero.costoUnitario));
  });

  test('factor fraccionario (proveedor vende suelto, nosotros por paquete)', () => {
    // Proveedor factura 50 sueltos = 1 paquete propio -> factor 0.02.
    const r = calcularCostoUnitarioPropio(
      { precioUnitario: 10, descuento: 0, cantidad: 50, impuesto: 65, totalLinea: 565 },
      0.02
    );
    // costoConIva es por unidad del proveedor (10 * 1.13 = 11.3); al dividir
    // por un factor <1 el costo por unidad propia sube, como corresponde.
    assert.equal(Math.round(r.costoConIva * 100) / 100, 11.3);
    assert.equal(Math.round(r.costoUnitario * 100) / 100, 565);
  });
});
