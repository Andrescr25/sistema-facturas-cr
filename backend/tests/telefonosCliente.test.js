/**
 * Test de telefonosCliente.js.
 *
 * POR QUÉ ESTE ARCHIVO ES DE LOS QUE IMPORTAN
 * El enlace de invitación deja crear la cuenta del cliente y ver sus
 * facturas. Mandárselo al número equivocado no es un mensaje perdido: es
 * entregarle esa cuenta a un desconocido, y no hay forma de deshacerlo.
 *
 * Los casos de abajo NO son inventados. Salieron de mirar 120 fichas de la
 * cuenta real, donde 19 tenían el teléfono escrito de alguna forma que no es
 * un teléfono. El caso que más asusta es "60301550 63409692": dos números en
 * el mismo campo que, quitándole lo que no sea dígito —que es lo que hace el
 * normalizador de las órdenes de compra— se convierten en un número de 16
 * dígitos.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { telefonosDe, validarTelefonoEscrito } = require('../src/modules/portal-clientes/telefonosCliente');

/** Los números que se le ofrecerían a quien manda, en orden. */
const ofrecidos = (contacto) => telefonosDe(contacto).candidatos.map(c => c.nacional);

describe('leer el teléfono de una ficha de Alegra', () => {
  test('ignora el nombre de quien contesta', () => {
    // "88272453 GABRIEL" es literal de la ficha del cliente 141.
    assert.deepEqual(ofrecidos({ phonePrimary: '88272453 GABRIEL' }), ['88272453']);
  });

  test('quita el código de país, junto o separado', () => {
    assert.deepEqual(ofrecidos({ phonePrimary: '+506 89703626' }), ['89703626']);
    assert.deepEqual(ofrecidos({ phonePrimary: '50689703626' }), ['89703626']);
    assert.deepEqual(ofrecidos({ phonePrimary: '00506 89703626' }), ['89703626']);
  });

  test('un número partido por un espacio o un guión sigue siendo uno', () => {
    assert.deepEqual(ofrecidos({ phonePrimary: '8827 2453' }), ['88272453']);
    assert.deepEqual(ofrecidos({ phonePrimary: '8827-2453' }), ['88272453']);
    assert.deepEqual(ofrecidos({ phonePrimary: '+506 2453 1122' }), ['24531122']);
  });

  test('DOS números en el mismo campo se ofrecen como dos, no se pegan', () => {
    // Este es el caso peligroso. Pegarlos da 6030155063409692, que no es de
    // nadie; y elegir uno por nuestra cuenta sería adivinar a quién le llega
    // el enlace.
    const r = ofrecidos({ phonePrimary: '60301550 63409692' });
    assert.equal(r.length, 2);
    assert.ok(r.includes('60301550') && r.includes('63409692'));
    assert.ok(!r.some(n => n.length !== 8), 'ninguno puede tener más de 8 dígitos');
  });

  test('un número al que le falta o le sobra una cifra NO se ofrece', () => {
    // "+506 8770053" y "+506 636144030" están tal cual en la cuenta. Con 7 o
    // con 9 dígitos no son del cliente: son de otra persona, o de nadie.
    for (const malo of ['+506 8770053', '+506 636144030', '8827245']) {
      const r = telefonosDe({ phonePrimary: malo });
      assert.deepEqual(r.candidatos, [], `no debió ofrecer nada para "${malo}"`);
      assert.deepEqual(r.sinReconocer, [malo], 'pero sí debe decir qué había escrito');
    }
  });

  test('un campo sin ningún número se reporta para poder explicarlo', () => {
    const r = telefonosDe({ phonePrimary: 'ENRIQUE' });
    assert.deepEqual(r.candidatos, []);
    assert.deepEqual(r.sinReconocer, ['ENRIQUE']);
  });

  test('una ficha sin teléfono no inventa nada ni se queja', () => {
    for (const c of [{}, { phonePrimary: null }, { phonePrimary: '', mobile: '  ' }]) {
      assert.deepEqual(telefonosDe(c), { candidatos: [], sinReconocer: [] });
    }
  });

  test('el mismo número en dos campos se ofrece una sola vez', () => {
    assert.deepEqual(
      ofrecidos({ phonePrimary: '+506 89703626', mobile: '89703626' }),
      ['89703626']
    );
  });

  test('el celular se ofrece antes que el fijo', () => {
    // Un fijo casi nunca tiene WhatsApp; que quede de primero haría que el
    // clic rápido mande el mensaje a donde no llega.
    const r = telefonosDe({ phonePrimary: '2453 1122', phoneSecondary: '8827 2453' });
    assert.equal(r.candidatos[0].nacional, '88272453');
    assert.equal(r.candidatos[0].esMovil, true);
    assert.equal(r.candidatos[1].esMovil, false);
  });

  test('se dice de qué campo salió cada número', () => {
    // Para que la pantalla pueda mostrar "celular" o "teléfono" y quien
    // manda reconozca cuál es.
    const r = telefonosDe({ mobile: '8827 2453', phonePrimary: '2453 1122' });
    assert.equal(r.candidatos.find(c => c.nacional === '88272453').origen, 'mobile');
    assert.equal(r.candidatos.find(c => c.nacional === '24531122').origen, 'phonePrimary');
  });

  test('el número se entrega listo para WhatsApp y legible para la pantalla', () => {
    const [c] = telefonosDe({ mobile: '88272453' }).candidatos;
    assert.equal(c.numero, '50688272453');
    assert.equal(c.formateado, '8827 2453');
  });
});

describe('teléfono escrito a mano', () => {
  test('acepta las formas en que la gente lo escribe', () => {
    for (const t of ['88272453', '8827 2453', '8827-2453', '+506 8827 2453', '(506) 8827-2453']) {
      const r = validarTelefonoEscrito(t);
      assert.equal(r.valido, true, `debió aceptar "${t}"`);
      assert.equal(r.numero, '50688272453');
    }
  });

  test('rechaza lo que no puede ser un teléfono, y dice por qué', () => {
    const corto = validarTelefonoEscrito('882724');
    assert.equal(corto.valido, false);
    assert.match(corto.motivo, /6 dígito/);

    assert.equal(validarTelefonoEscrito('').valido, false);
    assert.equal(validarTelefonoEscrito('ENRIQUE').valido, false);
  });

  test('rechaza dos números en la misma casilla', () => {
    // Si se aceptara, habría que elegir uno — y elegir es adivinar a quién
    // le llega el enlace.
    const r = validarTelefonoEscrito('8827 2453 y 6030 1550');
    assert.equal(r.valido, false);
    assert.match(r.motivo, /un solo número/);
  });
});
