/** Lecturas públicas y carrito real sobre PostgreSQL local, todo en ROLLBACK. */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');

describe('marcas del catálogo de clientes con base local', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, () => {
  let pool, c, catalogo, carrito, cuenta, categoria, sub, marca, ids;
  before(async () => {
    const url = new URL(process.env.DATABASE_URL);
    assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
    assert.match(url.pathname, /^\/tachi_codex_[a-z0-9_]+$/);
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 1 });
    c = await pool.connect();
    await c.query('BEGIN');
    const ruta = require.resolve('../config/database');
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: baseEnTransaccion(c, 'catalogo_marca') };
    catalogo = require('../src/modules/catalogo-clientes/catalogo-clientes.service');
    carrito = require('../src/modules/portal-clientes/portal-clientes.carrito.service');
    categoria = (await c.query("INSERT INTO categoria_producto(nombre) VALUES('ZZ catálogo familias') RETURNING id")).rows[0].id;
    await c.query("INSERT INTO categoria_config(categoria,nombre_visible,orden) VALUES('ZZ catálogo familias','ZZ Herramientas',-100)");
    sub = (await c.query("INSERT INTO subcategoria(categoria,nombre,orden) VALUES('ZZ catálogo familias','ZZ Candados',0) RETURNING id")).rows[0].id;
    marca = (await c.query(`INSERT INTO marca_catalogo(subcategoria_id,nombre,imagen) VALUES($1,'ZZ Tricicle',
      '{"url":"/archivos/marcas/zz.webp","ancho":600,"alto":900,"costo":88}') RETURNING id`, [sub])).rows[0].id;
    ids = (await c.query(`INSERT INTO producto(nombre,categoria_id,subcategoria_id,marca_catalogo_id,precio_sin_iva,impuesto_id)
      SELECT 'ZZ Candado ' || n || ' mm',$1,$2,$3,100,(SELECT id FROM impuesto WHERE tarifa=13 AND activo LIMIT 1)
      FROM generate_series(1,80) n RETURNING id`, [categoria, sub, marca])).rows.map(p => p.id);
    await c.query(`INSERT INTO producto(nombre,categoria_id,precio_sin_iva) VALUES('ZZ Suelto',$1,100)`, [categoria]);
    await c.query('UPDATE producto SET oculto=TRUE WHERE id=$1', [ids[0]]);
    await c.query('UPDATE producto SET activo=FALSE WHERE id=$1', [ids[1]]);
    const cliente = (await c.query("INSERT INTO cliente(nombre) VALUES('zz-marcas cliente') RETURNING id")).rows[0].id;
    cuenta = (await c.query("INSERT INTO cliente_portal(cliente_id,nombre) VALUES($1,'zz-marcas cliente') RETURNING id", [cliente])).rows[0].id;
  });
  after(async () => { if (c) { await c.query('ROLLBACK'); c.release(); } await pool?.end(); });

  test('páginas estables, familias y marcas sin pérdida ni duplicación de productos', async () => {
    const a = await catalogo.listarProductos({ categoria: 'ZZ catálogo familias', porPagina: 60 });
    const b = await catalogo.listarProductos({ categoria: 'ZZ catálogo familias', pagina: 2, porPagina: 60 });
    assert.equal(a.total, 79);
    assert.equal(a.productos.length, 60);
    assert.equal(a.hayMas, true);
    assert.equal(b.hayMas, false);
    assert.deepEqual(a.productos, (await catalogo.listarProductos({ categoria: 'ZZ catálogo familias', porPagina: 60 })).productos);
    const todos = [...a.productos, ...b.productos];
    assert.equal(new Set(todos.map(p => p.id)).size, 79);
    assert.equal(todos.filter(p => p.marca?.id === marca).length, 78);
    assert.equal(todos.at(-1).marca, null);
    assert.equal(todos.at(-1).subcategoria, null);
    assert.equal(todos[0].categoriaVisible, 'ZZ Herramientas');
    assert.doesNotMatch(JSON.stringify(todos), /costo|margen/);
  });
  test('busca por marca y subcategoría sin acentos, sin publicar ocultos/inactivos', async () => {
    for (const busqueda of ['zz tricicle', 'zz candados']) {
      const r = await catalogo.listarProductos({ busqueda, porPagina: 120 });
      assert.equal(r.total, 78);
      assert.ok(r.productos.every(p => p.marca.id === marca && p.subcategoria.id === sub));
    }
  });
  test('categoría usa nombre visible pero mantiene el nombre real para filtrar', async () => {
    const categorias = await catalogo.listarCategorias();
    assert.deepEqual(categorias[0], { nombre: 'ZZ catálogo familias', nombreVisible: 'ZZ Herramientas', productos: 79 });
  });
  test('comprar una presentación conserva id, precio con IVA y cantidad del carrito', async () => {
    await carrito.ponerCantidad(cuenta, ids[2], 2);
    const r = await carrito.obtenerCarrito(cuenta);
    assert.equal(r.lineas.length, 1);
    assert.equal(r.lineas[0].producto.id, ids[2]);
    assert.equal(r.lineas[0].cantidad, 2);
    assert.equal(r.lineas[0].producto.precio, 113);
    assert.equal(r.lineas[0].producto.marca.id, marca);
    assert.equal(r.total, 226);
  });
});
