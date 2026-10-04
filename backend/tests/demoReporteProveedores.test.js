const { test } = require('node:test');
const assert = require('node:assert/strict');
const { crear, retirar } = require('../scripts/independencia/demo-reporte-proveedores');

test('PostgreSQL: retirar la demo también retira su impresión y conserva las demás filas',
  { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, async () => {
    require('../config/aislado').asegurarBaseLocal();
    const { Client } = require('pg');
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
      await db.query('BEGIN');
      const antes = (await db.query('SELECT * FROM facturas_reimpresion ORDER BY id')).rows;
      const m = await crear(db, '2026-10-04');
      await db.query(`INSERT INTO facturas_reimpresion (factura_propia_id, ajustes_realizados, estado, categoria, total_ajustes)
        VALUES ($1, '[]'::jsonb, 'pendiente', 'sin_pendientes', 0)`, [m.facturas[0].id]);
      await retirar(db, m);
      assert.deepEqual((await db.query('SELECT * FROM facturas_reimpresion ORDER BY id')).rows, antes);
      for (const [tabla, ids] of [['factura', m.facturas.map(f => f.id)], ['producto', m.productos.map(p => p.id)], ['proveedor', m.proveedores.map(p => p.id)]]) {
        assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE id=ANY($1::int[])`, [ids])).rows[0].n, 0);
      }
    } finally {
      await db.query('ROLLBACK');
      await db.end();
    }
  });
