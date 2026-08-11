/**
 * Tests del matcher de nombres (backend/src/modules/precios/matcher.js).
 * Ejecutar con: npm test
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { normalizar, calcularScoreSimilitud, encontrarMejorMatch, UMBRAL_AUTOCONFIRMAR } = require('../src/modules/precios/matcher');

describe('normalizar', () => {
  test('quita tildes', () => {
    assert.equal(normalizar('Válvula Térmica'), 'valvula termica');
  });

  test('pasa a minúsculas', () => {
    assert.equal(normalizar('MARTILLO CARPINTERO'), 'martillo carpintero');
  });

  test('puntuación se vuelve espacio, no se pega a la palabra', () => {
    assert.equal(normalizar('TUBO 1/2" PVC'), 'tubo 1 2 pvc');
  });

  test('colapsa espacios múltiples', () => {
    assert.equal(normalizar('CINTA   METRICA    3MTRS'), 'cinta metrica 3mtrs');
  });

  test('vacío o null no explota', () => {
    assert.equal(normalizar(''), '');
    assert.equal(normalizar(null), '');
    assert.equal(normalizar(undefined), '');
  });
});

describe('calcularScoreSimilitud', () => {
  test('coincidencia total da 100', () => {
    const score = calcularScoreSimilitud('MARTILLO CARPINTERO 16 ONZ', 'Martillo Carpintero 16oz Stanley');
    assert.equal(score, 100);
  });

  test('nombres con tildes distintas igual matchean', () => {
    const score = calcularScoreSimilitud('VALVULA DE PASO 1/2', 'Válvula de Paso PVC 1/2 pulgada');
    assert.ok(score >= 66); // al menos 2 de 3 palabras clave
  });

  test('sin relación da score bajo', () => {
    const score = calcularScoreSimilitud('CLAVO ACERO 2 PULGADAS', 'Shampoo para carro con cera');
    assert.ok(score < 40);
  });

  test('nombre propio vacío da 0, no explota', () => {
    assert.equal(calcularScoreSimilitud('', 'Cualquier cosa'), 0);
  });

  test('nombre externo vacío da 0', () => {
    const score = calcularScoreSimilitud('MARTILLO CARPINTERO', '');
    assert.equal(score, 0);
  });

  test('palabras cortas (<=3 letras) no cuentan para el score', () => {
    // "de", "1/2", "PVC" (3 letras) quedan fuera; solo "TUBO" pasa el
    // filtro de longitud — y una sola palabra clave no alcanza el mínimo
    // (MIN_PALABRAS_CLAVE=2), así que da 0 en vez de un 100% engañoso.
    const score = calcularScoreSimilitud('TUBO DE 1/2 PVC', 'Tubo de riego industrial');
    assert.equal(score, 0);
  });

  test('caso real: nombre corto y genérico (una sola palabra clave) nunca da un score alto, aunque "matchee" 100%', () => {
    // Encontrado en producción: "ACEITE 3 EN 1 MD" se auto-confirmó contra
    // "Aromatizante Glade Aceites Naturales" — nada que ver, solo comparten
    // la palabra "aceite", que es la única palabra clave de más de 3 letras.
    const score = calcularScoreSimilitud('ACEITE 3 EN 1 MD', 'Aromatizante Glade Aceites Naturales');
    assert.equal(score, 0);
  });

  test('dos palabras clave sí pueden dar un score alto y confiable', () => {
    const score = calcularScoreSimilitud('DESINFECTANTE EN GALON', 'Desinfectante Florex floral galón -3785ml');
    assert.equal(score, 100);
  });
});

describe('encontrarMejorMatch', () => {
  test('elige el candidato con mayor score', () => {
    const candidatos = [
      { skuExterno: 'A', nombreExterno: 'Tornillo Phillips 1 pulgada' },
      { skuExterno: 'B', nombreExterno: 'Martillo Carpintero 16oz Stanley' },
      { skuExterno: 'C', nombreExterno: 'Martillo de goma' }
    ];
    const mejor = encontrarMejorMatch('MARTILLO CARPINTERO 16 ONZ', candidatos);
    assert.equal(mejor.skuExterno, 'B');
    assert.equal(mejor.score, 100);
  });

  test('sin candidatos por encima del umbral, devuelve null', () => {
    const candidatos = [{ skuExterno: 'X', nombreExterno: 'Shampoo para carro' }];
    const mejor = encontrarMejorMatch('CLAVO ACERO 2 PULGADAS', candidatos);
    assert.equal(mejor, null);
  });

  test('lista vacía de candidatos devuelve null sin explotar', () => {
    assert.equal(encontrarMejorMatch('MARTILLO', []), null);
    assert.equal(encontrarMejorMatch('MARTILLO', null), null);
  });

  test('un match perfecto supera el umbral de auto-confirmación', () => {
    const candidatos = [{ skuExterno: 'A', nombreExterno: 'Martillo Carpintero 16oz Stanley' }];
    const mejor = encontrarMejorMatch('MARTILLO CARPINTERO 16 ONZ', candidatos);
    assert.ok(mejor.score >= UMBRAL_AUTOCONFIRMAR);
  });
});
