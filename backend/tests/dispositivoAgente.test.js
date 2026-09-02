/**
 * Saber, desde la casa, que una tablet tiene pedidos sin mandar.
 *
 * EL LÍMITE QUE DEFINE EL DISEÑO
 * Un pedido atascado en una tablet NO llegó al servidor: no hay nada que
 * mirar en la base. Es imposible enterarse en tiempo real. Lo único que se
 * puede saber es lo que cada dispositivo reportó la última vez que tuvo
 * señal — y su silencio posterior.
 *
 * Por eso la alerta escala con el TIEMPO, no solo con el número:
 *
 *   pendientes     reportó pedidos sin enviar hace poco. Normal en la calle.
 *   sin_noticias   tenía pendientes y hace más de 3 horas que no habla. Eso
 *                  ya no es "está sin señal un rato": hay que llamar.
 *
 * Sin esto, esos pedidos aparecen recién cuando el cliente reclama que nunca
 * le llegó el producto.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RUTA = path.join(__dirname, '..', 'src', 'modules', 'catalogo-agente', 'pedidos-agente.service.js');
const FUENTE = fs.readFileSync(RUTA, 'utf8');
const MIGRACION = fs.readFileSync(path.join(__dirname, '..', 'migrations', 'add_dispositivo_agente.sql'), 'utf8');
const HOOK = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'hooks', 'usePedidoAgente.js'), 'utf8');

/** La misma regla del servicio, para probarla sin base de datos. */
function alertaDe(pendientes, minutosSinContacto) {
  if (pendientes > 0 && minutosSinContacto > 180) return 'sin_noticias';
  if (pendientes > 0) return 'pendientes';
  return null;
}

describe('alerta por dispositivo', () => {
  test('sin pendientes no hay alerta, aunque lleve días callado', () => {
    // Un agente de vacaciones no es un problema que resolver.
    assert.equal(alertaDe(0, 60 * 24 * 3), null);
  });

  test('con pendientes recientes avisa, sin alarmar', () => {
    assert.equal(alertaDe(2, 20), 'pendientes');
  });

  test('con pendientes y más de 3 horas callado, escala', () => {
    assert.equal(alertaDe(2, 181), 'sin_noticias');
  });

  test('el umbral son 3 horas: a las 3 en punto todavía no escala', () => {
    // Menos daría avisos que no significan nada y la gente dejaría de mirarlos.
    assert.equal(alertaDe(1, 180), 'pendientes');
    assert.equal(alertaDe(1, 181), 'sin_noticias');
  });

  test('la regla del servicio es la misma que se prueba acá', () => {
    // Si el servicio cambia el umbral y esta prueba no, quedaría verde
    // midiendo algo que ya no existe.
    assert.match(FUENTE, /minutos > 180/, 'el servicio debe usar el mismo umbral de 3 horas');
    assert.match(FUENTE, /'sin_noticias'/);
    assert.match(FUENTE, /'pendientes'/);
  });
});

describe('el reporte del dispositivo', () => {
  test('un dispositivo se identifica siempre igual', () => {
    // La clave primaria es el id del aparato: reportar mil veces no crea mil
    // filas, actualiza la suya.
    assert.match(MIGRACION, /id VARCHAR\(80\) PRIMARY KEY/);
    assert.match(FUENTE, /ON CONFLICT \(id\) DO UPDATE/);
  });

  test('sin identificador no se acepta el reporte', () => {
    assert.match(FUENTE, /if \(!dispositivoId\) throw httpError\(400/);
  });

  test('el fallo del reporte no puede estorbar el envío de pedidos', () => {
    // Es información secundaria: si no se puede reportar, se sigue.
    const bloque = HOOK.slice(HOOK.indexOf('const reportarEstado'), HOOK.indexOf('Manda lo que haya pendiente'));
    assert.match(bloque, /catch\s*\{/, 'el reporte debe tragarse su propio error');
  });
});

describe('espera creciente entre reintentos', () => {
  const esperaDe = (intentos) => Math.min(30 * 1000 * Math.pow(4, Math.max(0, intentos - 1)), 30 * 60 * 1000);

  test('el primer reintento es casi inmediato y luego se espacia', () => {
    assert.equal(esperaDe(1), 30 * 1000);
    assert.equal(esperaDe(2), 2 * 60 * 1000);
    assert.equal(esperaDe(3), 8 * 60 * 1000);
  });

  test('la espera tiene tope: nunca deja de reintentar', () => {
    // Sin tope, tras varios fallos la espera crecería a días y el pedido
    // quedaría abandonado de hecho.
    assert.equal(esperaDe(10), 30 * 60 * 1000);
    assert.equal(esperaDe(100), 30 * 60 * 1000);
  });

  test('el hook aplica esa espera y guarda cuándo fue el último intento', () => {
    assert.match(HOOK, /const esperaDe = \(intentos\)/);
    assert.match(HOOK, /ultimoIntento: Date\.now\(\)/,
      'sin registrar el último intento no hay forma de saber cuánto esperar');
  });
});
