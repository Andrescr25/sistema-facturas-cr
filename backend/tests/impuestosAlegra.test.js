/**
 * Tests del helper de impuestos (utils/impuestosAlegra.js)
 *
 * Este helper decide qué tarifa de IVA se envía a Alegra por cada línea
 * de factura, así que un error aquí significa impuestos mal declarados.
 *
 * Ejecutar con: npm test  (usa el test runner nativo de Node)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  MAPEO_IMPUESTOS_ALEGRA,
  calcularPorcentajeIva,
  obtenerImpuestoAlegra
} = require('../utils/impuestosAlegra');

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

describe('obtenerImpuestoAlegra', () => {
  test('mapea cada tarifa de Costa Rica a su ID de Alegra', () => {
    const casos = [
      { impuesto: 13, totalLinea: 113, id: 1, nombre: 'IVA 13%' },
      { impuesto: 8, totalLinea: 108, id: 9, nombre: 'IVA 8%' },
      { impuesto: 4, totalLinea: 104, id: 8, nombre: 'IVA 4%' },
      { impuesto: 2, totalLinea: 102, id: 7, nombre: 'IVA 2%' },
      { impuesto: 1, totalLinea: 101, id: 6, nombre: 'IVA 1%' },
      { impuesto: 0, totalLinea: 100, id: 3, nombre: 'Exento' }
    ];

    for (const caso of casos) {
      const tax = obtenerImpuestoAlegra(caso);
      assert.ok(tax, `tarifa de ${caso.nombre} no fue reconocida`);
      assert.equal(tax.id, caso.id, `${caso.nombre}: esperaba id ${caso.id}, obtuve ${tax.id}`);
      assert.equal(tax.nombre, caso.nombre);
    }
  });

  test('tolera desviaciones menores a 0.5% (redondeos del XML)', () => {
    // 13.4% efectivo (diferencia 0.4 < 0.5) → debe mapear a 13%
    const tax = obtenerImpuestoAlegra({ impuesto: 13.4, totalLinea: 113.4 });
    assert.ok(tax);
    assert.equal(tax.id, 1);
  });

  test('devuelve null para tarifas no reconocidas en vez de forzar 13%', () => {
    // 6.5% no existe en Costa Rica → null (Alegra usará el impuesto del producto)
    assert.equal(obtenerImpuestoAlegra({ impuesto: 6.5, totalLinea: 106.5 }), null);
    // 10% tampoco
    assert.equal(obtenerImpuestoAlegra({ impuesto: 10, totalLinea: 110 }), null);
  });

  test('en el límite de la tolerancia (exactamente 0.5%) NO mapea', () => {
    // 13.5% → diferencia exacta de 0.5 con 13% no cumple "< 0.5"
    // y la diferencia con... no hay tarifa a 14, así que debe ser null
    assert.equal(obtenerImpuestoAlegra({ impuesto: 13.5, totalLinea: 113.5 }), null);
  });

  test('nunca devuelve un impuesto distinto al más cercano', () => {
    // 1.3% está entre 1% (dif 0.3) y 2% (dif 0.7) → debe elegir 1%
    const tax = obtenerImpuestoAlegra({ impuesto: 1.3, totalLinea: 101.3 });
    assert.ok(tax);
    assert.equal(tax.id, 6);
  });
});

describe('MAPEO_IMPUESTOS_ALEGRA', () => {
  test('contiene las 6 tarifas de IVA de Costa Rica sin duplicados', () => {
    assert.equal(MAPEO_IMPUESTOS_ALEGRA.length, 6);
    const porcentajes = MAPEO_IMPUESTOS_ALEGRA.map(t => t.porcentaje);
    assert.deepEqual([...porcentajes].sort((a, b) => a - b), [0, 1, 2, 4, 8, 13]);
    const ids = new Set(MAPEO_IMPUESTOS_ALEGRA.map(t => t.id));
    assert.equal(ids.size, 6, 'hay IDs de Alegra duplicados en el mapeo');
  });
});
