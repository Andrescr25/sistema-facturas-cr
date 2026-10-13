/** Escritura real del código con punto en una copia local, siempre ROLLBACK. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');

test('crear y editar cliente conserva la actividad con punto en PostgreSQL', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, async () => {
  require('../config/aislado').asegurarBaseLocal();
  assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  const ruta = require.resolve('../config/database');
  require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: baseEnTransaccion(c, 'actividad_zz') };
  const clientes = require('../src/modules/clientes/clientes.service');
  await c.query('BEGIN');
  try {
    const creada = await clientes.crearCliente({ nombre: `ZZ Actividad ${randomUUID().slice(0, 8)}`, actividad_economica: '4752.1' });
    assert.equal(creada.actividad_economica, '4752.1');
    await clientes.editarCliente(creada.id, { actividad_economica: '4711.1' });
    const { rows: [fila] } = await c.query('SELECT actividad_economica FROM cliente WHERE id=$1', [creada.id]);
    assert.equal(fila.actividad_economica, '4711.1');
    await assert.rejects(clientes.editarCliente(creada.id, { actividad_economica: '4711..1' }), e => e.status === 400);
    assert.equal((await clientes.obtenerCliente(creada.id)).actividad_economica, '4711.1');
    await clientes.editarCliente(creada.id, { actividad_economica: '523402' });
    assert.equal((await clientes.obtenerCliente(creada.id)).actividad_economica, '523402');
    await clientes.editarCliente(creada.id, { actividad_economica: null });
    assert.equal((await clientes.obtenerCliente(creada.id)).actividad_economica, null);
  } finally {
    await c.query('ROLLBACK'); c.release(); await pool.end();
  }
});
