const { test } = require('node:test');
const assert = require('node:assert/strict');

test('PDF propio: abre antes de esperar y conserva la ruta de Impresión', async t => {
  const { abrirPdfFacturaPropia } = await import('../../frontend/src/services/facturaPdf.js');
  const orden = [];
  const abierta = { location: null, close() {} };
  const anterior = globalThis.window;
  globalThis.window = { open() { orden.push('abrir'); return abierta; } };
  t.mock.method(URL, 'createObjectURL', b => { assert.equal(b.type, 'application/pdf'); return 'blob:prueba'; });
  t.mock.method(globalThis, 'setTimeout', (_f, ms) => { assert.equal(ms, 60000); });
  try {
    await abrirPdfFacturaPropia({ get: async (ruta, opciones) => {
      orden.push('pedir'); assert.equal(ruta, '/reimpresion/facturas/12/pdf');
      assert.equal(opciones.responseType, 'blob'); return { data: Buffer.from('%PDF-') };
    } }, 12, { ruta: '/reimpresion/facturas/12/pdf' });
    assert.deepEqual(orden, ['abrir', 'pedir']);
    assert.equal(abierta.location, 'blob:prueba');
  } finally { if (anterior === undefined) delete globalThis.window; else globalThis.window = anterior; }
});

test('PDF propio: un fallo cierra la pestaña que ya estaba abierta', async () => {
  const { abrirPdfFacturaPropia } = await import('../../frontend/src/services/facturaPdf.js');
  let cerrada = false;
  await assert.rejects(abrirPdfFacturaPropia({ get: async () => { throw new Error('sin conexión'); } }, 12,
    { ventana: { close() { cerrada = true; } } }), /sin conexión/);
  assert.equal(cerrada, true);
});
