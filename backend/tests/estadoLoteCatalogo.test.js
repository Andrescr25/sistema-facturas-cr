const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { cambiosDeEstado, accionDeEstado } = require('../src/modules/productos/estadoProducto');

test('la ficha y el lote aceptan solo banderas booleanas y distinguen ocultar de desactivar', () => {
  assert.deepEqual(cambiosDeEstado({ oculto: true, precio: 0 }), { oculto: true });
  for (const datos of [{}, { activo: 'false' }, { oculto: 1 }, { activo: null }]) {
    assert.throws(() => cambiosDeEstado(datos), e => e.status === 400);
  }
  assert.equal(accionDeEstado({ activo: true, oculto: false }, { activo: true, oculto: true }), 'ocultar');
  assert.equal(accionDeEstado({ activo: true, oculto: true }, { activo: false, oculto: true }), 'desactivar');
});

describe('selección del catálogo — PostgreSQL y HTTP, todo con ROLLBACK', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, () => {
  let c, pool, servicio, productos, clienteCatalogo, admin, ids, antes, marca, server, base;
  const rutaDb = require.resolve('../config/database');
  const leer = () => c.query('SELECT * FROM producto WHERE id=ANY($1::int[]) ORDER BY id', [ids]).then(r => r.rows);
  const bitacoras = () => c.query("SELECT * FROM bitacora_cambio WHERE entidad='producto' AND entidad_id=ANY($1::text[]) ORDER BY id", [ids.map(String)]).then(r => r.rows);
  const sinEstado = p => Object.fromEntries(Object.entries(p).filter(([k]) => !['activo', 'oculto', 'actualizado_en'].includes(k)));

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_/);
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL });
    c = await pool.connect(); await c.query('BEGIN');
    const { baseEnTransaccion } = require('../src/utils/baseEnTransaccion');
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(c, 'estadocatalogo') };
    servicio = require('../src/modules/productos/taxonomia.service');
    productos = require('../src/modules/productos/productos.service');
    clienteCatalogo = require('../src/modules/catalogo-clientes/catalogo-clientes.service');
    const cat = (await c.query('SELECT id,nombre FROM categoria_producto WHERE activo ORDER BY id LIMIT 1')).rows[0];
    admin = (await c.query('SELECT id FROM usuario WHERE activo AND es_admin ORDER BY id LIMIT 1')).rows[0].id;
    const zz = randomUUID().slice(0, 8);
    const sub = (await c.query('INSERT INTO subcategoria(categoria,nombre) VALUES($1,$2) RETURNING id', [cat.nombre, 'ZZ Lote '+zz])).rows[0];
    marca = (await c.query('INSERT INTO marca_catalogo(subcategoria_id,nombre) VALUES($1,$2) RETURNING id', [sub.id, 'ZZ Marca lote '+zz])).rows[0];
    ids = [];
    for (let i = 0; i < 3; i++) ids.push((await c.query(`INSERT INTO producto(nombre,referencia,cabys,precio_sin_iva,costo_con_iva,categoria_id,subcategoria_id,marca_catalogo_id,descripcion)
      VALUES($1,$2,'4294401030100',100,60,$3,$4,$5,'ZZ descripción conservada') RETURNING id`, ['ZZ Lote '+zz+' '+i, 'ZZ-LOTE-'+zz+'-'+i, cat.id, sub.id, marca.id])).rows[0].id);
    antes = await leer();
    const app = require('express')(); app.use(require('express').json());
    app.use('/api', require('../src/modules/auth/auth.middleware').requireAuth);
    app.use('/api', require('../src/modules/usuarios/permisos.middleware').requirePermiso);
    app.use('/api/maestro', require('../src/modules/productos/productos.routes').routes);
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}/api/maestro/lote/estado`;
  });
  beforeEach(async () => {
    await c.query('UPDATE producto SET activo=true,oculto=false WHERE id=ANY($1::int[])', [ids]);
    await c.query("DELETE FROM bitacora_cambio WHERE entidad='producto' AND entidad_id=ANY($1::text[])", [ids.map(String)]);
  });
  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (c) { await c.query('ROLLBACK'); c.release(); } await pool?.end();
  });

  test('ocultar conserva la venta y todos los demás campos; solo audita cambios reales', async () => {
    await c.query('UPDATE producto SET oculto=true WHERE id=$1', [ids[1]]);
    const resultado = await servicio.cambiarEstadoEnLote({ productoIds: [ids[1], ids[0], ids[0]], oculto: true }, String(admin));
    assert.equal(resultado.actualizados, 1);
    assert.deepEqual(resultado.productoIds, ids.slice(0, 2));
    const despues = await leer();
    assert.deepEqual(despues.map(p => [p.activo, p.oculto]), [[true, true], [true, true], [true, false]]);
    assert.deepEqual(despues.map(sinEstado), antes.map(sinEstado));
    const registros = await bitacoras(); assert.equal(registros.length, 1);
    assert.equal(registros[0].accion, 'ocultar'); assert.equal(registros[0].usuario_id, admin);
    assert.deepEqual(registros[0].antes, { activo: true, oculto: false });
    assert.deepEqual(registros[0].despues, { activo: true, oculto: true });
    assert.equal((await servicio.cambiarEstadoEnLote({ productoIds: ids.slice(0, 2), oculto: true }, admin)).actualizados, 0);
    assert.deepEqual(await leer(), despues); assert.equal((await bitacoras()).length, 1);
    assert.equal((await productos.productosParaOperar({ buscar: antes[0].referencia })).data.some(p => p.id === ids[0]), true);
    assert.equal((await clienteCatalogo.listarProductos({ busqueda: antes[0].referencia })).total, 0);
  });

  test('desactivar retira de la venta, conserva la ocultación y mantiene la marca e importes', async () => {
    await c.query('UPDATE producto SET activo=false WHERE id=$1', [ids[2]]);
    await c.query('UPDATE producto SET oculto=true WHERE id=$1', [ids[1]]);
    assert.equal((await servicio.cambiarEstadoEnLote({ productoIds: [...ids].reverse(), activo: false }, admin)).actualizados, 2);
    const despues = await leer(); assert.ok(despues.every(p => !p.activo));
    assert.equal(despues[1].oculto, true); assert.deepEqual(despues.map(sinEstado), antes.map(sinEstado));
    assert.ok((await bitacoras()).every(b => b.accion === 'desactivar'));
    assert.equal((await productos.productosParaOperar({ buscar: antes[0].referencia })).data.some(p => p.id === ids[0]), false);
    assert.equal((await clienteCatalogo.listarProductos({ busqueda: antes[0].referencia })).total, 0);
  });

  test('un id que falta o una entrada inválida no cambia una parte de la selección', async () => {
    const estado = await leer();
    await assert.rejects(servicio.cambiarEstadoEnLote({ productoIds: [ids[0], 2147483647], activo: false }, admin), e => e.status === 404);
    for (const datos of [{ productoIds: [] }, { productoIds: ['x'] }, { productoIds: Array(1001).fill(ids[0]) }, { productoIds: ids, oculto: 'true' }, { productoIds: ids }]) {
      await assert.rejects(servicio.cambiarEstadoEnLote(datos, admin), e => e.status === 400);
    }
    assert.deepEqual(await leer(), estado); assert.deepEqual(await bitacoras(), []);
  });

  test('si falla una bitácora se revierte todo el lote, incluidas las primeras líneas', async () => {
    await c.query(`CREATE FUNCTION pg_temp.zz_rechazo_estado() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.entidad='producto' AND NEW.entidad_id='${ids[1]}' THEN RAISE EXCEPTION 'ZZ rechazo de bitácora'; END IF; RETURN NEW; END $$`);
    await c.query('CREATE TRIGGER zz_rechazo_estado BEFORE INSERT ON bitacora_cambio FOR EACH ROW EXECUTE FUNCTION pg_temp.zz_rechazo_estado()');
    const estado = await leer();
    try {
      await assert.rejects(servicio.cambiarEstadoEnLote({ productoIds: ids, oculto: true }, admin), /ZZ rechazo de bitácora/);
      assert.deepEqual(await leer(), estado); assert.deepEqual(await bitacoras(), []);
    } finally { await c.query('DROP TRIGGER zz_rechazo_estado ON bitacora_cambio'); }
  });

  test('HTTP exige sesión y Gestión de Catálogo antes de modificar productos', async () => {
    const jwt = require('jsonwebtoken');
    const llamar = token => fetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer '+token } : {}) }, body: JSON.stringify({ productoIds: [ids[0]], oculto: true }) });
    assert.equal((await llamar()).status, 401);
    for (const modulo of ['facturacion', 'gestion-catalogo']) {
      const { rows: [u] } = await c.query("INSERT INTO usuario(usuario,nombre,password_hash) VALUES($1,'ZZ permisos lote','zz') RETURNING id", ['zz-estado-'+randomUUID().slice(0,8)]);
      await c.query('INSERT INTO usuario_modulo(usuario_id,modulo) VALUES($1,$2)', [u.id, modulo]);
      const token = jwt.sign({ sub: u.id, usuario: 'ZZ estado' }, process.env.JWT_SECRET, { expiresIn: '5m' });
      const r = await llamar(token); assert.equal(r.status, modulo === 'gestion-catalogo' ? 200 : 403);
    }
    assert.equal((await leer())[0].oculto, true);
  });

  test('mil productos se cambian y auditan en cinco consultas, sin una petición por ficha', async () => {
    const zz = randomUUID().slice(0, 8);
    const lote = (await c.query(`INSERT INTO producto(nombre,referencia,precio_sin_iva)
      SELECT 'ZZ escala '||$1||' '||n,'ZZ-ESCALA-'||$1||'-'||n,100 FROM generate_series(1,1000) n RETURNING id`, [zz])).rows.map(p => p.id);
    const query = c.query, consultas = [];
    c.query = function(sql, params) { consultas.push(sql); return query.call(this, sql, params); };
    try {
      const r = await servicio.cambiarEstadoEnLote({ productoIds: lote, oculto: true }, admin);
      assert.equal(r.actualizados, 1000);
    } finally { c.query = query; }
    assert.equal(consultas.length, 5, 'savepoint, bloqueo, cambio, bitácora y confirmación');
    const r = await c.query("SELECT COUNT(*)::int n FROM bitacora_cambio WHERE entidad='producto' AND entidad_id=ANY($1::text[]) AND accion='ocultar'", [lote.map(String)]);
    assert.equal(r.rows[0].n, 1000);
  });
});
