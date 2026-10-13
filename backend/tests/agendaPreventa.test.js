const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { preparar } = require('./dobles/agendaPreventa');
const { sumarDias } = require('../src/utils/fechaCR');
const activo = process.env.PROBAR_BASE_LOCAL === '1';

describe('Preventa — agenda completa y permisos, PostgreSQL local', { skip: !activo }, () => {
  let c, pool, f, servicio, server, base, lectura;
  const lista = async rutaId => (await servicio.agenda({ rutaId })).clientes;
  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL });
    c = await pool.connect(); await c.query('BEGIN'); f = await preparar(c);
    const ruta = require.resolve('../config/database');
    const db = { query: (sql, p) => (lectura || c).query(sql, p) };
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: db };
    servicio = require('../src/modules/preventa/preventa.service');
    const app = require('express')();
    app.use('/api', require('../src/modules/auth/auth.middleware').requireAuth);
    app.use('/api', require('../src/modules/usuarios/permisos.middleware').requirePermiso);
    app.use('/api/preventa', require('../src/modules/preventa/preventa.routes'));
    server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  after(async () => {
    if (server) await new Promise(r => server.close(r));
    if (c) { await c.query('ROLLBACK'); c.release(); } await pool?.end();
  });

  test('ruta sin ciclos: todos sus activos, incluso sin faltantes y sin facturas', async () => {
    const datos = await servicio.agenda({ rutaId: String(f.a.id) });
    assert.equal(datos.hoy, f.hoy); assert.equal(datos.clientes.length, 6);
    assert.ok(datos.clientes.every(c => c.ruta.id === f.a.id));
    assert.ok(!datos.clientes.some(c => c.id === f.desactivado.id));
    assert.equal((await c.query('SELECT count(*)::int AS n FROM faltantes WHERE factura_propia_id=ANY($1::int[])', [f.facturas.map(d => d.id)])).rows[0].n, 0);
    assert.deepEqual(datos.clientes.map(c => c.rotacion.estado), ['atrasado', 'hoy', 'proximo', 'proximo', 'sin_facturas', 'sin_rotacion']);
    assert.equal(datos.clientes[0].id, f.atrasado.id);
  });
  test('frecuencias y fechas separadas por id, aunque tengan el mismo nombre', async () => {
    const clientes = (await lista(f.a.id)).filter(c => c.nombre === f.homonimo.nombre);
    assert.equal(clientes.length, 2);
    assert.equal(clientes.find(c => c.id === f.homonimo.id).rotacion.proximaVisita, sumarDias(f.hoy, 19));
    assert.equal(clientes.find(c => c.id === f.gemelo.id).rotacion.proximaVisita, sumarDias(f.hoy, 4));
  });
  test('sin frecuencia no inventa plazo; con frecuencia sin facturas no inventa atención', async () => {
    const clientes = await lista(f.a.id);
    assert.deepEqual(clientes.find(c => c.id === f.sinFrecuencia.id).rotacion, {
      dias: null, ultimaAtencion: null, proximaVisita: null, faltan: null, estado: 'sin_rotacion' });
    assert.deepEqual(clientes.find(c => c.id === f.sinFacturas.id).rotacion, {
      dias: 7, ultimaAtencion: null, proximaVisita: null, faltan: null, estado: 'sin_facturas' });
  });
  test('sin ruta, ruta vacía e inexistente no devuelven otra ruta', async () => {
    assert.ok((await lista('sin-ruta')).some(c => c.id === f.sinRuta.id));
    assert.ok(!(await lista('sin-ruta')).some(c => c.id === f.homonimo.id));
    assert.deepEqual(await lista(f.vacia.id), []);
    assert.deepEqual(await lista(2147483647), []);
  });
  test('selector mínimo conserva rutas sin semanas e inactivas asignadas', async () => {
    const rutas = await servicio.listarRutas();
    assert.ok(rutas.some(r => r.id === f.vacia.id)); assert.ok(rutas.some(r => r.id === f.inactiva.id));
    assert.deepEqual(Object.keys(rutas[0]).sort(), ['activo', 'id', 'nombre']);
    assert.equal((await lista(f.inactiva.id))[0].id, f.enInactiva.id);
  });
  test('ruta vacía, inválida o semana rechazan antes de consultar el conjunto', async () => {
    for (const rutaId of ['', null, undefined, '0', '1.5', [], {}, true, '1 OR 1=1', '2147483648']) {
      await assert.rejects(servicio.agenda({ rutaId }), e => e.status === 400);
    }
    await assert.rejects(servicio.agenda({ rutaId: f.a.id, cicloId: '1' }), e => e.status === 400);
  });
  test('leer agenda y rutas no escribe; también funciona en transacción READ ONLY real', async () => {
    const huella = async () => (await c.query(`SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY id)::text) AS h FROM cliente c`)).rows[0].h;
    const antes = await huella(); await lista(f.a.id); await servicio.listarRutas(); assert.equal(await huella(), antes);
    lectura = await pool.connect();
    try {
      await lectura.query('BEGIN READ ONLY');
      assert.equal((await lectura.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'on');
      await servicio.listarRutas(); await lista('sin-ruta');
    } finally { await lectura.query('ROLLBACK'); lectura.release(); lectura = null; }
  });
  test('HTTP requiere sesión y permiso propio, sin pedir Clientes ni permitirlo con otro módulo', async () => {
    const jwt = require('jsonwebtoken');
    const llamar = (path, token) => fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal((await llamar('/preventa/rutas')).status, 401);
    for (const modulo of ['preventa', 'clientes', 'reporte-clientes', null, 'admin', 'inactivo']) {
      const { rows: [u] } = await c.query(`INSERT INTO usuario(usuario,nombre,password_hash,es_admin,activo)
        VALUES($1,'ZZ Agenda','ZZ sin login',$2,$3) RETURNING id`, [`zz-ag-${randomUUID().slice(0,8)}`, modulo === 'admin', modulo !== 'inactivo']);
      if (['preventa','clientes','reporte-clientes'].includes(modulo)) await c.query('INSERT INTO usuario_modulo(usuario_id,modulo) VALUES($1,$2)', [u.id, modulo]);
      const token = jwt.sign({ sub: u.id, usuario: 'ZZ agenda' }, process.env.JWT_SECRET, { expiresIn: '5m' });
      for (const path of ['/preventa/rutas', `/Preventa/Agenda/?rutaId=${f.a.id}`]) {
        const r = await llamar(path, token), esperado = ['preventa','admin'].includes(modulo) ? 200 : modulo === 'inactivo' ? 401 : 403;
        assert.equal(r.status, esperado, modulo); if (esperado === 200) assert.equal(r.headers.get('cache-control'), 'no-store');
      }
      if (modulo === 'preventa') assert.equal((await llamar('/preventa/agenda?rutaId=0', token)).status, 400);
      if (modulo === 'clientes') assert.equal((await llamar('/preventa/agenda?rutaId=0', token)).status, 403);
    }
    const ajeno = jwt.sign({ sub: 1 }, 'ZZ secreto exclusivo del portal de clientes 20261013', { expiresIn: '5m' });
    assert.equal((await llamar('/preventa/rutas', ajeno)).status, 401);
  });
  test('facturar, corregir fecha y anular cambian próxima visita al releer', async () => {
    const nueva = await f.factura(f.atrasado, f.hoy);
    let cliente = (await lista(f.a.id)).find(c => c.id === f.atrasado.id);
    assert.equal(cliente.rotacion.proximaVisita, sumarDias(f.hoy, 7));
    await c.query('UPDATE factura SET fecha=$2 WHERE id=$1', [nueva.id, sumarDias(f.hoy,-1)]);
    assert.equal((await lista(f.a.id)).find(c => c.id === f.atrasado.id).rotacion.proximaVisita, sumarDias(f.hoy,6));
    await c.query("UPDATE factura SET estado='anulada' WHERE id=$1", [nueva.id]);
    assert.equal((await lista(f.a.id)).find(c => c.id === f.atrasado.id).rotacion.estado, 'atrasado');
    await f.factura(f.atrasado, sumarDias(f.hoy,1), 'borrador');
    assert.equal((await lista(f.a.id)).find(c => c.id === f.atrasado.id).rotacion.estado, 'atrasado');
  });
  test('nota completa retira la última atención; parcial y nota anulada la conservan', async () => {
    const nueva = await f.factura(f.atrasado, f.hoy);
    const { rows: [nota] } = await c.query(`INSERT INTO nota_credito(fecha,cliente_nombre,total)
      VALUES($1,'ZZ Agenda crédito',3000) RETURNING id`, [f.hoy]);
    await c.query('INSERT INTO nota_credito_factura(nota_credito_id,factura_id,monto) VALUES($1,$2,3000)',[nota.id,nueva.id]);
    assert.equal((await lista(f.a.id)).find(c => c.id === f.atrasado.id).rotacion.ultimaAtencion,f.hoy);
    await c.query('UPDATE nota_credito_factura SET monto=6000 WHERE nota_credito_id=$1',[nota.id]);
    assert.equal((await lista(f.a.id)).find(c => c.id === f.atrasado.id).rotacion.estado,'atrasado');
    await c.query("UPDATE nota_credito SET estado='anulada' WHERE id=$1",[nota.id]);
    assert.equal((await lista(f.a.id)).find(c => c.id === f.atrasado.id).rotacion.ultimaAtencion,f.hoy);
  });
  test('cambiar frecuencia o ruta actual mueve la agenda sin reescribir facturas', async () => {
    const antes = (await c.query('SELECT to_jsonb(f) AS f FROM factura f WHERE id=$1', [f.facturas[2].id])).rows[0].f;
    await c.query('UPDATE cliente SET rotacion_dias=1,ruta_id=$2 WHERE id=$1', [f.homonimo.id,f.b.id]);
    assert.ok(!(await lista(f.a.id)).some(c => c.id === f.homonimo.id));
    const cl = (await lista(f.b.id)).find(c => c.id === f.homonimo.id);
    assert.equal(cl.rotacion.estado,'atrasado'); assert.equal(cl.rotacion.dias,1);
    assert.deepEqual((await c.query('SELECT to_jsonb(f) AS f FROM factura f WHERE id=$1', [f.facturas[2].id])).rows[0].f, antes);
  });
});

