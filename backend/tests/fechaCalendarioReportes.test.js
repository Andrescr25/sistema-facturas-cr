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
