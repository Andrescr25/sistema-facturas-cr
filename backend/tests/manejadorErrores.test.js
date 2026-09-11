const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { respuestaDeError } = require('../src/utils/manejadorErrores');

/**
 * El manejador global de errores. Antes todo era 500, incluso un JSON mal
 * formado, que es un error de quien llama.
 */

test('el error real de express.json con un JSON roto es 400 y lo dice', async () => {
  // Se provoca con el mismo parser que usa el servidor, no con un objeto armado a mano.
  const app = express();
  app.use(express.json());
  app.post('/x', (req, res) => res.json({ ok: true }));
  app.use((err, req, res, _next) => { const { status, cuerpo } = respuestaDeError(err); res.status(status).json(cuerpo); });
  const servidor = app.listen(0);
  try {
    const { port } = servidor.address();
    const r = await fetch(`http://127.0.0.1:${port}/x`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"nombre": "X", "cabys": }' });
    const cuerpo = await r.json();
    assert.equal(r.status, 400);
    assert.match(cuerpo.message, /no es un JSON válido/);
  } finally {
    servidor.close();
  }
});

test('un error con código 4xx propio conserva su código', () => {
  const e = Object.assign(new Error('request entity too large'), { status: 413, expose: true });
  assert.equal(respuestaDeError(e).status, 413);
  assert.equal(respuestaDeError(Object.assign(new Error('secreto'), { status: 400, expose: false })).cuerpo.message, 'La petición no es válida.');
});

test('lo demás es 500 y no muestra el detalle fuera de desarrollo', () => {
  const e = new Error('password authentication failed for user postgres');
  assert.equal(respuestaDeError(e).status, 500);
  assert.equal(respuestaDeError(e).cuerpo.message, 'Error interno');
  assert.match(respuestaDeError(e, { desarrollo: true }).cuerpo.message, /password authentication/);
  assert.equal(respuestaDeError(Object.assign(new Error('x'), { status: 503 })).status, 500);
});
