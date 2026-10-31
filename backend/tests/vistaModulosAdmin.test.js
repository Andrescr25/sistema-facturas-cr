const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

describe('vista del administrador guardada en PostgreSQL local', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, () => {
  let c, usuarios, auth, server, base, admin, otro, empleado, token;
  const llamar = async (path, metodo = 'GET', body, credencial = token) => {
    const r = await fetch(base + path, { method: metodo, headers: {
      ...(credencial ? { Authorization: `Bearer ${credencial}` } : {}), 'Content-Type': 'application/json'
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, data: await r.json() };
  };
  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
    c = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
    await c.connect(); await c.query('BEGIN');
    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(c, 'vista_modulos') };
    usuarios = require('../src/modules/usuarios/usuarios.service');
    auth = require('../src/modules/auth/auth.service');
    const hash = await require('bcryptjs').hash('ZZ prueba local', 4);
    const insertar = async esAdmin => (await c.query(`INSERT INTO usuario(usuario,nombre,password_hash,es_admin)
      VALUES($1,'ZZ Vista de módulos',$2,$3) RETURNING id,usuario`, [`zz-vista-${randomUUID().slice(0, 8)}`, hash, esAdmin])).rows[0];
    admin = await insertar(true); otro = await insertar(true); empleado = await insertar(false);
    await c.query("INSERT INTO usuario_modulo(usuario_id,modulo) VALUES($1,'ingresos')", [empleado.id]);
    token = (await auth.login({ usuario: admin.usuario, password: 'ZZ prueba local' })).token;
    const app = require('express')(); app.use(require('express').json());
    app.use('/api', require('../src/modules/auth/auth.middleware').requireAuth);
    app.use('/api', require('../src/modules/usuarios/permisos.middleware').requirePermiso);
    app.use('/api/usuarios', require('../src/modules/usuarios/usuarios.routes'));
    app.use('/api/auth', require('../src/modules/auth/auth.routes'));
    app.get('/api/rentabilidad', (req, res) => res.json({ success: true }));
    server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  after(async () => { if (server) await new Promise(r => server.close(r)); if (c) { await c.query('ROLLBACK'); await c.end(); } });

  test('puede quitarse módulos de su vista sin perder su rol, cuenta o permisos', async () => {
    const r = await llamar(`/usuarios/${admin.id}`, 'PUT', { modulosOcultos: ['ingresos', 'rentabilidad'] });
    assert.equal(r.status, 200); assert.deepEqual(r.data.data.modulosOcultos, ['ingresos', 'rentabilidad']);
    assert.equal(r.data.data.esAdmin, true); assert.equal(r.data.data.activo, true);
    assert.ok(r.data.data.modulos.includes('rentabilidad'));
    assert.equal((await llamar('/rentabilidad')).status, 200);
    assert.equal((await llamar('/usuarios')).status, 200);
  });
  test('el token anterior relee la elección desde la base, y el login nuevo la incluye', async () => {
    const yo = await llamar('/auth/yo');
    assert.deepEqual(yo.data.data.modulosOcultos, ['ingresos', 'rentabilidad']);
    const login = await auth.login({ usuario: admin.usuario, password: 'ZZ prueba local' });
    assert.deepEqual(login.usuario.modulosOcultos, yo.data.data.modulosOcultos);
    assert.deepEqual(auth.verificarToken(login.token).modulosOcultos, yo.data.data.modulosOcultos);
    assert.deepEqual((await usuarios.obtener(admin.id)).modulosOcultos, yo.data.data.modulosOcultos);
  });
  test('la lista conserva la elección y la de otro administrador es independiente', async () => {
    const lista = (await llamar('/usuarios')).data.data;
    assert.deepEqual(lista.find(u => u.id === admin.id).modulosOcultos, ['ingresos', 'rentabilidad']);
    assert.deepEqual(lista.find(u => u.id === otro.id).modulosOcultos, []);
    await usuarios.actualizar(otro.id, { modulosOcultos: ['preventa'] }, admin.id);
    assert.deepEqual((await usuarios.obtener(admin.id)).modulosOcultos, ['ingresos', 'rentabilidad']);
  });
  test('una edición parcial conserva la vista y volver a marcar todo guarda vacío', async () => {
    await usuarios.actualizar(admin.id, { nombre: 'ZZ Otro nombre' }, admin.id);
    assert.deepEqual((await usuarios.obtener(admin.id)).modulosOcultos, ['ingresos', 'rentabilidad']);
    assert.equal((await llamar(`/usuarios/${admin.id}`, 'PUT', { modulosOcultos: [] })).status, 200);
    assert.deepEqual((await llamar('/auth/yo')).data.data.modulosOcultos, []);
  });
  test('ocultar todos los módulos no le permite quitarse el rol ni desactivarse', async () => {
    const claves = require('../src/modules/usuarios/modulos').MODULOS.map(m => m.clave);
    assert.equal((await llamar(`/usuarios/${admin.id}`, 'PUT', { modulosOcultos: claves })).status, 200);
    assert.equal((await llamar('/usuarios')).status, 200);
    for (const body of [{ esAdmin: false }, { activo: false }]) {
      assert.equal((await llamar(`/usuarios/${admin.id}`, 'PUT', body)).status, 400);
    }
    assert.equal((await usuarios.obtener(admin.id)).esAdmin, true);
  });
  test('campos inválidos se rechazan antes de guardar nombre o rol', async () => {
    const antes = await usuarios.obtener(admin.id);
    for (const modulosOcultos of [null, 'ingresos', ['usuarios'], ['cobro-factura'], ['NO-EXISTE'], [5]]) {
      assert.equal((await llamar(`/usuarios/${admin.id}`, 'PUT', { nombre: 'ZZ No guardar', modulosOcultos })).status, 400);
      assert.deepEqual(await usuarios.obtener(admin.id), antes);
    }
  });
  test('el personal no gana permisos ni pierde su módulo por una preferencia de vista', async () => {
    await c.query("UPDATE usuario SET modulos_ocultos=ARRAY['ingresos'] WHERE id=$1", [empleado.id]);
    const login = await auth.login({ usuario: empleado.usuario, password: 'ZZ prueba local' });
    assert.deepEqual(login.usuario.modulosOcultos, []);
    assert.deepEqual(login.usuario.modulos, ['ingresos']);
    assert.equal((await llamar('/usuarios', 'GET', null, login.token)).status, 403);
    assert.equal((await llamar(`/usuarios/${empleado.id}`, 'PUT', { modulosOcultos: [] }, login.token)).status, 403);
    assert.equal((await llamar('/rentabilidad', 'GET', null, login.token)).status, 403);
    assert.equal((await llamar('/usuarios', 'GET', null, null)).status, 401);
  });
  test('al dejar de ser administrador se elimina la preferencia y rigen sus permisos normales', async () => {
    const r = await usuarios.actualizar(otro.id, { esAdmin: false, modulos: ['ingresos'] }, admin.id);
    assert.equal(r.esAdmin, false); assert.deepEqual(r.modulosOcultos, []);
    assert.deepEqual((await usuarios.permisosDe(otro.id)).modulosOcultos, []);
    assert.deepEqual((await c.query('SELECT modulos_ocultos FROM usuario WHERE id=$1', [otro.id])).rows[0].modulos_ocultos, []);
  });
});
