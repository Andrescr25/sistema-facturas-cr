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

const crypto = require('crypto');
const { tokenDe, leerToken, enlaceDe } = require('../src/modules/cotizaciones/enlacePublico');

/** El id propio dentro del token, o null. */
const idDesdeToken = (t) => {
  const llave = leerToken(t);
  return llave && !llave.legado ? llave.id : null;
};

/** Un token como los que salieron por WhatsApp antes de la migración 029. */
const tokenDeAlegra = (id) => `${id}-${crypto.createHmac('sha256', process.env.JWT_SECRET)
  .update(`cotizacion:${id}`).digest('base64url').slice(0, 22)}`;

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

  test('con el portal separado, el enlace va al sitio de los clientes y no al interno', () => {
    const previos = { PORTAL_URL: process.env.PORTAL_URL, APP_URL: process.env.APP_URL };
    try {
      process.env.APP_URL = 'https://interno.ejemplo';
      process.env.PORTAL_URL = 'https://clientes.ejemplo/';
      assert.ok(enlaceDe('8').startsWith('https://clientes.ejemplo/cotizacion/8-'));
      delete process.env.PORTAL_URL;
      assert.ok(enlaceDe('8').startsWith('https://interno.ejemplo/cotizacion/8-'), 'sin portal configurado, el de siempre');
    } finally {
      for (const [k, v] of Object.entries(previos)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });

  test('un enlace viejo de Alegra NO abre la cotización propia con el mismo número', () => {
    // El 11 de Alegra es de un cliente; el 11 propio, de otro. Si se firmaran
    // igual, el enlace viejo mostraría nombre y precios ajenos.
    assert.deepEqual(leerToken(tokenDeAlegra('11')), { id: '11', legado: true });
    assert.deepEqual(leerToken(tokenDe('11')), { id: '11', legado: false });
    assert.notEqual(tokenDeAlegra('11'), tokenDe('11'));
  });

  test('el mismo id da siempre el mismo enlace', () => {
    // Por eso no hace falta guardar nada: reenviar una cotización manda el
    // mismo enlace que la primera vez.
    assert.equal(tokenDe('8'), tokenDe('8'));
  });
});
