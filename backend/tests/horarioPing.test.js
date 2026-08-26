/**
 * Los días en que se mantiene despierto el Evolution API (WhatsApp).
 *
 * POR QUÉ SE PRUEBA ALGO TAN CHICO
 * Equivocarse en la numeración de los días —que empieza en domingo, no en
 * lunes— es de los errores más fáciles de cometer y de los que más tardan en
 * verse: no rompe nada, solo hace que un martes cualquiera el pedido salga
 * lento y que se gasten horas de la cuota un día que no tocaba. Como el
 * cálculo vive fuera de server.js, se puede fijar cada día del calendario
 * sin levantar el servidor ni tocar el reloj del sistema.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { leerDias, debeMantenerDespierto, nombrarDias, DIAS_POR_DEFECTO } = require('../src/utils/horarioPing');

// Una semana real y verificable: del domingo 23 al sábado 29 de agosto de
// 2026. Se construyen en hora local, que en producción es Costa Rica.
const SEMANA = {
  domingo: new Date(2026, 7, 23),
  lunes: new Date(2026, 7, 24),
  martes: new Date(2026, 7, 25),
  miercoles: new Date(2026, 7, 26),
  jueves: new Date(2026, 7, 27),
  viernes: new Date(2026, 7, 28),
  sabado: new Date(2026, 7, 29)
};

describe('horario del ping a WhatsApp', () => {
  test('las fechas de prueba caen en el día que se cree', () => {
    // Si esto falla, todo lo demás miente.
    const esperado = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
    for (const [nombre, fecha] of Object.entries(SEMANA)) {
      assert.equal(fecha.getDay(), esperado[nombre], `${nombre} no cayó donde se esperaba`);
    }
  });

  test('se mantiene despierto martes, miércoles y jueves', () => {
    for (const dia of ['martes', 'miercoles', 'jueves']) {
      assert.equal(debeMantenerDespierto(SEMANA[dia], DIAS_POR_DEFECTO), true, `${dia} debería mantenerse despierto`);
    }
  });

  test('el resto de la semana se deja dormir', () => {
    for (const dia of ['domingo', 'lunes', 'viernes', 'sabado']) {
      assert.equal(debeMantenerDespierto(SEMANA[dia], DIAS_POR_DEFECTO), false, `${dia} NO debería gastar horas`);
    }
  });

  test('leerDias entiende la configuración', () => {
    assert.deepEqual(leerDias('2,3,4'), [2, 3, 4]);
    assert.deepEqual(leerDias('1, 5'), [1, 5]);
    assert.deepEqual(leerDias('0,6'), [0, 6]);
    assert.deepEqual(leerDias('3,3,3'), [3], 'los repetidos se colapsan');
  });

  test('ante una configuración rota se queda con los días por defecto', () => {
    // Preferible gastar horas de más que dejar el WhatsApp dormido un día de
    // pedidos por una coma mal puesta.
    for (const roto of ['', '   ', undefined, null, 'lunes', '9,42', 'abc,def', '-1']) {
      assert.deepEqual(leerDias(roto), DIAS_POR_DEFECTO, `no cayó al valor por defecto con ${JSON.stringify(roto)}`);
    }
  });

  test('una configuración parcialmente válida conserva lo que sirve', () => {
    assert.deepEqual(leerDias('2,abc,4'), [2, 4]);
  });

  test('el mensaje de arranque nombra los días en castellano', () => {
    assert.equal(nombrarDias([2, 3, 4]), 'martes, miércoles y jueves');
    assert.equal(nombrarDias([1]), 'lunes');
    assert.equal(nombrarDias([4, 2]), 'martes y jueves', 'debe ordenarlos');
  });

  test('con la configuración por defecto son 3 días de 7', () => {
    const despiertos = Object.values(SEMANA).filter(f => debeMantenerDespierto(f, DIAS_POR_DEFECTO));
    assert.equal(despiertos.length, 3, 'más días gastarían la cuota gratuita de Render');
  });
});
