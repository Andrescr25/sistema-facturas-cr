/**
 * Desde la migración independencia/032 el Reporte de Clientes y la cola de
 * Impresión leen la factura PROPIA, cuya fecha es de calendario y viaja como
 * 'YYYY-MM-DD'. `new Date('2026-09-10')` es medianoche UTC, que en Costa Rica
 * todavía es el 9: la primera vuelta en el navegador mostró la 001000014835
 * (emitida el 10) como del 9 de setiembre.
 */
process.env.TZ = 'America/Costa_Rica';

const { test } = require('node:test');
const assert = require('node:assert/strict');

test('Reporte de Clientes: una fecha de calendario se muestra ese día', async () => {
  const { formatDate } = await import('../../frontend/src/utils/reporteClientesUtils.js');
  assert.match(formatDate('2026-09-10'), /\b10\b/);
  assert.doesNotMatch(formatDate('2026-09-10'), /\b9\b/);
});

test('Impresión: la emisión se muestra ese día y sin hora; un instante lleva su hora', async () => {
  const { formatDate } = await import('../../frontend/src/utils/impresionUtils.js');
  const emision = formatDate('2026-09-10');
  assert.match(emision, /\b10\b/);
  assert.doesNotMatch(emision, /\d{1,2}:\d{2}/, 'una fecha de calendario no tiene hora');
  assert.match(formatDate('2026-09-30T21:15:00.000Z'), /\d{1,2}:\d{2}/);
});

// 2026-10-23, el usuario: «correge el modal de cuentas por cobrar en móvil, la
// fecha colapsa y se ve mal». Además del acomodo, las fechas del modal salían
// UN DÍA ANTES: el vencimiento del 4 de noviembre decía «3 nov» y los abonos
// del 10 y 12 de octubre, 9 y 11. Vencimiento (fecha_vencimiento) y abono
// (pago.fecha) son columnas DATE: viajan como 'AAAA-MM-DD' o a medianoche UTC.
test('Cobros y pagos: una fecha de calendario se muestra ese día, venga como venga', async () => {
  const { formatDate } = await import('../../frontend/src/utils/pagosProveedoresUtils.js');
  for (const valor of ['2026-11-04', '2026-11-04T00:00:00.000Z']) {
    assert.match(formatDate(valor), /\b4\b/, valor);
    assert.doesNotMatch(formatDate(valor), /\b3\b/, valor);
  }
  assert.match(formatDate('2026-11-04'), /nov/);
  assert.match(formatDate('2026-11-04'), /2026/);
});

test('un instante con hora se muestra con su día en Costa Rica, no el del texto', async () => {
  const { fechaEnPalabras } = await import('../../frontend/src/utils/fechaCR.js');
  // 02:30 UTC del 5 es las 20:30 del 4 en Costa Rica (UTC−6).
  assert.match(fechaEnPalabras('2026-11-05T02:30:00.000Z'), /^4 de noviembre/);
  assert.match(fechaEnPalabras('2026-11-05T15:30:00.000Z'), /^5 de noviembre/);
  assert.match(fechaEnPalabras(new Date('2026-11-05T02:30:00.000Z')), /^4 de noviembre/);
});

test('sin fecha o con una fecha inválida no se inventa un día', async () => {
  const { fechaEnPalabras } = await import('../../frontend/src/utils/fechaCR.js');
  const { formatDate } = await import('../../frontend/src/utils/pagosProveedoresUtils.js');
  for (const valor of [null, undefined, '', 'no es una fecha']) {
    assert.equal(fechaEnPalabras(valor), '—', String(valor));
    assert.equal(formatDate(valor), '—', String(valor));
  }
});
