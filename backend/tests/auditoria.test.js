/**
 * Tests del clasificador de calidad de costo (backend/src/modules/precios/auditoria.js).
 *
 * Los 4 primeros casos son datos REALES tomados en vivo de la base de
 * producción (alegra_products_cache + costo_historico), no inventados —
 * son justo los que motivaron el detector: parecían venderse con pérdida
 * y en realidad era el costo guardado por caja/paquete y el precio por
 * unidad, con el factorConversion mal puesto o inconsistente entre mapeos.
 *
 * Ejecutar con: npm test
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { clasificarProducto, CLASIFICACION } = require('../src/modules/precios/auditoria');

describe('clasificarProducto — casos reales de producción', () => {
  test('SILICON BARRA DELGADA — factor 60 no aplicado en el costo de Alegra', () => {
    const r = clasificarProducto({ price: 110.62, cost: 3551.36, costoDerivado: 59.1893 });
    assert.equal(r.clasificacion, CLASIFICACION.UNIDAD_SOSPECHOSA);
  });

  test('BOLSA P/ CHORREAR CAFE — factor 12 no aplicado', () => {
    const r = clasificarProducto({ price: 300, cost: 2560.82, costoDerivado: 213.4017 });
    assert.equal(r.clasificacion, CLASIFICACION.UNIDAD_SOSPECHOSA);
  });

  test('FOLDER MANILA SURTI. COLORES. — factor mal puesto en 1', () => {
    const r = clasificarProducto({ price: 84, cost: 3132.16, costoDerivado: 725.455 });
    assert.equal(r.clasificacion, CLASIFICACION.UNIDAD_SOSPECHOSA);
  });

  test('CINTA MOTEX 5500 — costo de Alegra y el derivado COINCIDEN (mismo error, dos mapeos en conflicto): el ratio lo agarra igual', () => {
    const r = clasificarProducto({ price: 325, cost: 27293.8, costoDerivado: 27293.8 });
    assert.equal(r.clasificacion, CLASIFICACION.UNIDAD_SOSPECHOSA);
  });

  test('SODA OLGA / UNION LISA 1/2 PVC — caso sano real, no debe marcarse', () => {
    // costo con IVA ~59, precio 84.75 -> costo sin IVA ~52.2, margen ~38%.
    const r = clasificarProducto({ price: 84.75, cost: 59, costoDerivado: 59 });
    assert.equal(r.clasificacion, CLASIFICACION.OK);
    assert.ok(r.margenReal > 30 && r.margenReal < 45);
  });
});

describe('clasificarProducto — reglas', () => {
  test('sin costo en Alegra -> SIN_COSTO, y sugiere el derivado si existe', () => {
    const r = clasificarProducto({ price: 500, cost: 0, costoDerivado: 300 });
    assert.equal(r.clasificacion, CLASIFICACION.SIN_COSTO);
    assert.equal(r.costoSugerido, 300);
  });

  test('sin costo en Alegra y sin costo_historico -> SIN_COSTO con sugerido null', () => {
    const r = clasificarProducto({ price: 500, cost: null, costoDerivado: null });
    assert.equal(r.clasificacion, CLASIFICACION.SIN_COSTO);
    assert.equal(r.costoSugerido, null);
  });

  test('ratio costo/precio > 3 marca UNIDAD_SOSPECHOSA aunque no haya costo_historico para cruzar', () => {
    const r = clasificarProducto({ price: 100, cost: 400, costoDerivado: null });
    assert.equal(r.clasificacion, CLASIFICACION.UNIDAD_SOSPECHOSA);
  });

  test('PASADOR CTE C/GANCHO — costo real de producción (₡1) casi cero frente a un precio de ₡1.233: no es un margen del 99.9%, es un placeholder mal cargado', () => {
    const r = clasificarProducto({ price: 1233, cost: 1, costoDerivado: null });
    assert.equal(r.clasificacion, CLASIFICACION.UNIDAD_SOSPECHOSA);
  });

  test('costo sospechosamente bajo (<5% del precio) marca UNIDAD_SOSPECHOSA aunque el ratio "alto" nunca se dispare', () => {
    // costo con IVA 4 (sin IVA ~3.5) vs precio 100 -> ratio 0.035, muy por
    // debajo de 3 (no dispararía la regla vieja) pero un margen implícito
    // de ~96% no es real en este catálogo.
    const r = clasificarProducto({ price: 100, cost: 4, costoDerivado: null });
    assert.equal(r.clasificacion, CLASIFICACION.UNIDAD_SOSPECHOSA);
  });

  test('margen alto pero plausible (dentro de lo medido en el catálogo real) no se marca sospechoso', () => {
    // costo con IVA 20 (sin IVA ~17.7) vs precio 100 -> ratio 0.177, margen ~82%.
    // Alto, pero por encima del piso de 5% que dispara la sospecha.
    const r = clasificarProducto({ price: 100, cost: 20, costoDerivado: null });
    assert.equal(r.clasificacion, CLASIFICACION.OK);
  });

  test('margen negativo real (costo y derivado de acuerdo, ratio moderado) se marca MARGEN_NEGATIVO, no UNIDAD_SOSPECHOSA', () => {
    // costo con IVA 150 (sin IVA ~132.7) vs precio 100 -> ratio 1.33, dentro
    // del rango ambiguo pero por debajo del umbral de "error de unidad".
    const r = clasificarProducto({ price: 100, cost: 150, costoDerivado: 150 });
    assert.equal(r.clasificacion, CLASIFICACION.MARGEN_NEGATIVO);
  });

  test('costo de Alegra y derivado difieren más del 25% -> UNIDAD_SOSPECHOSA por cruce', () => {
    // ratio costo/precio se mantiene bajo (no dispara la regla dura), pero
    // las dos fuentes no concuerdan.
    const r = clasificarProducto({ price: 100, cost: 90, costoDerivado: 60 });
    assert.equal(r.clasificacion, CLASIFICACION.UNIDAD_SOSPECHOSA);
  });

  test('producto sano: costo y precio consistentes, sin costo_historico para cruzar', () => {
    const r = clasificarProducto({ price: 100, cost: 70, costoDerivado: null });
    assert.equal(r.clasificacion, CLASIFICACION.OK);
    assert.ok(r.margenReal > 0);
  });

  test('nunca explota con datos faltantes/negativos', () => {
    const r = clasificarProducto({ price: null, cost: undefined, costoDerivado: -5 });
    assert.equal(r.clasificacion, CLASIFICACION.SIN_COSTO);
  });
});
