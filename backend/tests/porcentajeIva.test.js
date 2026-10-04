/**
 * El porcentaje de IVA que de verdad trae una línea de factura de proveedor
 * (`calcularPorcentajeIva`, en precios/costo.js).
 *
 * De ahí salen el costo de cada compra y el impuesto que se le propone a un
 * producto nuevo: Costa Rica tiene tarifas de 0, 1, 2, 4, 8 y 13 %, y asumir
 * 13 % es el error que más veces se cometió en este sistema.
 *
 * Estas pruebas vivían en impuestosAlegra.test.js, junto a las de elegir el
 * impuesto de Alegra para cada línea; eso se retiró el 2026-10-04 con el envío
 * de compras a Alegra.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { calcularPorcentajeIva } = require('../src/modules/precios/costo');

describe('calcularPorcentajeIva', () => {
  test('calcula 13% para la tarifa general', () => {
    // subtotal 100, impuesto 13 → total línea 113
    assert.equal(calcularPorcentajeIva({ impuesto: 13, totalLinea: 113 }), 13);
  });

  test('calcula tarifas reducidas de Costa Rica (1%, 2%, 4%, 8%)', () => {
    assert.equal(calcularPorcentajeIva({ impuesto: 1, totalLinea: 101 }), 1);
    assert.equal(calcularPorcentajeIva({ impuesto: 2, totalLinea: 102 }), 2);
    assert.equal(calcularPorcentajeIva({ impuesto: 4, totalLinea: 104 }), 4);
    assert.equal(calcularPorcentajeIva({ impuesto: 8, totalLinea: 108 }), 8);
  });

  test('devuelve 0 para líneas exentas (impuesto 0)', () => {
    assert.equal(calcularPorcentajeIva({ impuesto: 0, totalLinea: 100 }), 0);
  });

  test('maneja montos reales con decimales', () => {
    // subtotal 875.00, IVA 13% = 113.75 → total 988.75
    const pct = calcularPorcentajeIva({ impuesto: 113.75, totalLinea: 988.75 });
    assert.ok(Math.abs(pct - 13) < 0.001, `esperaba ~13, obtuve ${pct}`);
  });

  test('acepta valores como string (vienen así de algunos parsers)', () => {
    assert.equal(calcularPorcentajeIva({ impuesto: '13', totalLinea: '113' }), 13);
  });

  test('devuelve 0 con datos inválidos en vez de NaN o Infinity', () => {
    assert.equal(calcularPorcentajeIva({ impuesto: null, totalLinea: null }), 0);
    assert.equal(calcularPorcentajeIva({ impuesto: undefined, totalLinea: undefined }), 0);
    assert.equal(calcularPorcentajeIva({ impuesto: 'abc', totalLinea: 'xyz' }), 0);
    // impuesto mayor que el total (subtotal negativo) no debe explotar
    assert.equal(calcularPorcentajeIva({ impuesto: 150, totalLinea: 100 }), 0);
    // total 0
    assert.equal(calcularPorcentajeIva({ impuesto: 13, totalLinea: 0 }), 0);
  });
});
