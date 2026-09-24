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

const { clasificarProducto, CLASIFICACION, IVA_ASUMIDO, tasaIvaDe } = require('../src/modules/precios/auditoria');

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
  test('sin costo en Alegra pero CON costo de facturas -> se evalúa ese costo, no SIN_COSTO', () => {
    // Antes daba SIN_COSTO: la fila mostraba el costo derivado y a la vez la
    // insignia "Sin costo". SIN_COSTO es "no hay costo por ningún lado".
    const r = clasificarProducto({ price: 500, cost: 0, costoDerivado: 300 });
    assert.equal(r.clasificacion, CLASIFICACION.OK);
    assert.equal(r.origenCosto, 'facturas');
    assert.equal(r.costoSugerido, 300);
  });

  test('EXTENSION CTE BLANCA 3 MTS — caso real: el margen es delgado (~7%), no el -199% que mostraba el costo envenenado', () => {
    // ₡1.164,47 CON IVA = ₡1.030,5 sin IVA, contra un precio de ₡1.106,19.
    // El -199% salía de una fila de costo_historico de otro producto (₡3.740).
    const r = clasificarProducto({ price: 1106.19, cost: 0, costoDerivado: 1164.47 });
    assert.equal(r.clasificacion, CLASIFICACION.OK);
    assert.equal(r.origenCosto, 'facturas');
    assert.ok(r.margenReal > 6 && r.margenReal < 8, `margen esperado ~6.8%, fue ${r.margenReal}`);
  });

  test('sin costo en Alegra y sin costo_historico -> SIN_COSTO con sugerido null', () => {
    const r = clasificarProducto({ price: 500, cost: null, costoDerivado: null });
    assert.equal(r.clasificacion, CLASIFICACION.SIN_COSTO);
    assert.equal(r.costoSugerido, null);
    assert.equal(r.origenCosto, null);
  });

  test('un costo de facturas absurdo se marca sospechoso igual que uno de Alegra', () => {
    // CINTA MOTEX: ₡27.293 derivado contra un precio de ₡325.
    const r = clasificarProducto({ price: 325, cost: 0, costoDerivado: 27293.8 });
    assert.equal(r.clasificacion, CLASIFICACION.UNIDAD_SOSPECHOSA);
  });

  test('historial de compras que se contradice -> UNIDAD_SOSPECHOSA aunque el ratio cierre', () => {
    const r = clasificarProducto({ price: 100, cost: 70, costoDerivado: 70, historialInestable: true });
    assert.equal(r.clasificacion, CLASIFICACION.UNIDAD_SOSPECHOSA);
  });

  test('el cruce de fuentes no compara el costo derivado consigo mismo', () => {
    // Sin costo en Alegra, el costo base ES el derivado: compararlos daría
    // 0% de diferencia siempre y el cruce no aportaría nada.
    const r = clasificarProducto({ price: 100, cost: 0, costoDerivado: 70 });
    assert.equal(r.clasificacion, CLASIFICACION.OK);
    assert.equal(r.diffPorcentaje, null);
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

  test('usa la tarifa real del producto: al 1 % el margen es 20 %, no 28,5 %', () => {
    // costo sin IVA 1000 → con IVA al 1 % = 1010; precio sin IVA 1250.
    const r = clasificarProducto({ price: 1250, cost: 1010, costoDerivado: null, tasaIva: '1.000' });
    assert.equal(Math.round(r.costoSinIva), 1000);
    assert.equal(Math.round(r.margenReal * 10) / 10, 20);
  });

  test('exento (0 %): el costo con IVA ya es el costo sin IVA', () => {
    const r = clasificarProducto({ price: 1250, cost: 1000, costoDerivado: null, tasaIva: 0 });
    assert.equal(r.costoSinIva, 1000);
  });

  test('tarifa sin sincronizar (null): cae al 13 %, no a exento', () => {
    const r = clasificarProducto({ price: 1250, cost: 1130, costoDerivado: null, tasaIva: null });
    assert.equal(Math.round(r.costoSinIva), 1000);
    assert.equal(tasaIvaDe(null), IVA_ASUMIDO);
    assert.equal(tasaIvaDe(undefined), IVA_ASUMIDO);
    assert.equal(tasaIvaDe('4.000'), 4);
  });
});

describe('la tarifa de IVA del producto, cuando se conoce', () => {
  // En este catálogo 91 productos activos NO están al 13%: 44 al 1%, 15 al 2%,
  // 9 al 4%, 6 exentos, 3 al 8% y 14 sin impuesto asignado. Quitarles un 13%
  // que no pagan corre el costo y con él el margen.

  test('a un producto al 1% no se le quita un 13%', () => {
    // Costo 101 con IVA al 1% son 100 sin IVA; asumiendo 13% darían 89,38.
    const r = clasificarProducto({ price: 200, cost: 101, costoDerivado: null, tarifa: 1 });
    assert.ok(Math.abs(r.costoSinIva - 100) < 0.01, `costo sin IVA esperado 100, fue ${r.costoSinIva}`);
  });

  test('sin tarifa se sigue asumiendo 13%, como antes', () => {
    // Los scripts que todavía no la tienen a mano no cambian de resultado.
    const r = clasificarProducto({ price: 200, cost: 113, costoDerivado: null });
    assert.ok(Math.abs(r.costoSinIva - 100) < 0.01, `costo sin IVA esperado 100, fue ${r.costoSinIva}`);
  });

  test('la tarifa real puede cambiar el veredicto: un exento que se vende con pérdida', () => {
    // Costo 105 y precio 100. Siendo exento, el costo sin IVA son 105: pierde
    // plata. Asumiendo 13%, el costo "sin IVA" daría 92,9 y parecería sano —
    // que es exactamente el error que este parámetro viene a evitar.
    const conTarifaReal = clasificarProducto({ price: 100, cost: 105, costoDerivado: null, tarifa: 0 });
    assert.equal(conTarifaReal.clasificacion, CLASIFICACION.MARGEN_NEGATIVO);

    const asumiendo13 = clasificarProducto({ price: 100, cost: 105, costoDerivado: null });
    assert.equal(asumiendo13.clasificacion, CLASIFICACION.OK);
  });

  test('una tarifa inválida no rompe: se cae al 13% en vez de dividir por basura', () => {
    for (const mala of ['no es número', NaN, undefined]) {
      const r = clasificarProducto({ price: 200, cost: 113, costoDerivado: null, tarifa: mala });
      assert.ok(Math.abs(r.costoSinIva - 100) < 0.01, `con tarifa ${String(mala)} fue ${r.costoSinIva}`);
    }
  });
});
