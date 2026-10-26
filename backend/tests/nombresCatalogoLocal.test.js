/** Correcciones masivas verificadas en PostgreSQL desechable y ROLLBACK. */
const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');

describe('nombres revisados del catálogo', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, () => {
  let pool, c, servicio, sub, marca, otra, producto, usuario;
  before(async () => {
    const url = new URL(process.env.DATABASE_URL);
    assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
    assert.match(url.pathname, /^\/tachi_codex_[a-z0-9_]+$/);
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 1 });
    c = await pool.connect();
    await c.query('BEGIN');
    const db = require.resolve('../config/database');
    require.cache[db] = { id: db, filename: db, loaded: true, exports: baseEnTransaccion(c, 'nombres') };
    servicio = require('../src/modules/productos/nombresCatalogo.service');
    const cat = (await c.query("INSERT INTO categoria_producto(nombre) VALUES('ZZ nombres') RETURNING id")).rows[0].id;
    sub = (await c.query("INSERT INTO subcategoria(categoria,nombre) VALUES('ZZ nombres','ZZ nombres') RETURNING id")).rows[0].id;
    marca = (await c.query("INSERT INTO marca_catalogo(subcategoria_id,nombre) VALUES($1,'ZZ Gipsum') RETURNING id", [sub])).rows[0].id;
    otra = (await c.query("INSERT INTO marca_catalogo(subcategoria_id,nombre) VALUES($1,'ZZ Otra') RETURNING id", [sub])).rows[0].id;
    producto = (await c.query(`INSERT INTO producto(nombre,referencia,categoria_id,subcategoria_id,marca_catalogo_id,precio_sin_iva,costo_con_iva)
      VALUES('ZZ TORNILLO 1 PTA FINA 1X100','ZZ-NOMBRE',$1,$2,$3,100,50) RETURNING id`, [cat, sub, marca])).rows[0].id;
    usuario = (await c.query('SELECT id FROM usuario ORDER BY id LIMIT 1')).rows[0].id;
  });
  beforeEach(() => c.query('SAVEPOINT nombre_caso'));
  afterEach(() => c.query('ROLLBACK TO SAVEPOINT nombre_caso'));
  after(async () => { if (c) { await c.query('ROLLBACK'); c.release(); } await pool?.end(); });
  const plan = () => ({ productos: [{ id: producto, marcaId: marca, antes: 'ZZ TORNILLO 1 PTA FINA 1X100', despues: 'ZZ Tornillo 1 · punta fina · 1 × 100' }],
    marcas: [{ id: marca, antes: 'ZZ Gipsum', despues: 'ZZ Gypsum' }] });
  const aplicar = (p = plan(), guardarRespaldo = async () => {}) => servicio.corregirNombres(p, usuario, { aplicar: true, guardarRespaldo });

  test('la vista previa no escribe ni pide respaldo', async () => {
    const antes = (await c.query('SELECT * FROM producto WHERE id=$1', [producto])).rows;
    const cambios = await servicio.corregirNombres(plan());
    assert.equal(cambios.productos.length, 1);
    assert.deepEqual((await c.query('SELECT * FROM producto WHERE id=$1', [producto])).rows, antes);
  });
  test('sólo nombres y fecha; respaldo anterior, bitácora y repetición sin cambios', async () => {
    const antes = (await c.query('SELECT * FROM producto WHERE id=$1', [producto])).rows[0];
    let respaldo;
    await aplicar(plan(), async f => { respaldo = f; assert.equal((await c.query('SELECT nombre FROM producto WHERE id=$1', [producto])).rows[0].nombre, antes.nombre); });
    const despues = (await c.query('SELECT * FROM producto WHERE id=$1', [producto])).rows[0];
    for (const k of Object.keys(antes).filter(k => !['nombre', 'actualizado_en'].includes(k))) assert.deepEqual(despues[k], antes[k], k);
    assert.equal(despues.nombre, plan().productos[0].despues);
    const visibles = await require('../src/modules/productos/taxonomia.service').productosDeCategoria(despues.categoria_id);
    assert.equal(visibles.find(p => p.id === producto).marca_catalogo_id, marca);
    assert.equal(respaldo.productos[0].nombre, antes.nombre);
    const logs = (await c.query("SELECT cambios,motivo FROM bitacora_cambio WHERE entidad='producto' AND entidad_id=$1", [String(producto)])).rows;
    assert.equal(logs.length, 1);
    assert.deepEqual(Object.keys(logs[0].cambios), ['nombre']);
    const otraVez = await aplicar(plan(), () => assert.fail('No necesita otro respaldo'));
    assert.deepEqual(otraVez, { productos: [], marcas: [] });
  });
  test('detiene todo si el nombre cambió después de revisar el plan', async () => {
    await c.query("UPDATE producto SET nombre='ZZ Edición reciente' WHERE id=$1", [producto]);
    await assert.rejects(aplicar(), e => e.status === 409);
    assert.equal((await c.query('SELECT nombre FROM marca_catalogo WHERE id=$1', [marca])).rows[0].nombre, 'ZZ Gipsum');
  });
  test('no modifica un producto reasignado a otra marca', async () => {
    await c.query('UPDATE producto SET marca_catalogo_id=$2 WHERE id=$1', [producto, otra]);
    await assert.rejects(aplicar(), e => e.status === 409);
  });
  test('si falla el respaldo no escribe nada', async () => {
    await assert.rejects(aplicar(plan(), async () => { throw new Error('disco sin espacio'); }), /disco sin espacio/);
    assert.equal((await c.query('SELECT nombre FROM producto WHERE id=$1', [producto])).rows[0].nombre, plan().productos[0].antes);
  });
  test('un fallo de SQL revierte también nombres y bitácora anteriores', async () => {
    const p = plan();
    p.marcas.push({ id: otra, antes: 'ZZ Otra', despues: 'ZZ Gypsum' });
    await assert.rejects(aplicar(p), e => e.code === '23505');
    assert.equal((await c.query('SELECT nombre FROM marca_catalogo WHERE id=$1', [marca])).rows[0].nombre, 'ZZ Gipsum');
    assert.equal((await c.query("SELECT count(*)::int n FROM bitacora_cambio WHERE entidad='marca_catalogo' AND entidad_id=$1", [String(marca)])).rows[0].n, 0);
  });
  test('rechaza identificadores repetidos y nombres inválidos antes de tocar datos', () => {
    const p = plan(); p.productos.push(p.productos[0]);
    assert.throws(() => servicio.validarPlan(p), e => e.status === 400);
    p.productos = [{ ...p.productos[0], despues: ' ' }];
    assert.throws(() => servicio.validarPlan(p), e => e.status === 400);
  });
});
