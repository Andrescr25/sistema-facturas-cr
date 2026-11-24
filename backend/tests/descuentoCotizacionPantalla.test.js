const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * El descuento de la cotización en pantalla (frontend/src/utils/descuentoCotizacion.js).
 * El módulo es ESM sin imports: se lee, se le quitan los `export` y se evalúa.
 */
const FUENTE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'descuentoCotizacion.js'), 'utf8');
const { porcentajeEscrito, conDescuento, textoPorcentaje, rebajaDeLineas } = new Function(
  `${FUENTE.replace(/^export /gm, '')}
   return { porcentajeEscrito, conDescuento, textoPorcentaje, rebajaDeLineas };`
)();

describe('el campo «Descuento %»', () => {
  test('vacío es 0, y se escribe con punto o con coma', () => {
    assert.equal(porcentajeEscrito(''), 0);
    assert.equal(porcentajeEscrito('5'), 5);
    assert.equal(porcentajeEscrito('2,5'), 2.5);
    assert.equal(porcentajeEscrito(' 7.25 '), 7.25);
  });

  test('fuera de 0 a 100 o sin número no sirve', () => {
    for (const malo of ['-1', '101', 'abc', '5%']) assert.equal(porcentajeEscrito(malo), null, malo);
  });

  test('lo que vuelve a mostrar el campo se puede leer de nuevo igual', () => {
    for (const p of [5, 2.5, 0]) assert.equal(porcentajeEscrito(textoPorcentaje(p)), p);
    assert.equal(textoPorcentaje(2.5), '2,5');
  });

  test('el total con 5 % de ₡80.000 es ₡76.000', () => {
    assert.equal(conDescuento(80000, 5), 76000);
    assert.equal(conDescuento(80000, null), 80000);
  });

  test('el enlace del cliente suma lo rebajado de cada línea', () => {
    assert.equal(rebajaDeLineas([{ importe: 9500, importeLista: 10000 }, { importe: 190, importeLista: 200 }]), 510);
    assert.equal(rebajaDeLineas([{ importe: 9500 }]), 0, 'una cotización de antes no trae importeLista: sin rebaja');
  });
});
