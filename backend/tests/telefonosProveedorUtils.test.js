const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { validarTelefonoProveedor, validarWhatsappsProveedor } = require('../src/utils/telefonosProveedor');

describe('destinos de WhatsApp del proveedor', () => {
  test('un destino escrito conserva el número nacional, con o sin país', () => {
    for (const escrito of ['88888888', '8888 8888', '+506 8888-8888', '50688888888', '(506) 8888 8888', '+5068888 8888']) {
      assert.equal(validarTelefonoProveedor(escrito), '8888 8888');
    }
  });

  test('no extrae un destino de anotaciones, varios números o cifras incompletas', () => {
    for (const escrito of ['88888888 JUAN', 'el número 88888888', '88888888 / 87777777',
      '88888888\n87777777', '8888888887777777', '8888888', '+506 8888888', '++88888888']) {
      assert.throws(() => validarTelefonoProveedor(escrito), e => e.status === 400);
    }
  });

  test('la lista normaliza cada línea y rechaza repeticiones entre formatos', () => {
    assert.equal(validarWhatsappsProveedor('+506 88888888\r\n8777-7777'), '8888 8888\n8777 7777');
    assert.throws(() => validarWhatsappsProveedor('88888888\n+50688888888'), e => e.status === 400 && /repetido/.test(e.message));
    assert.throws(() => validarWhatsappsProveedor('88888888\n\n87777777'), e => e.status === 400 && /vacía/.test(e.message));
  });

  test('permite vaciar la ficha y limita los contactos sin cortar datos', () => {
    for (const valor of [null, '', '   ', '\n']) assert.equal(validarWhatsappsProveedor(valor), null);
    const once = Array.from({ length: 11 }, (_, i) => String(88888800 + i)).join('\n');
    assert.throws(() => validarWhatsappsProveedor(once), e => e.status === 400 && /10 números/.test(e.message));
  });
});