describe('búsqueda y agrupación de la agenda (frontend puro)', () => {
  let agruparAgenda, contarAgenda;
  before(async () => ({ agruparAgenda, contarAgenda } = await import('../../frontend/src/utils/agendaPreventa.js')));
  const clientes = [
    { id: 1, nombre: 'José Taller', rotacion: { estado: 'atrasado' } },
    { id: 2, nombre: 'José Taller', rotacion: { estado: 'hoy' } },
    { id: 3, nombre: 'Nuevo', rotacion: { estado: 'sin_facturas' } },
    { id: 4, nombre: 'Otro', rotacion: { estado: 'sin_rotacion' } },
    { id: 5, nombre: 'Pronto', rotacion: { estado: 'proximo' } }
  ];
  test('sin filtro incluye las cinco secciones y cada identidad una vez', () => {
    const grupos = agruparAgenda(clientes);
    assert.deepEqual(grupos.map(g => g.estado), ['atrasado','hoy','proximo','sin_rotacion','sin_facturas']);
    assert.equal(new Set(grupos.flatMap(g => g.clientes.map(c => c.id))).size, 5);
  });
  test('buscar ignora tildes y mayúsculas, usa todas las palabras y conserva homónimos', () => {
    assert.deepEqual(agruparAgenda(clientes, { buscar: ' TALLER jose ' }).flatMap(g => g.clientes.map(c => c.id)), [1,2]);
    assert.equal(agruparAgenda(clientes,{ buscar:'José imposible' }).flatMap(g=>g.clientes).length,0);
  });
  test('filtrar por estado no cambia los datos ni el conteo de la ruta', () => {
    assert.deepEqual(agruparAgenda(clientes,{ estado:'sin_facturas' })[0].clientes.map(c=>c.id),[3]);
    assert.deepEqual(contarAgenda(clientes),{atrasado:1,hoy:1,proximo:1,sin_rotacion:1,sin_facturas:1});
    assert.equal(clientes.length,5);
  });
});
