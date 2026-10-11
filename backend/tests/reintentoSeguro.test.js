/** El lector CLI no puede escribir ni filtrar errores Axios, aun con salidas abiertas. */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { crearLector } = require('../scripts/independencia/lib/lectura-alegra');
function falla(caso) {
  const estado = { llamadas: 0, esperas: [] };
  const lector = crearLector({ transporte: { async get() {
    estado.llamadas++; const e = new Error('ZZ-SECRETO-url-firmada');
    e.code = caso.code; e.config = { auth: { password: 'ZZ-SECRETO' } };
    if (caso.status) e.response = { status: caso.status, data: caso.data || {}, headers: caso.headers || {} };
    throw e;
  } }, esperar: async ms => estado.esperas.push(ms) });
  return { lector, estado };
}
describe('lectura histórica con reintentos acotados', () => {
  for (const caso of [{ code: 'ETIMEDOUT' }, { code: 'ECONNRESET' }, { code: 'ECONNABORTED' },
    { status: 502 }, { status: 503 }, { status: 504 }, { status: 429 }, { status: 400, data: { code: 429 } }]) {
    test(`máximo tres intentos ante ${caso.code || caso.status}/${caso.data?.code || ''}`, async () => {
      const { lector, estado } = falla(caso); const r = await lector.get('/invoices');
      assert.equal(r.success, false); assert.equal(estado.llamadas, 3);
      assert.deepEqual(estado.esperas, [1000, 2000]); assert.ok(!JSON.stringify(r).includes('ZZ-SECRETO'));
    });
  }
  for (const status of [400, 401, 403, 404, 500]) {
    test(`HTTP ${status} aborta sin fingir página vacía`, async () => {
      const { lector, estado } = falla({ status, data: { message: 'ZZ-SECRETO' } }); const r = await lector.get('/items');
      assert.equal(r.success, false); assert.equal(r.status, status); assert.equal(estado.llamadas, 1); assert.deepEqual(r.data, {});
    });
  }
  test('respeta segundos restantes de límite, con tope de un minuto', async () => {
    for (const [reset, esperado] of [[54, 55000], [600, 60000], [-1, 1000], ['no-numero', 1000]]) {
      const { lector, estado } = falla({ status: 400, data: { code: 429, headers: { 'x-rate-limit-reset': reset } } });
      await lector.get('/contacts'); assert.equal(estado.esperas[0], esperado);
    }
  });
  test('si el segundo intento responde, conserva datos y deja de llamar', async () => {
    let llamadas = 0;
    const lector = crearLector({ transporte: { get: async () => {
      if (++llamadas === 1) { const e = new Error('x'); e.code = 'ETIMEDOUT'; throw e; } return { data: [{ id: 42 }] };
    } }, esperar: async () => {} });
    assert.deepEqual(await lector.request('GET', '/invoices'), [{ id: 42 }]); assert.equal(llamadas, 2);
  });
});
describe('migración sin capacidad de escritura', () => {
  test('rechaza todo método ajeno a GET antes del transporte incluso con llave abierta', async () => {
    let llamadas = 0; const lector = crearLector({ transporte: { get: async () => { llamadas++; return { data: [] }; } } });
    const anterior = process.env.PERMITIR_SALIDAS; process.env.PERMITIR_SALIDAS = 'true';
    try {
      for (const metodo of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', undefined]) {
        await assert.rejects(lector.request(metodo, '/invoices'), e => e.status === 423 && e.code === 'SALIDA_BLOQUEADA');
      }
      assert.equal(llamadas, 0); assert.deepEqual(Object.keys(lector.api), ['get']);
      assert.equal(lector.post, undefined); assert.equal(lector.api.request, undefined);
      assert.ok(Object.isFrozen(lector)); assert.ok(Object.isFrozen(lector.api));
    } finally { if (anterior === undefined) delete process.env.PERMITIR_SALIDAS; else process.env.PERMITIR_SALIDAS = anterior; }
  });
  test('URL absoluta y segmentos escapados se rechazan antes de salir', async () => {
    let llamadas = 0; const lector = crearLector({ transporte: { get: async () => { llamadas++; return { data: [] }; } } });
    for (const ruta of ['https://otra.example/items', '//otra.example/items', '/items/../contacts', '/items/%2e%2e', '/items?url=otro', '/items#x', '/items\\otra', 'items']) {
      const r = await lector.get(ruta); assert.equal(r.success, false); assert.equal(r.error, 'RUTA_LECTURA_INVALIDA');
    } assert.equal(llamadas, 0);
  });
  test('api.get no permite reemplazar host, autenticación o método', async () => {
    const llamadas = []; const lector = crearLector({ transporte: { get: async (...args) => { llamadas.push(args); return { data: [1], config: { auth: 'ZZ-SECRETO' } }; } } });
    assert.deepEqual(await lector.api.get('/items/categories', { params: { start: 0 }, baseURL: 'https://otra.example', method: 'post', auth: 'otra', maxRedirects: 5 }), { data: [1] });
    assert.deepEqual(llamadas, [['/items/categories', { params: { start: 0 } }]]);
  });
  test('error lanzado no conserva causa, cuerpo, credenciales ni objeto Axios', async () => {
    const { lector } = falla({ status: 403, data: { secret: 'ZZ-SECRETO' } });
    await assert.rejects(lector.request('GET', '/items'), e => {
      assert.equal(e.status, 403); assert.equal(e.cause, undefined); assert.equal(e.response, undefined); assert.equal(e.config, undefined);
      assert.ok(!`${e.stack}${JSON.stringify(e)}`.includes('ZZ-SECRETO')); return true;
    });
  });
});
