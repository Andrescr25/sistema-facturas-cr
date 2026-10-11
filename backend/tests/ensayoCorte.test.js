const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { validarBase, argumentos, revisarArchivos, estado, verificarEstado } = require('../scripts/independencia/lib/ensayo-corte');
const args = ['--base=tachi_ensayo_prueba', '--dump=/private/tmp/origen.dump', '--destino=/private/tmp/ensayo-nuevo', '--desde=2026-09-01', '--hasta=2026-09-30'];

test('el ensayo nunca puede elegir producción, compartida o inyectar SQL en un nombre', () => {
  for (const base of ['tachi', 'postgres', 'tachi_codex_inventario_20261004', 'produccion', 'tachi_ensayo_a;DROP DATABASE tachi', 'tachi_ensayo_AAAA', undefined]) assert.throws(() => validarBase(base));
  assert.equal(validarBase('tachi_ensayo_20261005_a'), 'tachi_ensayo_20261005_a');
});
test('alcance y rutas son explícitos: fechas reales, una/dos pasadas, sin opciones duplicadas', () => {
  assert.equal(argumentos(args).pasadas, 2); assert.equal(argumentos([...args, '--pasadas=1']).pasadas, 1);
  for (const extras of [['--pasadas=0'], ['--pasadas=3'], ['--base=tachi_ensayo_otro'], ['--si'], ['--desde=2026-02-30']]) assert.throws(() => argumentos([...args, ...extras]));
  assert.throws(() => argumentos(args.map(a => a.startsWith('--dump=') ? '--dump=relativo.dump' : a)));
});
test('dump privado regular, sin enlaces ni Git; destino nuevo sin sobrescribir', async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zz-ensayo-')));
  try {
    await fs.chmod(dir, 0o700); const dump = path.join(dir, 'origen.dump'), destino = path.join(dir, 'nuevo');
    await fs.writeFile(dump, 'zz-dump', { mode: 0o600 }); await revisarArchivos({ dump, destino });
    await fs.chmod(dump, 0o644); await assert.rejects(revisarArchivos({ dump, destino })); await fs.chmod(dump, 0o600);
    const enlace = path.join(dir, 'enlace.dump'); await fs.symlink(dump, enlace); await assert.rejects(revisarArchivos({ dump: enlace, destino }));
    await fs.mkdir(destino); await fs.writeFile(path.join(destino, 'existente'), 'no pisar');
    await assert.rejects(revisarArchivos({ dump, destino })); assert.equal(await fs.readFile(path.join(destino, 'existente'), 'utf8'), 'no pisar');
    await fs.mkdir(path.join(dir, '.git')); await assert.rejects(revisarArchivos({ dump, destino: path.join(dir, 'otro') }));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('un resultado con stock contado, numerador inseguro o intento pendiente no pasa por ensayo completo', () => {
  const base = { stock: { productos: 1, con_existencias: 0, contados: 0 }, intentos_no_resueltos: 0, series: [{ siguiente: '9007199254740994', maximo: '9007199254740993', electronica: false, activo: true }] };
  verificarEstado(base);
  for (const cambio of [{ stock: { productos: 0 } }, { stock: { productos: 1, con_existencias: 1 } }, { stock: { productos: 1, contados: 1 } }, { intentos_no_resueltos: 1 }, { series: [{ siguiente: '2', maximo: '2' }] }, { series: [{ siguiente: '3', maximo: '2', electronica: true, activo: true }] }]) assert.throws(() => verificarEstado({ ...base, ...cambio }));
});
test('CLI rechaza la base compartida antes de abrir conexiones y sin revelar credenciales', () => {
  const r = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/independencia/ensayar-corte.js'), ...args.map(a => a.startsWith('--base=') ? '--base=tachi' : a)], { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 1); assert.ok(!r.stdout.includes('Database')); assert.ok(!r.stdout.includes('Restaurar')); assert.ok(!`${r.stdout}${r.stderr}`.includes('postgresql://'));
});
test('PostgreSQL: estado lee documentos y saldos reales, sin escribir ni consumir numeradores', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, async () => {
  const { pool } = require('../config/database');
  try {
    const db = await pool.connect(); await db.query('BEGIN TRANSACTION READ ONLY');
    try {
      const a = await estado(db), b = await estado(db); assert.deepEqual(a, b);
      assert.equal(a.stock.con_existencias, 0); assert.equal(a.stock.contados, 0);
      assert.ok(a.huellas.factura.filas > 0); assert.ok(a.huellas.compra.filas > 0);
      assert.ok(a.series.every(s => /^\d+$/.test(s.siguiente)));
    } finally { await db.query('ROLLBACK'); db.release(); }
    const { leerDatos } = require('../scripts/independencia/lib/datos-corte');
    const antes = await estado(pool);
    const datos = await leerDatos(pool);
    assert.ok(datos.resumen.clientes.fichas > 0);
    assert.ok(datos.pendientes.productos.every(p => p.id > 0 && p.motivos.length));
    assert.deepEqual(await estado(pool), antes);
    // Intentar una escritura en la misma conexión confirma que la auditoría
    // abrió READ ONLY, incluso con un UPDATE que no afectaría ninguna fila.
    await assert.rejects(leerDatos({ connect: async () => {
      const c = await pool.connect();
      return { query: sql => sql.startsWith('SELECT') ? c.query('UPDATE producto SET nombre=nombre WHERE false') : c.query(sql), release: () => c.release() };
    } }), e => e.code === '25006');
    assert.deepEqual(await estado(pool), antes);
  } finally { await pool.end(); }
});
