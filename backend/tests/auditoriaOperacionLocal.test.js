const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ident, capturarEstado, leerEstado, compararHistoria, verificarCero } = require('../scripts/independencia/lib/auditoria-operacion');

const valido = () => ({
  version: 1, tablas: { factura: { filas: 1, huella: 'a' }, movimiento_inventario: { filas: 0 } },
  stock: { productos: 1, conExistencias: 0, contados: 0, valorados: 0 },
  bodega: { inicializada: false, revision: '0' },
  antiguos: { inventario_auditorias: { activos: 0, historicos: 2 } },
  documentos: { factura: { clasificados: 0 } }
});
const nativa = { skip: process.env.PROBAR_BASE_LOCAL !== '1' };
function exigirClon() {
  require('../config/aislado').asegurarBaseLocal();
  // La guarda habitual protege el host; esta exige además un nombre de ensayo.
  assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_/);
}

test('huellas detectan pérdida, cambio o tabla ausente sin confundir columnas nuevas', () => {
  const a = valido();
  assert.deepEqual(compararHistoria(a, { ...a, tablas: { ...a.tablas, nueva: { filas: 0 } } }), []);
  for (const cambio of [{ filas: 0, huella: 'a' }, { filas: 1, huella: 'b' }, undefined]) {
    assert.deepEqual(compararHistoria(a, { ...a, tablas: { ...a.tablas, factura: cambio } }), ['factura']);
  }
  assert.throws(() => compararHistoria({}, a));
});

test('cero provisional rechaza stock/conteo/valoración, apertura y operaciones inventadas', () => {
  assert.deepEqual(verificarCero(valido()), []);
  for (const campo of ['conExistencias', 'contados', 'valorados']) {
    const e = valido(); e.stock[campo] = 1;
    assert.ok(verificarCero(e).length);
  }
  for (const bodega of [{ inicializada: true, revision: '0' }, { inicializada: false, revision: '1' }, null]) {
    assert.ok(verificarCero({ ...valido(), bodega }).length);
  }
  for (const tabla of ['movimiento_inventario', 'orden_compra_ciclo', 'orden_compra_ciclo_envio',
    'orden_compra_ciclo_recepcion', 'orden_compra_ciclo_cierre', 'entrega_evento']) {
    const e = valido(); e.tablas[tabla] = { filas: 1 };
    assert.ok(verificarCero(e).includes(tabla));
  }
});

test('histórico no acredita trabajo activo ni permite adivinar un ciclo', () => {
  const e = valido(); e.antiguos.inventario_auditorias.activos = 1;
  assert.ok(verificarCero(e).length);
  assert.ok(verificarCero({ ...valido(), documentos: { factura: { clasificados: 1 } } }).length);
  assert.equal(ident('a";DELETE'), '"a"";DELETE"');
});

test('captura usa instantánea READ ONLY y libera/rollback ante error', async () => {
  const llamadas = [];
  const db = {
    query: async sql => {
      llamadas.push(sql);
      if (sql.trimStart().startsWith('SELECT table_name')) throw Error('ZZ fallo consulta');
      return { rows: [] };
    },
    release: () => llamadas.push('release')
  };
  await assert.rejects(() => capturarEstado({ connect: async () => db }));
  assert.deepEqual(llamadas.filter(s => !s.trimStart().startsWith('SELECT')),
    ['BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY', 'ROLLBACK', 'release']);
});

test('PostgreSQL: auditar toda la base no cambia datos ni series', nativa, async () => {
  exigirClon();
  const db = require('../config/database');
  try {
    const a = await capturarEstado(db.pool), b = await capturarEstado(db.pool, a);
    assert.deepEqual(compararHistoria(a, b), []);
    assert.deepEqual(a.tablas, b.tablas);
    assert.deepEqual(a.secuencias, b.secuencias);
    assert.deepEqual(verificarCero(a), []);
    assert.ok(Object.keys(a.tablas).length > 50);
  } finally {
    await db.pool.end();
  }
});

test('PostgreSQL: auditoría reactivada y movimiento falso fallan la apertura, con ROLLBACK', nativa, async () => {
  exigirClon();
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }), db = await pool.connect();
  try {
    await db.query('BEGIN');
    const antes = await leerEstado(db);
    await db.query(`UPDATE inventario_auditorias SET historica = FALSE
      WHERE id = (SELECT id FROM inventario_auditorias WHERE historica LIMIT 1)`);
    assert.ok(verificarCero(await leerEstado(db)).includes('inventario_auditorias activo'));
    await db.query(`INSERT INTO movimiento_inventario
      (producto_id,tipo,cantidad,contabiliza,origen_tipo,origen_id,clave_operacion)
      VALUES ((SELECT id FROM producto ORDER BY id LIMIT 1),'venta',-2,TRUE,'factura',1,'zz-auditoria-lectura')`);
    assert.ok(verificarCero(await leerEstado(db)).includes('existencias/conteo/valoración'));
    await db.query('ROLLBACK');
    // Los seriales consumidos no se revierten; las filas de TODO el clon sí.
    assert.deepEqual((await capturarEstado(pool)).tablas, antes.tablas);
  } finally {
    db.release();
    await pool.end();
  }
});

test('las secuencias también se conservan: una consulta no debe consumir un serial', () => {
  const a = { ...valido(), secuencias: [{ sequencename: 'zz_id', valor: '1' }] };
  const b = { ...a, secuencias: [{ sequencename: 'zz_id', valor: '2' }] };
  assert.deepEqual(compararHistoria(a, b), ['secuencia:zz_id']);
  assert.deepEqual(compararHistoria(a, a), []);
});
