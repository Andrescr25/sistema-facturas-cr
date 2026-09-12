const { test, describe } = require('node:test');
const assert = require('node:assert');
const { montoEnLetras, enteroALetras } = require('../src/utils/numeroALetras');

/**
 * El monto en letras del papel.
 *
 * Es lo que impide que alguien retoque una cifra con un lapicero, así que
 * tiene que decir EXACTAMENTE lo mismo que el número.
 */

describe('las trampas del español', () => {
  const casos = [
    [0, 'cero'], [1, 'uno'], [15, 'quince'], [16, 'dieciséis'],
    [21, 'veintiuno'], [22, 'veintidós'], [30, 'treinta'], [31, 'treinta y uno'],
    [100, 'cien'], [101, 'ciento uno'], [115, 'ciento quince'],
    [500, 'quinientos'], [700, 'setecientos'], [900, 'novecientos'],
    [1000, 'mil'], [1001, 'mil uno'], [1500, 'mil quinientos'],
    [21000, 'veintiún mil'], [31000, 'treinta y un mil'],
    [1000000, 'un millón'], [2000000, 'dos millones'],
    [15899, 'quince mil ochocientos noventa y nueve']
  ];
  for (const [n, esperado] of casos) {
    test(`${n} → ${esperado}`, () => assert.equal(enteroALetras(n), esperado));
  }
});

describe('el monto de la factura', () => {
  test('el caso real del papel de Alegra', () => {
    // "Quince mil ochocientos noventa y nueve colones costarricenses"
    assert.equal(montoEnLetras(15899), 'Quince mil ochocientos noventa y nueve colones costarricenses');
  });

  test('los céntimos solo salen cuando los hay', () => {
    assert.equal(montoEnLetras(616), 'Seiscientos dieciséis colones costarricenses');
    assert.equal(montoEnLetras(84127.90), 'Ochenta y cuatro mil ciento veintisiete colones con 90/100 colones costarricenses'.replace(' colones con', ' con'));
  });

  test('un monto grande no se rompe', () => {
    assert.equal(montoEnLetras(1234567), 'Un millón doscientos treinta y cuatro mil quinientos sesenta y siete colones costarricenses');
  });

  test('cero se escribe', () => {
    assert.match(montoEnLetras(0), /^Cero colones/);
  });
});
