/**
 * Los mensajes de error del envío por WhatsApp.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * Enviar una orden de compra fallaba con "Error interno del servidor" en la
 * pantalla y "Request failed with status code 400" en la consola. Ninguno de
 * los dos dice nada: el 400 lo devuelve Evolution API sin explicación cuando
 * el número no tiene WhatsApp, pero se ve igual que si estuviera mal la
 * clave, mal el nombre de la instancia o apagado el servidor — y cada una de
 * esas se arregla en un lugar distinto. Averiguar cuál era costó una sesión
 * entera de ida y vuelta contra producción.
 *
 * Cada caso de acá corresponde a una causa real distinta, y lo que se afirma
 * es que el mensaje NOMBRE la causa y diga dónde tocar. Son puros: no hay red
 * ni se genera ningún PDF.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { explicarFalloWhatsApp } = require('../src/modules/orders-whatsapp/orders-whatsapp.service');

const CONTEXTO = {
  telefono: '50624371234',
  waUrl: 'https://evolution.ejemplo.com',
  waInstance: 'facturas_instance'
};

/** Un error de axios con respuesta del servidor. */
const conRespuesta = (status, data) => ({ response: { status, data }, message: `Request failed with status code ${status}` });

/** Un error de axios que nunca llegó a hablar con el servidor. */
const sinRespuesta = (code) => ({ code, message: code });

describe('explicarFalloWhatsApp — cada causa dice qué revisar', () => {
  test('400: nombra el número y la causa probable, no el código HTTP', () => {
    const m = explicarFalloWhatsApp(conRespuesta(400, { message: 'Bad Request' }), CONTEXTO);
    assert.match(m, /50624371234/, 'debe decir cuál número falló');
    assert.match(m, /WhatsApp/i);
    assert.doesNotMatch(m, /status code/i, 'no debe repetir el error crudo de axios');
  });

  test('401 y 403: mandan a revisar la clave', () => {
    for (const status of [401, 403]) {
      const m = explicarFalloWhatsApp(conRespuesta(status, {}), CONTEXTO);
      assert.match(m, /WHATSAPP_API_KEY/, `el ${status} debe nombrar la variable a revisar`);
    }
  });

  test('404: nombra la instancia buscada y la variable que la define', () => {
    const m = explicarFalloWhatsApp(conRespuesta(404, {}), CONTEXTO);
    assert.match(m, /facturas_instance/);
    assert.match(m, /WHATSAPP_INSTANCE_NAME/);
  });

  test('servidor inalcanzable: nombra la URL y la variable', () => {
    for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']) {
      const m = explicarFalloWhatsApp(sinRespuesta(code), CONTEXTO);
      assert.match(m, /evolution\.ejemplo\.com/, `${code} debe decir a dónde intentó conectarse`);
      assert.match(m, /WHATSAPP_API_URL/);
    }
  });

  test('tiempo agotado: se distingue de "no existe" y sugiere reintentar', () => {
    const m = explicarFalloWhatsApp(sinRespuesta('ETIMEDOUT'), CONTEXTO);
    assert.match(m, /no respondió a tiempo/i);
    assert.match(m, /de nuevo/i);
  });

  test('WhatsApp desvinculado: manda a escanear el QR, no a revisar variables', () => {
    const m = explicarFalloWhatsApp(conRespuesta(400, { message: 'Connection Closed' }), CONTEXTO);
    assert.match(m, /QR/);
    assert.doesNotMatch(m, /no tenga WhatsApp/, 'no debe confundirse con el caso del número inválido');
  });

  test('un error desconocido conserva lo que dijo Evolution', () => {
    const m = explicarFalloWhatsApp(conRespuesta(500, { message: 'algo raro adentro' }), CONTEXTO);
    assert.match(m, /algo raro adentro/, 'no se debe tragar el detalle del servidor');
    assert.match(m, /500/);
  });

  test('ningún mensaje deja al usuario sin saber qué hacer', () => {
    const casos = [
      conRespuesta(400, {}), conRespuesta(401, {}), conRespuesta(404, {}),
      conRespuesta(503, {}), sinRespuesta('ECONNREFUSED'), sinRespuesta('ETIMEDOUT')
    ];
    for (const c of casos) {
      const m = explicarFalloWhatsApp(c, CONTEXTO);
      assert.ok(m.length > 40, `mensaje demasiado escueto: "${m}"`);
      assert.doesNotMatch(m, /^Request failed/, 'no puede ser el error crudo de axios');
      assert.doesNotMatch(m, /undefined|\[object Object\]/, `mensaje mal armado: "${m}"`);
    }
  });
});
