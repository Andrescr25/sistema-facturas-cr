/**
 * Seguimiento del agente (F5, 2026-10-29): qué hizo un día —facturas y
 * «próximas visitas» en orden, con su GPS— y, si es hoy, qué le falta.
 *
 * El usuario: «quiero tenerlo completamente monitoreado». Solo lecturas de lo
 * que ya se guarda. Contra PostgreSQL local, en una transacción que se deshace.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

const BACK = path.join(__dirname, '..');
const FRONT = path.join(BACK, '..', 'frontend', 'src');
const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));
const GPS = { estado: 'tomada', latitud: 10.0571, longitud: -84.4349, precision: 15 };

describe('dónde estaba y qué tan lejos del cliente', () => {
  const util = () => import(path.join(FRONT, 'utils', 'seguimientoAgente.js'));

  test('la distancia entre dos puntos, en metros', async () => {
    const { distanciaMetros } = await util();
    assert.equal(distanciaMetros({ lat: 10.0569, lng: -84.4351 }, { lat: 10.0569, lng: -84.4351 }), 0);
    const d = distanciaMetros({ lat: 10.0571, lng: -84.4349 }, { lat: 10.0569, lng: -84.4351 });
    assert.ok(d >= 28 && d <= 34, `unos 31 m, dio ${d}`);
    const lejos = distanciaMetros({ lat: 10.0569, lng: -84.4351 }, { lat: 9.9333, lng: -84.0833 });
    assert.ok(lejos > 40000 && lejos < 41000, `Palmares–San José, dio ${lejos}`);
  });

  test('cerca del cliente es verde; lejos (más de 300 m), alerta; sin permiso o sin GPS se dice', async () => {
    const { lecturaDelGps } = await util();
    const ficha = 'https://www.google.com/maps?q=10.0569,-84.4351';
    const cerca = lecturaDelGps(GPS, ficha);
    assert.equal(cerca.tono, 'exito');
    assert.match(cerca.texto, /^A \d+ m del cliente$/);
    assert.equal(cerca.mapa, 'https://www.google.com/maps?q=10.0571,-84.4349');
    const lejos = lecturaDelGps({ ...GPS, latitud: 9.9333, longitud: -84.0833 }, ficha);
    assert.equal(lejos.tono, 'alerta');
    assert.match(lejos.texto, /km del cliente/);
    assert.equal(lecturaDelGps({ estado: 'negada' }, ficha).texto, 'No dio permiso de ubicación');
    assert.equal(lecturaDelGps({ estado: 'no_disponible', latitud: null }, ficha).tono, 'alerta');
    assert.match(lecturaDelGps(GPS, 'https://maps.app.goo.gl/x').texto, /no tiene coordenadas/);
    assert.match(lecturaDelGps(null, ficha).texto, /desde Facturación/);
  });
});

describe('el día del agente — contra PostgreSQL local', () => {
  let db, seguimiento, visitas, facturas, admin, agente, ruta, atrasado, hoyLeToca, proximo, sinVisitar, producto;
  const fecha = () => require('../src/utils/fechaCR');
  const enDias = (n) => fecha().sumarDias(fecha().hoyEnCostaRica(), n);
  const pedido = (clienteId, nombre, extra = {}) => ({ clienteId, clienteNombre: nombre, items: [{ productoId: producto.id, price: 100, quantity: 2, discount: 0, descuentoBase: 0 }], ...extra });

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    db = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    // Como la conexión del sistema (config/database.js): hora de Costa Rica.
    await db.query("SET TIME ZONE 'America/Costa_Rica'");
    await db.query('BEGIN');
    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    for (const r of Object.keys(require.cache)) if (r.includes(`${path.sep}src${path.sep}`)) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'seguimiento') };
    seguimiento = require('../src/modules/seguimiento/seguimiento.service');
    visitas = require('../src/modules/preventa/visitas');
    facturas = require('../src/modules/facturacion/facturaPropia.service');

    admin = (await db.query('SELECT id FROM usuario WHERE es_admin ORDER BY id LIMIT 1')).rows[0].id;
    agente = (await db.query(`INSERT INTO usuario (usuario, nombre, password_hash, activo, es_admin) VALUES ('zz-agente-f5', 'ZZ Agente F5', 'zz', TRUE, FALSE) RETURNING id`)).rows[0].id;
    ruta = (await db.query(`INSERT INTO ruta_cliente (nombre, activo) VALUES ('ZZ Ruta F5', TRUE) RETURNING id`)).rows[0].id;
    await db.query('INSERT INTO usuario_ruta (usuario_id, ruta_id) VALUES ($1, $2)', [agente, ruta]);
    let orden = 0;
    const cliente = async (nombre, rotacion) => (await db.query(
      `INSERT INTO cliente (nombre, activo, ruta_id, orden_ruta, rotacion_dias, ubicacion_maps) VALUES ($1, TRUE, $2, $3, $4, 'https://www.google.com/maps?q=10.0569,-84.4351') RETURNING id`,
      [nombre, ruta, ++orden, rotacion])).rows[0].id;
    atrasado = await cliente('ZZ F5 Atrasado', 15);
    hoyLeToca = await cliente('ZZ F5 Le toca hoy', 7);
    proximo = await cliente('ZZ F5 Próximo', 15);
    sinVisitar = await cliente('ZZ F5 Sin visitar', 15);
    const impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa = 13 LIMIT 1')).rows[0];
    producto = (await db.query(`INSERT INTO producto (nombre, referencia, precio_sin_iva, costo_con_iva, impuesto_id) VALUES ('ZZ-F5', 'ZZ-F5', 100, 79.1, $1) RETURNING id`, [impuesto.id])).rows[0];
    // Su historia (hecha por el admin): atrasado y sinVisitar hace 20 días, hoyLeToca hace 7, próximo hace 3.
    for (const [id, nombre, dias] of [[atrasado, 'ZZ F5 Atrasado', 20], [sinVisitar, 'ZZ F5 Sin visitar', 20], [hoyLeToca, 'ZZ F5 Le toca hoy', 7], [proximo, 'ZZ F5 Próximo', 3]]) {
      await facturas.crearFactura(pedido(id, nombre, { fecha: enDias(-dias) }), admin);
    }
    // Lo que hizo el agente HOY: le facturó al atrasado desde la visita, al de hoy no le vendió, y al próximo le facturó por fuera de Preventa.
    const f1 = await facturas.crearFactura(pedido(atrasado, 'ZZ F5 Atrasado', { visita: { desde: 'preventa', ...GPS } }), agente);
    const v1 = await visitas.registrarProximaVisita({ clienteId: hoyLeToca, motivo: 'cerrado', proximaFecha: enDias(2), nota: 'ZZ volver el lunes', ubicacion: { estado: 'negada' } },
      { usuarioId: agente, rutasPermitidas: [ruta] });
    const f2 = await facturas.crearFactura(pedido(proximo, 'ZZ F5 Próximo'), agente);
    // Dentro de una transacción `now()` no avanza: se les da la hora de cada acción
    // (la factura guarda hora de Costa Rica sin zona; la visita, con zona).
    const HOY = "(now() AT TIME ZONE 'America/Costa_Rica')::date";
    await db.query(`UPDATE factura SET creado_en = ${HOY} + time '08:05' WHERE id = $1`, [f1.id]);
    await db.query(`UPDATE visita SET creado_en = (${HOY} + time '09:10') AT TIME ZONE 'America/Costa_Rica' WHERE id = $1`, [v1.id]);
    await db.query(`UPDATE factura SET creado_en = ${HOY} + time '10:20' WHERE id = $1`, [f2.id]);
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('el recorrido de hoy: las dos facturas y la próxima visita, en orden de hora', async () => {
    const d = await seguimiento.dia({ usuarioId: agente });
    assert.deepEqual(d.recorrido.map(p => `${p.tipo}:${p.cliente.nombre}`),
      ['venta:ZZ F5 Atrasado', 'proxima_visita:ZZ F5 Le toca hoy', 'venta:ZZ F5 Próximo']);
    assert.deepEqual(d.recorrido.map(p => p.hora), ['08:05', '09:10', '10:20'], 'las horas, en Costa Rica');
  });

  test('cada paso trae lo que hace falta para leerlo: GPS, motivo, factura y si salió de una visita', async () => {
    const [venta, noCompro, porFuera] = (await seguimiento.dia({ usuarioId: agente })).recorrido;
    assert.equal(venta.desdeVisita, true);
    assert.deepEqual(venta.gps, { estado: 'tomada', latitud: 10.0571, longitud: -84.4349, precision: 15 });
    assert.equal(venta.factura.total, 226);
    assert.equal(venta.cliente.ubicacionMaps, 'https://www.google.com/maps?q=10.0569,-84.4351');
    assert.equal(noCompro.motivo, 'cerrado');
    assert.equal(noCompro.nota, 'ZZ volver el lunes');
    assert.equal(noCompro.gps.estado, 'negada');
    assert.equal(porFuera.desdeVisita, false);
    assert.equal(porFuera.gps, null);
  });

  test('el resumen cuenta bien, y le falta solo el cliente que no visitó', async () => {
    const d = await seguimiento.dia({ usuarioId: agente });
    assert.deepEqual(d.resumen, { clientesVisitados: 3, ventas: 2, monto: 452, sinVenta: 1, sinGps: 1, fueraDeVisita: 1, pendientes: 1 });
    assert.deepEqual(d.pendientes.map(c => c.nombre), ['ZZ F5 Sin visitar']);
    assert.equal(d.pendientes[0].estado, 'atrasado');
  });

  test('una factura anulada sale en el recorrido, marcada, pero no suma', async () => {
    const f = await facturas.crearFactura(pedido(proximo, 'ZZ F5 Próximo'), agente);
    await db.query(`UPDATE factura SET estado = 'anulada', creado_en = (now() AT TIME ZONE 'America/Costa_Rica')::date + time '11:00' WHERE id = $1`, [f.id]);
    const d = await seguimiento.dia({ usuarioId: agente });
    assert.ok(d.recorrido.some(p => p.factura?.id === f.id && p.factura.anulada));
    assert.equal(d.resumen.ventas, 2);
    assert.equal(d.resumen.monto, 452);
  });

  test('otro día: lo de ese día, sin «le falta» (solo se sabe hoy)', async () => {
    const ayer = await seguimiento.dia({ usuarioId: agente, fecha: enDias(-1) });
    assert.deepEqual(ayer.recorrido, []);
    assert.equal(ayer.pendientes, null);
    assert.equal(ayer.resumen.pendientes, null);
  });

  test('un día futuro o un usuario que no existe se rechazan', async () => {
    await assert.rejects(seguimiento.dia({ usuarioId: agente, fecha: enDias(1) }), (e) => e.status === 400);
    await assert.rejects(seguimiento.dia({ usuarioId: agente, fecha: 'ayer' }), (e) => e.status === 400);
    await assert.rejects(seguimiento.dia({ usuarioId: 999999999 }), (e) => e.status === 404);
  });

  test('la lista de agentes trae a quien atiende rutas, con sus rutas', async () => {
    const a = (await seguimiento.agentes()).find(x => x.id === agente);
    assert.deepEqual(a.rutas.map(r => r.nombre), ['ZZ Ruta F5']);
  });
});

describe('permiso y pantalla', () => {
  test('/seguimiento es de su propio módulo, «Seguimiento de agentes»', () => {
    const { clasificarRuta, MODULOS } = require('../src/modules/usuarios/modulos');
    assert.equal(clasificarRuta('/seguimiento/dia').clave, 'seguimiento-agentes');
    assert.ok(MODULOS.some(m => m.clave === 'seguimiento-agentes' && m.ruta === '/seguimiento'));
  });

  test('está en el menú, en la app y en el espejo de módulos', () => {
    assert.match(leer('components', 'Layout.jsx'), /\{ name: 'Seguimiento de agentes', href: '\/seguimiento', icon: Footprints \}/);
    assert.match(leer('App.jsx'), /<Route path="\/seguimiento" element=\{<SeguimientoAgentes \/>\} \/>/);
    assert.match(leer('utils', 'modulos.js'), /clave: 'seguimiento-agentes'/);
  });

  test('la pantalla muestra el recorrido con la lectura del GPS y lo que le falta', () => {
    assert.match(leer('components', 'seguimiento', 'RecorridoAgente.jsx'), /const gps = lecturaDelGps\(p\.gps, p\.cliente\.ubicacionMaps\)/);
    assert.match(leer('pages', 'SeguimientoAgentes.jsx'), /<PendientesAgente pendientes=\{s\.dia\.pendientes\} \/>/);
  });
});
