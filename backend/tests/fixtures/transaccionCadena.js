/** Servicios/SQL reales, con commits encerrados en el ROLLBACK de cada caso. */
module.exports = function transaccionCadena() {
  const { test, before, after } = require('node:test');
  const assert = require('node:assert/strict');
  const activo = process.env.PROBAR_BASE_LOCAL === '1';
  let c, pool, nivel = 0;
  const query = (sql, params) => sql === 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'
    ? Promise.resolve({ rows: [] }) : c.query(sql, params);
  if (activo) {
    require('../../config/aislado').asegurarBaseLocal();
    assert.ok(process.env.NODE_TEST_CONTEXT);
    assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 1 });
    const ruta = require.resolve('../../config/database');
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: { query, pool: {
      query, connect: async () => {
        const sp = 'validacion_' + ++nivel;
        return { query: (sql, p) => query(sql === 'BEGIN' ? 'SAVEPOINT ' + sp
          : sql === 'COMMIT' ? 'RELEASE SAVEPOINT ' + sp
            : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT ' + sp : sql, p), release() {} };
      }
    } } };
    before(async () => { c = await pool.connect(); await c.query('BEGIN'); });
    after(async () => { if (c) { await c.query('ROLLBACK'); c.release(); } await pool.end(); });
  }
  async function huellas(tablas) {
    const h = {};
    for (const t of tablas) {
      assert.match(t, /^[a-z_]+$/);
      h[t] = (await query(`SELECT md5(COALESCE(string_agg(h,'' ORDER BY h),'')) h FROM (SELECT md5(to_jsonb(t)::text) h FROM ${t} t) x`)).rows[0].h;
    }
    return h;
  }
  const caso = (nombre, fn, opciones) => test(nombre, { skip: !activo }, async () => {
    await query('SAVEPOINT caso_validacion');
    let d;
    try { d = await require('./contextoCadena').crear({ query }, opciones); await fn(d); }
    finally { d?.liberar(); await query('ROLLBACK TO SAVEPOINT caso_validacion'); }
  });
  return { activo, caso, query, huellas };
};
