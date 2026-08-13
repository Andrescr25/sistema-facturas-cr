/**
 * Tests del motor de precios (backend/src/modules/precios/motor.js).
 * Ejecutar con: npm test
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { calcularMargenMeta, redondeoPsicologico, calcularTechoCompetencia, calcularPrecioSugerido, MARGEN_MAXIMO } = require('../src/modules/precios/motor');

describe('calcularTechoCompetencia', () => {
  test('techo = precio de competencia / (1 + margen pulpería)', () => {
    // Competencia vende a 1200 al público; con 20% de margen asumido para
    // la pulpería, no le puedo vender a más de 1000.
    assert.equal(calcularTechoCompetencia(1200, 20), 1000);
  });

  test('sin precio de competencia, no hay techo', () => {
    assert.equal(calcularTechoCompetencia(0), null);
    assert.equal(calcularTechoCompetencia(null), null);
  });

  test('usa MARGEN_PULPERIA_ASUMIDO (20%) por defecto', () => {
    assert.equal(calcularTechoCompetencia(1200), 1000);
  });
});

describe('calcularMargenMeta', () => {
  test('rotación alta (>=10 u/mes) baja 3 puntos: el cliente lo compra seguido y conoce el precio', () => {
    const m = calcularMargenMeta({ margenMetaCategoria: 25, margenMinimoCategoria: 15, unidadesMes: 18, clientesDistintos: 50 });
    assert.equal(m, 22);
  });

  test('clase B no ajusta', () => {
    const m = calcularMargenMeta({ margenMetaCategoria: 25, margenMinimoCategoria: 15, unidadesMes: 5, clientesDistintos: 20 });
    assert.equal(m, 25);
  });

  test('rotación baja (<3 u/mes) sube 5 puntos: el cliente no tiene referencia de precio', () => {
    const m = calcularMargenMeta({ margenMetaCategoria: 25, margenMinimoCategoria: 15, unidadesMes: 0.4, clientesDistintos: 10 });
    assert.equal(m, 30);
  });

  test('sin clase de rotación (nunca se vendió) no ajusta', () => {
    const m = calcularMargenMeta({ margenMetaCategoria: 25, margenMinimoCategoria: 15, unidadesMes: null, clientesDistintos: null });
    assert.equal(m, 25);
  });

  test('pocos clientes distintos (exclusividad) suma 3 puntos extra', () => {
    const m = calcularMargenMeta({ margenMetaCategoria: 25, margenMinimoCategoria: 15, unidadesMes: 5, clientesDistintos: 2 });
    assert.equal(m, 28);
  });

  test('ROMANA ELECTRONICA — caso real: clase A por facturación pero 0,2 u/mes, se le SUBE el margen', () => {
    // Con la clase A/B/C se le bajaban 3 puntos "porque rota rápido". Mueve
    // 2,4 unidades al año: el cliente no tiene ninguna referencia de precio.
    const m = calcularMargenMeta({ margenMetaCategoria: 25, margenMinimoCategoria: 15, unidadesMes: 0.2, clientesDistintos: 2 });
    assert.equal(m, 33); // 25 + 5 (rotación baja) + 3 (exclusividad)
  });

  test('un producto de mucha facturación Y mucha rotación sí baja el margen', () => {
    const m = calcularMargenMeta({ margenMetaCategoria: 25, margenMinimoCategoria: 15, unidadesMes: 14, clientesDistintos: 37 });
    assert.equal(m, 22); // 25 - 3, sin bono de exclusividad
  });

  test('rotación baja + exclusividad se acumulan', () => {
    const m = calcularMargenMeta({ margenMetaCategoria: 25, margenMinimoCategoria: 15, unidadesMes: 0.4, clientesDistintos: 1 });
    assert.equal(m, 33);
  });

  test('clientesDistintos en 0 (categoría con datos pero producto sin ventas) no dispara exclusividad', () => {
    const m = calcularMargenMeta({ margenMetaCategoria: 25, margenMinimoCategoria: 15, unidadesMes: null, clientesDistintos: 0 });
    assert.equal(m, 25);
  });

  test('nunca baja del margen mínimo de la categoría', () => {
    const m = calcularMargenMeta({ margenMetaCategoria: 14, margenMinimoCategoria: 12, unidadesMes: 18, clientesDistintos: 50 });
    assert.equal(m, 12); // 14 - 3 = 11, pero el piso es 12
  });

  test('nunca supera MARGEN_MAXIMO aunque los ajustes se acumulen', () => {
    const m = calcularMargenMeta({ margenMetaCategoria: 58, margenMinimoCategoria: 15, unidadesMes: 0.4, clientesDistintos: 1 });
    assert.equal(m, MARGEN_MAXIMO); // 58 + 5 + 3 = 66, tope en 60
  });
});

describe('redondeoPsicologico', () => {
  test('precios chicos (<₡1.000) redondean a múltiplos de 5', () => {
    assert.equal(redondeoPsicologico(83.2), 85);
    assert.equal(redondeoPsicologico(997), 995);
  });

  test('precios medios (₡1.000-10.000) redondean a múltiplos de 25', () => {
    assert.equal(redondeoPsicologico(1234), 1225);
    assert.equal(redondeoPsicologico(4788), 4800);
  });

  test('precios grandes (≥₡10.000) redondean a múltiplos de 100', () => {
    assert.equal(redondeoPsicologico(11371), 11400);
    assert.equal(redondeoPsicologico(47860), 47900);
  });
});

describe('calcularPrecioSugerido', () => {
  test('sin costo confiable no sugiere nada', () => {
    assert.equal(calcularPrecioSugerido({ costoSinIva: 0, margenMetaCategoria: 25, margenMinimoCategoria: 15 }), null);
    assert.equal(calcularPrecioSugerido({ costoSinIva: null, margenMetaCategoria: 25, margenMinimoCategoria: 15 }), null);
  });

  test('caso típico: margen de categoría sin ajustes', () => {
    // costo 75, margen 25% sobre venta -> precio = 75 / 0.75 = 100
    const r = calcularPrecioSugerido({
      costoSinIva: 75, margenMetaCategoria: 25, margenMinimoCategoria: 15,
      unidadesMes: 5, clientesDistintos: 20
    });
    assert.equal(r.precioSugerido, 100);
    assert.equal(r.margenObjetivo, 25);
    assert.equal(r.margenResultante, 25);
  });

  test('el margen resultante refleja el redondeo, no queda idéntico al objetivo', () => {
    const r = calcularPrecioSugerido({
      costoSinIva: 59.19, margenMetaCategoria: 25, margenMinimoCategoria: 15,
      unidadesMes: 18, clientesDistintos: 25
    });
    // margenObjetivo = 22 (A resta 3) -> precio crudo = 59.19/0.78 = 75.88 -> redondea a 75
    assert.equal(r.margenObjetivo, 22);
    assert.equal(r.precioSugerido, 75);
    assert.ok(Math.abs(r.margenResultante - 21.1) < 0.5);
  });

  test('techo de competencia limita el precio si lo supera', () => {
    const r = calcularPrecioSugerido({
      costoSinIva: 100, margenMetaCategoria: 40, margenMinimoCategoria: 15,
      unidadesMes: 5, clientesDistintos: 20,
      precioTechoCompetencia: 130
    });
    // sin techo: 100/0.60 = 166.67 -> con techo, se limita a 130 (ya cae en un múltiplo de 5)
    assert.equal(r.precioSugerido, 130);
  });

  test('el techo de competencia nunca fuerza un precio bajo el piso de margen mínimo', () => {
    const r = calcularPrecioSugerido({
      costoSinIva: 100, margenMetaCategoria: 40, margenMinimoCategoria: 15,
      unidadesMes: 5, clientesDistintos: 20,
      precioTechoCompetencia: 105 // por debajo del piso real (100/0.85 = 117.65)
    });
    // se ignora el techo de 105 y usa el piso: 117.65 -> redondea a 120
    assert.equal(r.precioSugerido, 120);
    assert.ok(r.precioSugerido > 105);
  });

  test('sin techo de competencia, se ignora el parámetro', () => {
    const r = calcularPrecioSugerido({
      costoSinIva: 75, margenMetaCategoria: 25, margenMinimoCategoria: 15,
      unidadesMes: 5, clientesDistintos: 20,
      precioTechoCompetencia: null
    });
    assert.equal(r.precioSugerido, 100);
  });

  test('producto sin historial de rotación (nunca vendido) igual recibe una sugerencia', () => {
    const r = calcularPrecioSugerido({
      costoSinIva: 50, margenMetaCategoria: 25, margenMinimoCategoria: 15,
      unidadesMes: null, clientesDistintos: null
    });
    assert.ok(r !== null);
    assert.equal(r.margenObjetivo, 25);
  });
});
