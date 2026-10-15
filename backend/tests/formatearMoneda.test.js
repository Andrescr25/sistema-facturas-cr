const { test } = require('node:test');
const assert = require('node:assert/strict');

test('costos muestran moneda, decimales y ausencia de importe sin confundir cero', async () => {
  const { formatearMoneda } = await import('../../frontend/src/utils/moneda.js');
  assert.match(formatearMoneda(16.2, 'CRC'), /CRC.*16,20/);
  assert.match(formatearMoneda(10.35, 'usd'), /USD.*10,35/);
  assert.match(formatearMoneda(0, 'CRC'), /CRC.*0,00/);
  assert.equal(formatearMoneda(null), '—');
  assert.equal(formatearMoneda(undefined), '—');
  assert.equal(formatearMoneda(NaN), '—');
  assert.equal(formatearMoneda(Infinity), '—');
  assert.equal(formatearMoneda(1, 'moneda inválida'), 'MONEDA INVÁLIDA 1,00');
});
