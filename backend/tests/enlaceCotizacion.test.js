/**
 * El enlace público de una cotización.
 *
 * QUÉ PROTEGE
 * La URL que se le manda al cliente por WhatsApp abre la cotización sin
 * pedirle cuenta. Si el enlace fuera /cotizacion/8, cualquiera podría
 * recorrer /cotizacion/1, /2, /3… y ver las cotizaciones de TODOS los
 * clientes, con sus nombres y sus precios. La firma es lo único que lo
 * impide, así que este archivo existe para que nadie la debilite sin darse
 * cuenta.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const SECRETO_PREVIO = process.env.JWT_SECRET;
before(() => { process.env.JWT_SECRET = 'secreto-de-prueba-para-los-enlaces'; });
after(() => {
  if (SECRETO_PREVIO === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = SECRETO_PREVIO;
});

const { tokenDe, idDesdeToken, enlaceDe } = require('../src/modules/cotizaciones/enlacePublico');

describe('el token de una cotización', () => {
  test('se puede leer de vuelta', () => {
    assert.equal(idDesdeToken(tokenDe('8')), '8');
    assert.equal(idDesdeToken(tokenDe('123')), '123');
  });

  test('NO es solo el número: lleva una firma', () => {
    // Con /cotizacion/8 se podrían recorrer todas las del negocio.
    const t = tokenDe('8');
    assert.notEqual(t, '8');
    assert.ok(t.length > 20, 'la firma tiene que ser larga para no adivinarse');
    assert.equal(idDesdeToken('8'), null, 'el número pelado no debe servir');
  });

  test('una firma inventada no abre nada', () => {
    for (const falso of ['8-AAAAAAAAAAAAAAAAAAAAAA', '8-x', '8-', '8']) {
      assert.equal(idDesdeToken(falso), null, `abrió con "${falso}"`);
    }
  });

  test('la firma de una cotización no sirve para otra', () => {
    // El caso que importa: quien recibe SU enlace no puede ver el del vecino
    // cambiando el número.
    const firmaDeLa8 = tokenDe('8').split('-')[1];
    assert.equal(idDesdeToken(`9-${firmaDeLa8}`), null);
    assert.equal(idDesdeToken(`1-${firmaDeLa8}`), null);
  });

  test('basura y valores raros devuelven null, no revientan', () => {
    for (const basura of ['', null, undefined, 'cualquier-cosa', '-', 'abc-def', {}, 8]) {
      assert.equal(idDesdeToken(basura), null, `falló con ${JSON.stringify(basura)}`);
    }
  });

  test('con otro secreto, el token deja de servir', () => {
    // Si el secreto rota, los enlaces viejos mueren. Es el comportamiento
    // esperado y conviene que esté escrito.
    const t = tokenDe('8');
    process.env.JWT_SECRET = 'otro-secreto-distinto';
    assert.equal(idDesdeToken(t), null);
    process.env.JWT_SECRET = 'secreto-de-prueba-para-los-enlaces';
    assert.equal(idDesdeToken(t), '8');
  });

  test('el enlace apunta a la página pública', () => {
    const url = enlaceDe('8');
    assert.match(url, /\/cotizacion\/8-/);
    assert.ok(url.startsWith('http'), 'tiene que ser una dirección completa para mandarla por WhatsApp');
  });

  test('el mismo id da siempre el mismo enlace', () => {
    // Por eso no hace falta guardar nada: reenviar una cotización manda el
    // mismo enlace que la primera vez.
    assert.equal(tokenDe('8'), tokenDe('8'));
  });
});
