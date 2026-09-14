const { test, describe } = require('node:test');
const assert = require('node:assert');

/**
 * Por qué falló una llamada a Alegra.
 *
 * ESTO NACE DE UN CASO REAL (14 de setiembre de 2026). Dos facturas quedaron
 * trabadas en la cola de "sin conexión" con el internet funcionando. El cajero
 * veía "Request failed with status code 400" y reintentaba; una llegó a quince
 * intentos. Alegra había explicado el motivo desde el primer intento:
 *
 *   "Configuraste el item PICHEL PLASTICO STAMPO 4 LITROS C/TAPA REF.PI0005
 *    para no poder facturar si no tiene stock."
 *
 * Ese texto viajaba como cuarto argumento de `ResponseHelper.error`, que solo
 * lo incluye cuando NODE_ENV es 'development'. En producción se descartaba.
 */

const { explicarFalloAlegra } = require('../src/integrations/alegra/explicarFallo');

const rechazo = (mensaje, status = 400) => ({
  message: `Request failed with status code ${status}`,
  response: { status, data: { message: mensaje } }
});

describe('lo que Alegra contestó llega a la pantalla', () => {
  test('el motivo del rechazo reemplaza al mensaje de axios', () => {
    const r = explicarFalloAlegra(rechazo('Configuraste el item X para no poder facturar si no tiene stock.'));

    assert.match(r.mensaje, /Configuraste el item X/);
    assert.doesNotMatch(r.mensaje, /Request failed/, 'ese texto no le dice nada a quien está cobrando');
  });

  test('al caso del stock se le agrega qué hacer', () => {
    // Saber el motivo no alcanza si uno está en la caja con el cliente
    // enfrente: hay que decir cuál es la salida.
    const r = explicarFalloAlegra(rechazo('Configuraste el item PICHEL para no poder facturar si no tiene stock.'));
    assert.match(r.mensaje, /existencias|quitarlo de la factura/);
  });

  test('un rechazo sin explicación al menos dice que fue un rechazo', () => {
    const r = explicarFalloAlegra({ response: { status: 400, data: {} } });

    assert.match(r.mensaje, /rechazó/);
    assert.strictEqual(r.esRechazo, true);
  });
});

describe('rechazo contra no haber llegado', () => {
  test('un 400 es rechazo: reenviarlo igual vuelve a fallar', () => {
    // De esto depende que NO se guarde en la cola de sin conexión.
    const r = explicarFalloAlegra(rechazo('cualquier cosa'));

    assert.strictEqual(r.esRechazo, true);
    assert.strictEqual(r.status, 400);
  });

  test('sin respuesta NO es rechazo, y avisa que pudo haberse creado', () => {
    const e = new Error('timeout of 30000ms exceeded');
    e.code = 'ECONNABORTED';
    const r = explicarFalloAlegra(e);

    assert.strictEqual(r.esRechazo, false);
    assert.match(r.mensaje, /puede haber quedado creada/, 'reenviar a ciegas duplicaría un documento fiscal');
  });

  test('Alegra caída no es rechazo: la misma factura pasa después', () => {
    const r = explicarFalloAlegra(rechazo('Internal error', 500));

    assert.strictEqual(r.esRechazo, false);
    assert.strictEqual(r.status, 503);
  });

  test('el límite de peticiones tampoco es rechazo', () => {
    const r = explicarFalloAlegra(rechazo('Too many requests', 429));
    assert.strictEqual(r.esRechazo, false);
  });
});

describe('los errores propios no se tocan', () => {
  test('un conflicto de idempotencia conserva su código y su mensaje', () => {
    // Ya vienen escritos para una persona y con el código justo; pisarlos
    // convertiría "esta factura ya existe" en "Alegra rechazó".
    const e = new Error('Esa factura ya se está creando en este momento.');
    e.status = 409;
    const r = explicarFalloAlegra(e);

    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.mensaje, 'Esa factura ya se está creando en este momento.');
  });
});
