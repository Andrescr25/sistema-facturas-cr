/**
 * Normalización del teléfono antes de mandarlo a WhatsApp.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * Una orden de compra falló contra un proveedor que SÍ tenía WhatsApp. El
 * número guardado era "84084937" con un U+202C pegado al final — una marca
 * invisible de dirección de texto, de las que se arrastran al copiar y pegar
 * desde WhatsApp, un PDF o Excel.
 *
 * La limpieza vieja quitaba espacios, guiones, paréntesis y "+", y agregaba
 * el 506 solo si quedaban EXACTAMENTE 8 caracteres. Con el carácter
 * invisible el largo era 9, así que el número salía SIN código de país. A
 * WhatsApp le llegaba "84084937", que no existe, y el sistema culpaba al
 * proveedor.
 *
 * Lo que se fija acá: lo que no es un dígito no entra, venga de donde venga.
 * Es una lista blanca, no una lista negra — no hay caracteres raros que
 * mantener al día.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { normalizarTelefonoCR } = require('../src/modules/orders-whatsapp/orders-whatsapp.service');

describe('normalizarTelefonoCR', () => {
  test('el caso real: 8 dígitos con U+202C invisible al final', () => {
    // Exactamente lo que llegó desde producción.
    assert.equal(normalizarTelefonoCR('84084937‬'), '50684084937');
  });

  test('todas las marcas invisibles de dirección de texto se descartan', () => {
    // El grupo completo que arrastran los teléfonos al copiar y pegar.
    for (const marca of ['‎', '‏', '‪', '‫', '‬', '‭', '‮', '⁦', '⁧', '⁨', '⁩', '﻿']) {
      assert.equal(
        normalizarTelefonoCR(`${marca}8408 4937${marca}`), '50684084937',
        `no se limpió U+${marca.codePointAt(0).toString(16).toUpperCase()}`
      );
    }
  });

  test('se le pone el 506 a los ocho dígitos', () => {
    assert.equal(normalizarTelefonoCR('84084937'), '50684084937');
  });

  test('los formatos que la gente escribe a mano dan todos lo mismo', () => {
    for (const escrito of ['8408-4937', '8408 4937', '(506) 8408-4937', '+506 8408 4937', '506 8408 4937', '00506 84084937']) {
      assert.equal(normalizarTelefonoCR(escrito), '50684084937', `falló con "${escrito}"`);
    }
  });

  test('un número que ya trae 506 no lo repite', () => {
    assert.equal(normalizarTelefonoCR('50684084937'), '50684084937');
    assert.doesNotMatch(normalizarTelefonoCR('50684084937'), /^506506/);
  });

  test('un proveedor de otro país conserva su código', () => {
    // Nicaragua: 505 + 8 dígitos. No se le puede encajar el 506.
    assert.equal(normalizarTelefonoCR('+505 8888 7777'), '50588887777');
  });

  test('lo que no puede ser un teléfono se rechaza al escribirlo', () => {
    // Antes esto se mandaba igual y WhatsApp devolvía un 400 que parecía
    // culpa del proveedor.
    for (const malo of ['123', '', '   ', 'abc', null, undefined, '1']) {
      assert.throws(() => normalizarTelefonoCR(malo), /no es un número válido/, `debió rechazar ${JSON.stringify(malo)}`);
    }
  });

  test('el rechazo dice cuántos dígitos encontró y cuántos hacen falta', () => {
    try {
      normalizarTelefonoCR('123');
      assert.fail('debió lanzar');
    } catch (e) {
      assert.match(e.message, /3 dígito/);
      assert.match(e.message, /8/);
      assert.match(e.message, /proveedor/i, 'debe decir dónde corregirlo');
    }
  });

  test('el resultado es SIEMPRE solo dígitos', () => {
    for (const entrada of ['84084937‬', '+506 8408-4937', '(506) 8408 4937', '00506 84084937']) {
      assert.match(normalizarTelefonoCR(entrada), /^[0-9]+$/, `quedó basura en "${entrada}"`);
    }
  });
});
