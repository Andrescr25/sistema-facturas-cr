/**
 * «Cliente nuevo» desde Preventa y el incentivo por su primera compra (E2 de
 * la planilla, 2026-10-30; migración 073).
 *
 * El usuario: ₡2.000 «por cliente nuevo que consiga», y cuenta CON SU PRIMERA
 * COMPRA. Contra PostgreSQL local (con la 072 y la 073 aplicadas), en una
 * transacción que se deshace.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

describe('cliente nuevo y su primera compra — contra PostgreSQL local', () => {
  let db, nuevo, preventa, empleados, facturas, notas, liquidacion, admin, agente, otro, rutaA, rutaB, producto, hoy;
  const quien = () => ({ usuarioId: agente, rutasPermitidas: [rutaA] });
  const datos = (extra = {}) => ({ rutaId: rutaA, nombre: 'ZZ Pulpería Nueva', tipoIdentificacion: 'CF', identificacion: '2-0789-0456', ...extra });
  const vender = async (clienteId, usuario = otro) => facturas.crearFactura({
    clienteId, clienteNombre: (await db.query('SELECT nombre FROM cliente WHERE id = $1', [clienteId])).rows[0].nombre, items: [{ productoId: producto, price: 1000, quantity: 1, discount: 0, descuentoBase: 0 }]
  }, usuario);
  const respuesta = () => { const r = {}; r.set = () => r; r.status = (c) => { r.estado = c; return r; }; r.json = (b) => { r.cuerpo = b; return r; }; return r; };

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    db = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query("SET TIME ZONE 'America/Costa_Rica'");
    await db.query('BEGIN');
    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    for (const r of Object.keys(require.cache)) if (r.includes(`${path.sep}src${path.sep}`)) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'clientenuevo') };
    nuevo = require('../src/modules/preventa/clienteNuevo');
    preventa = require('../src/modules/preventa/preventa.controller');
    empleados = require('../src/modules/empleados/empleados.service');
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    notas = require('../src/modules/facturacion/notaCredito.service');
    liquidacion = require('../src/modules/empleados/liquidacion');
    hoy = require('../src/utils/fechaCR').hoyEnCostaRica();

    admin = (await db.query('SELECT id FROM usuario WHERE es_admin ORDER BY id LIMIT 1')).rows[0].id;
    const usuario = async (u) => (await db.query(
      `INSERT INTO usuario (usuario, nombre, password_hash, activo, es_admin) VALUES ($1, $1, 'zz', TRUE, FALSE) RETURNING id`, [u])).rows[0].id;
    agente = await usuario('zz-agente-nuevo');
    otro = await usuario('zz-cajero-nuevo');
    const ruta = async (n) => (await db.query(`INSERT INTO ruta_cliente (nombre, activo) VALUES ($1, TRUE) RETURNING id`, [n])).rows[0].id;
    rutaA = await ruta('ZZ Ruta nuevos A'); rutaB = await ruta('ZZ Ruta nuevos B');
    await db.query('INSERT INTO usuario_ruta (usuario_id, ruta_id) VALUES ($1, $2)', [agente, rutaA]);
    await db.query(`INSERT INTO cliente (nombre, activo, ruta_id, orden_ruta, identificacion, tipo_identificacion) VALUES ('ZZ Cliente viejo', TRUE, $1, 1, '206540321', 'CF')`, [rutaA]);
    const impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa = 13 LIMIT 1')).rows[0];
    producto = (await db.query(`INSERT INTO producto (nombre, referencia, precio_sin_iva, costo_con_iva, impuesto_id) VALUES ('ZZ-NUEVOS', 'ZZ-NUEVOS', 1000, 700, $1) RETURNING id`, [impuesto.id])).rows[0].id;
    await empleados.crear({ usuarioId: agente, pagoHora: 1000 }, admin);
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('queda en su ruta, al final, con la ubicación y la rotación, y a su nombre', async () => {
    const c = await nuevo.crearClienteNuevo(datos({ celular: '8888-1234', rotacionDias: '22', ubicacion: { latitud: 10.0569, longitud: -84.4351 } }), quien());
    assert.equal(c.ruta_id, rutaA);
    assert.equal(c.orden_ruta, 2, 'detrás del que ya estaba');
    assert.equal(c.identificacion, '207890456');
    assert.equal(c.rotacion_dias, 22);
    assert.equal(c.ubicacion_maps, 'https://www.google.com/maps?q=10.056900,-84.435100');
    assert.equal(c.captado_por, agente);
    assert.ok(c.captado_en);
    const { rows: [b] } = await db.query(`SELECT usuario_id, despues FROM bitacora_cambio WHERE entidad = 'cliente' AND entidad_id = $1 AND accion = 'crear'`, [String(c.id)]);
    assert.equal(b.usuario_id, agente);
    assert.equal(b.despues.captado_por, agente);
  });

  test('una cédula que ya tiene ficha se rechaza diciendo de quién es', async () => {
    await assert.rejects(nuevo.crearClienteNuevo(datos({ identificacion: '206540321' }), quien()),
      (e) => e.status === 409 && /ZZ Cliente viejo \(ruta ZZ Ruta nuevos A\): no es un cliente nuevo/.test(e.message));
    await assert.rejects(nuevo.crearClienteNuevo(datos({ nombre: 'ZZ Otra vez', identificacion: '207890456' }), quien()), (e) => e.status === 409);
  });

  test('sin cédula, con la genérica o con una que no calza, no', async () => {
    const mal = (extra, patron) => assert.rejects(nuevo.crearClienteNuevo(datos(extra), quien()), (e) => e.status === 400 && patron.test(e.message), JSON.stringify(extra));
    await mal({ identificacion: '' }, /Escribí la cédula/);
    await mal({ identificacion: '100000000' }, /genérica/);
    await mal({ identificacion: '111111111' }, /genérica/);
    await mal({ identificacion: '20789045' }, /9 dígitos/);
    await mal({ tipoIdentificacion: 'NO_CONTRIBUYENTE' }, /tipo de identificación/);
    await mal({ rotacionDias: 0, identificacion: '208880999' }, /rotación/);
    await mal({ ubicacion: { latitud: 40.4, longitud: -3.7 }, identificacion: '208880999' }, /fuera de Costa Rica/);
    await mal({ nombre: '', identificacion: '208880999' }, /Nombre/);
  });

  test('solo en sus rutas: en otra, 403, también por el controlador', async () => {
    await assert.rejects(nuevo.crearClienteNuevo(datos({ rutaId: rutaB, identificacion: '208880999' }), quien()), (e) => e.status === 403);
    const res = respuesta();
    await preventa.clienteNuevo({ usuario: { id: agente }, permisos: { esAdmin: false, modulos: new Set(['preventa']) },
      body: datos({ rutaId: rutaB, identificacion: '208880999' }) }, res);
    assert.equal(res.estado, 403);
    const { rows } = await db.query(`SELECT 1 FROM cliente WHERE identificacion = '208880999'`);
    assert.equal(rows.length, 0);
  });

  test('sin compra espera; con su primera compra cuenta en esa quincena, la haga quien la haga', async () => {
    const q = liquidacion.quincenaDe(hoy).clave;
    let { quincena } = await empleados.ingresosDe(agente, q);
    assert.deepEqual(quincena.clientesNuevos.esperando.map(c => c.nombre), ['ZZ Pulpería Nueva']);
    assert.equal(quincena.clientesNuevos.monto, 0);
    const { rows: [c] } = await db.query(`SELECT id FROM cliente WHERE identificacion = '207890456'`);
    const f = await vender(c.id, otro);
    ({ quincena } = await empleados.ingresosDe(agente, q));
    assert.deepEqual(quincena.clientesNuevos.cuentan.map(x => [x.nombre, x.primeraCompra]), [['ZZ Pulpería Nueva', hoy]]);
    assert.equal(quincena.clientesNuevos.monto, 2000);
    await vender(c.id, agente);
    ({ quincena } = await empleados.ingresosDe(agente, q));
    assert.equal(quincena.clientesNuevos.cuentan.length, 1, 'la segunda compra no vuelve a contar');

    // Si la primera se acredita entera deja de ser compra: manda la siguiente.
    await notas.crearNotaCredito({ facturaId: f.id, motivo: 'devolucion', motivoTexto: 'ZZ devolvió todo' }, admin);
    ({ quincena } = await empleados.ingresosDe(agente, q));
    assert.equal(quincena.clientesNuevos.cuentan.length, 1);
  });

  test('cuenta en la quincena de su primera compra, no en otra', async () => {
    const q = liquidacion.quincenaDe(hoy);
    await db.query(`UPDATE cliente SET captado_en = captado_en - interval '40 days' WHERE captado_por = $1`, [agente]);
    await db.query(`UPDATE factura SET fecha = fecha - 40 WHERE cliente_id IN (SELECT id FROM cliente WHERE captado_por = $1)`, [agente]);
    const { quincena } = await empleados.ingresosDe(agente, q.clave);
    assert.equal(quincena.clientesNuevos.cuentan.length, 0);
    assert.equal(quincena.clientesNuevos.esperando.length, 0, 'ya compró: no espera');
  });

  test('uno que ya compraba antes de que lo registrara no es nuevo', async () => {
    const { rows: [viejo] } = await db.query(`SELECT id FROM cliente WHERE identificacion = '206540321'`);
    await vender(viejo.id, otro);
    await db.query(`UPDATE factura SET fecha = fecha - 3 WHERE cliente_id = $1`, [viejo.id]);
    await db.query(`UPDATE cliente SET captado_por = $1, captado_en = now() WHERE id = $2`, [agente, viejo.id]);
    const { quincena } = await empleados.ingresosDe(agente, liquidacion.quincenaDe(hoy).clave);
    assert.ok(!quincena.clientesNuevos.cuentan.some(c => c.id === viejo.id));
    assert.ok(!quincena.clientesNuevos.esperando.some(c => c.id === viejo.id));
  });
});

describe('la pantalla', () => {
  const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
  const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));

  test('«Cliente nuevo» sale con una ruta elegida y fuera de una visita', () => {
    const p = leer('pages', 'Preventa.jsx');
    assert.match(p, /\{ruta && !agenda\.seleccionId && <Boton icono=\{UserPlus\} onClick=\{\(\) => setNuevo\(true\)\}>Cliente nuevo<\/Boton>\}/);
    assert.match(leer('hooks', 'useClienteNuevo.js'), /api\.post\('\/preventa\/clientes', datos\)/);
  });

  test('la ficha de Clientes y «Cliente nuevo» revisan la cédula con la misma regla', () => {
    assert.match(leer('components', 'clientes', 'ModalCliente.jsx'), /from '\.\.\/\.\.\/utils\/identificacionCliente'/);
    const m = leer('components', 'preventa', 'ModalClienteNuevo.jsx');
    assert.match(m, /from '\.\.\/\.\.\/utils\/identificacionCliente'/);
    assert.match(m, /<ElegirPunto punto=\{punto\} onCambiar=\{setPunto\}/);
    assert.match(m, /<ElegirRotacion dias=\{rotacion\} onCambiar=\{setRotacion\} \/>/);
    assert.match(leer('components', 'preventa', 'ModalRotacionCliente.jsx'), /<ElegirRotacion dias=\{dias\} onCambiar=\{setDias\} \/>/);
  });

  test('los clientes nuevos se ven igual en «Mis ingresos» y en Empleados', () => {
    assert.match(leer('pages', 'MisIngresos.jsx'), /<ClientesNuevos clientes=\{q\.clientesNuevos\} incentivo=\{tarifas\.incentivoClienteNuevo\} \/>/);
    assert.match(leer('components', 'empleados', 'DetalleEmpleado.jsx'), /<ClientesNuevos clientes=\{q\.clientesNuevos\} incentivo=\{ficha\.tarifas\.incentivoClienteNuevo\} \/>/);
  });
});
