const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { preparar } = require('./dobles/reporteClientesPorRuta');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
const activo = process.env.PROBAR_BASE_LOCAL === '1';

describe('Reporte clientes por ficha actual — PostgreSQL local y ROLLBACK', { skip: !activo }, () => {
  let c, pool, f, servicio, excel, soloLectura = false;
  const filas = r => XLSX.utils.sheet_to_json(XLSX.read(r.buffer, { type: 'buffer' }).Sheets.Faltantes);
  const reporte = async rutaId => {
    const r = await servicio.getMissingItemsByClient({ rutaId });
    assert.equal(r.success, true, r.error); return r.data;
  };
  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
    const { Pool } = require('pg'); pool = new Pool({ connectionString: process.env.DATABASE_URL });
    c = await pool.connect(); await c.query('BEGIN');
    f = await preparar(c);
    const db = baseEnTransaccion(c, 'reporte_ruta');
    const ejecutar = db.query;
    db.query = (sql, p) => { if (soloLectura) assert.match(sql, /^\s*(SELECT|WITH)\b/i, 'la consulta escribió'); return ejecutar(sql, p); };
    const ruta = require.resolve('../config/database');
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: db };
    servicio = require('../src/modules/reports/reporteClientes.service');
    excel = require('../src/modules/reports/report.excel');
  });
  after(async () => { if (c) { await c.query('ROLLBACK'); c.release(); } await pool?.end(); });

  test('ruta sin ninguna semana aparece con metadatos mínimos y sus facturas sin ciclo', async () => {
    soloLectura = true;
    const rutas = await servicio.listarRutas();
    assert.ok(rutas.some(r => r.id === f.a.id));
    assert.deepEqual(Object.keys(rutas[0]).sort(), ['activo', 'id', 'nombre']);
    const clientes = await reporte(String(f.a.id));
    assert.equal(clientes.length, 5);
    assert.ok(clientes.every(c => c.ruta.id === f.a.id));
    assert.ok(clientes.flatMap(c => c.facturas_con_faltantes).every(d => d.ciclo === undefined));
  });
  test('dos fichas homónimas tienen identidades, frecuencias y facturas separadas', async () => {
    const clientes = (await reporte(f.a.id)).filter(c => c.nombre === f.homonimo.nombre);
    assert.equal(clientes.length, 2);
    assert.notEqual(clientes[0].clave, clientes[1].clave);
    const primera = clientes.find(c => c.id === f.homonimo.id), segunda = clientes.find(c => c.id === f.gemelo.id);
    assert.equal(primera.rotacion.proximaVisita, '2026-11-01');
    assert.equal(segunda.rotacion.proximaVisita, '2026-10-17');
    assert.deepEqual(primera.facturas_con_faltantes.map(d => d.factura_id), [f.facturas[0].id]);
    assert.deepEqual(segunda.facturas_con_faltantes.map(d => d.factura_id), [f.facturas[1].id]);
  });
  test('orden por visita: atrasado, hoy, próximos y sin fecha; incluye ventas sin faltantes al calcular', async () => {
    const clientes = await reporte(f.a.id);
    assert.deepEqual(clientes.map(c => c.rotacion.proximaVisita).filter(Boolean), clientes.map(c => c.rotacion.proximaVisita).filter(Boolean).sort());
    assert.equal(clientes.find(c => c.id === f.ahora.id).rotacion.estado, 'hoy');
    assert.equal(clientes[0].id, f.atrasado.id);
    assert.equal(clientes[0].rotacion.faltan, -7);

  });
  test('sin ruta incluye la ficha sin asignación y el documento sin ficha, sin mezclar por nombre', async () => {
    const clientes = await reporte('sin-ruta');
    const propios = clientes.filter(c => c.id === f.sinRuta.id || c.clave === `factura-${f.facturas[6].id}`);
    assert.equal(propios.length, 2);
    assert.ok(propios.every(c => c.ruta.id === null));
    const historico = propios.find(c => !c.id);
    assert.equal(historico.rotacion.estado, 'sin_rotacion');
    assert.equal(historico.nombre, f.homonimo.nombre);
  });
  test('cambiar ruta mueve el faltante operativo sin tocar factura, ajustes o cola', async () => {
    const antes = (await c.query('SELECT to_jsonb(f) AS f FROM factura f WHERE id=$1', [f.facturas[0].id])).rows[0].f;
    await require('../src/modules/clientes/clientes.service').editarCliente(f.homonimo.id, { ruta_id: f.b.id });
    assert.ok(!(await reporte(f.a.id)).some(c => c.id === f.homonimo.id));
    assert.equal((await reporte(f.b.id))[0].id, f.homonimo.id);
    assert.deepEqual((await c.query('SELECT to_jsonb(f) AS f FROM factura f WHERE id=$1', [f.facturas[0].id])).rows[0].f, antes);
  });
  test('Excel del detalle usa ID y ruta actuales; no descarga la ficha homónima', async () => {
    const datos = filas(await excel.exportarClientes({ clienteId: String(f.homonimo.id), rutaId: f.b.id }));
    assert.equal(datos.length, 1);
    assert.equal(datos[0]['ID cliente'], f.homonimo.id);
    assert.equal(datos[0]['ID factura'], f.facturas[0].id);
    assert.equal(datos[0]['Ruta del cliente'], f.b.nombre);
    assert.equal(datos[0]['Rotación (días)'], 22);
    const dia = XLSX.SSF.parse_date_code(datos[0]['Próxima visita']);
    assert.deepEqual([dia.y, dia.m, dia.d], [2026, 11, 1]);
    assert.equal(filas(await excel.exportarClientes({ clienteId: f.homonimo.id, rutaId: f.a.id })).length, 0);
    assert.equal(filas(await excel.exportarClientes({ facturaId: f.facturas[6].id }))[0]['ID factura'], f.facturas[6].id);
  });
  test('consultas y Excel no asignan proveedor ni cambian faltantes', async () => {
    const huella = async () => (await c.query('SELECT md5(jsonb_agg(to_jsonb(f) ORDER BY id)::text) AS h FROM faltantes f')).rows[0].h;
    const antes = await huella();
    await reporte(''); await servicio.listarRutas(); await excel.exportarClientes({ rutaId: f.a.id });
    assert.equal(await huella(), antes);
    assert.equal((await c.query('SELECT proveedor_asignado FROM faltantes WHERE id=$1', [f.facturas[0].faltante])).rows[0].proveedor_asignado, null);
  });
  test('ruta mal formada o semana antigua rechazan sin devolver el reporte global', async () => {
    for (const rutaId of ['1 OR 1=1', [], {}, true, '0', '1.2', '2147483648', 'sin-ciclo']) {
      const r = await servicio.getMissingItemsByClient({ rutaId });
      assert.equal(r.success, false); assert.equal(r.status, 400);
      await assert.rejects(excel.exportarClientes({ rutaId }), e => e.status === 400);
    }
    const r = await servicio.getMissingItemsByClient({ cicloId: '1' });
    assert.equal(r.status, 400);
    for (const nombre of ['clienteId', 'facturaId']) await assert.rejects(excel.exportarClientes({ [nombre]: true }), e => e.status === 400);
  });
});

test('la selección del frontend distingue homónimos y documentos sin ficha', async () => {
  const { getClienteKey } = await import('../../frontend/src/utils/reporteClientesUtils.js');
  assert.notEqual(getClienteKey({ id: 1, nombre: 'ZZ' }), getClienteKey({ id: 2, nombre: 'ZZ' }));
  assert.equal(getClienteKey({ clave: 'factura-77', nombre: 'ZZ' }), 'factura-77');
});
