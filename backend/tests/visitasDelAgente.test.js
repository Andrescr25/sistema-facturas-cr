/**
 * Las visitas del agente (F4, 2026-10-29): «próxima visita» con motivo, fecha y
 * GPS, y la visita con venta que se anota junto con la factura.
 *
 * El usuario: «si el cliente pasa a una próxima visita, el agente de ventas
 * marque que será para próxima visita»; por defecto hoy + su rotación, «que el
 * agente planifique bien cómo va a visitar y esto sea más personalizable»; GPS
 * en cada acción. Contra PostgreSQL local (con la 070 aplicada), en una
 * transacción que se deshace.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

const BACK = path.join(__dirname, '..');
const FRONT = path.join(BACK, '..', 'frontend', 'src');
const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));
const GPS = { estado: 'tomada', latitud: 10.0569, longitud: -84.4351, precision: 12 };

describe('las reglas, sin base', () => {
  const v = require('../src/modules/preventa/visitas');

  test('el GPS que no sirve no tumba nada: queda «no disponible»; «negada» se conserva', () => {
    assert.deepEqual(v.ubicacionLimpia(GPS), { estado: 'tomada', latitud: 10.0569, longitud: -84.4351, precision: 12 });
    assert.deepEqual(v.ubicacionLimpia({ estado: 'tomada' }), { estado: 'no_disponible', latitud: null, longitud: null, precision: null });
    assert.deepEqual(v.ubicacionLimpia({ estado: 'tomada', latitud: 200, longitud: 1 }).estado, 'no_disponible');
    assert.equal(v.ubicacionLimpia({ estado: 'negada', latitud: 1, longitud: 1 }).estado, 'negada');
    assert.equal(v.ubicacionLimpia(undefined).estado, 'no_disponible');
    assert.equal(v.ubicacionLimpia({ estado: 'inventado' }).estado, 'no_disponible');
  });

  test('por defecto se propone hoy + su rotación; sin rotación, en 7 días', () => {
    assert.equal(v.fechaSugerida(15, '2026-10-29'), '2026-11-13');
    assert.equal(v.fechaSugerida(null, '2026-10-29'), '2026-11-05');
    assert.equal(v.fechaSugerida(0, '2026-10-29'), '2026-11-05');
  });

  test('la próxima visita marcada manda sobre la rotación y dice por qué; sin ella, nada cambia', () => {
    const rotacion = { dias: 15, ultimaAtencion: '2026-10-04', proximaVisita: '2026-10-19', faltan: -10, estado: 'atrasado' };
    const r = v.conReprogramacion(rotacion, { proximaFecha: '2026-11-02', motivo: 'cerrado', nota: 'vuelve el lunes', fecha: '2026-10-29', usuario: 'ZZ Agente' }, '2026-10-29');
    assert.equal(r.proximaVisita, '2026-11-02');
    assert.equal(r.faltan, 4);
    assert.equal(r.estado, 'proximo');
    assert.equal(r.dias, 15, 'la frecuencia no se toca');
    assert.equal(r.ultimaAtencion, '2026-10-04', 'la última atención tampoco');
    assert.deepEqual(r.reprogramada, { motivo: 'cerrado', nota: 'vuelve el lunes', el: '2026-10-29', por: 'ZZ Agente' });
    assert.equal(v.conReprogramacion(rotacion, null, '2026-10-29'), rotacion);
    assert.equal(v.conReprogramacion({ dias: null, estado: 'sin_rotacion' }, { proximaFecha: '2026-10-29', motivo: 'otro' }, '2026-10-29').estado, 'hoy',
      'un cliente sin rotación también queda agendado');
  });
});

describe('visitas — contra PostgreSQL local', () => {
  let db, visitas, preventa, facturas, admin, agente, rutaA, rutaB, cliente, otro, producto;
  const hoyCR = () => require('../src/utils/fechaCR').hoyEnCostaRica();
  const enDias = (n) => require('../src/utils/fechaCR').sumarDias(hoyCR(), n);
  const quien = { rutasPermitidas: null };
  const agenda = async () => (await require('../src/modules/preventa/preventa.service').agenda({ rutaId: String(rutaA) })).clientes.find(c => c.id === cliente);
  const pedido = (extra = {}) => ({ clienteId: cliente, clienteNombre: 'ZZ Cliente visitas', items: [{ productoId: producto.id, price: 100, quantity: 1, discount: 0, descuentoBase: 0 }], ...extra });

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    db = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
    await db.connect(); await db.query('BEGIN');
    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    for (const r of Object.keys(require.cache)) if (r.includes(`${path.sep}src${path.sep}`)) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'visitas') };
    visitas = require('../src/modules/preventa/visitas');
    preventa = require('../src/modules/preventa/preventa.controller');
    facturas = require('../src/modules/facturacion/facturaPropia.service');

    admin = (await db.query('SELECT id FROM usuario WHERE es_admin ORDER BY id LIMIT 1')).rows[0].id;
    agente = (await db.query(`INSERT INTO usuario (usuario, nombre, password_hash, activo, es_admin) VALUES ('zz-agente-f4', 'ZZ Agente F4', 'zz', TRUE, FALSE) RETURNING id`)).rows[0].id;
    const ruta = async (n) => (await db.query(`INSERT INTO ruta_cliente (nombre, activo) VALUES ($1, TRUE) RETURNING id`, [n])).rows[0].id;
    rutaA = await ruta('ZZ Ruta F4 A'); rutaB = await ruta('ZZ Ruta F4 B');
    const nuevoCliente = async (nombre, rutaId) => (await db.query(
      `INSERT INTO cliente (nombre, activo, ruta_id, orden_ruta, rotacion_dias) VALUES ($1, TRUE, $2, 1, 15) RETURNING id`, [nombre, rutaId])).rows[0].id;
    cliente = await nuevoCliente('ZZ Cliente visitas', rutaA);
    otro = await nuevoCliente('ZZ Cliente de otra ruta', rutaB);
    const impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa = 13 LIMIT 1')).rows[0];
    producto = (await db.query(`INSERT INTO producto (nombre, referencia, precio_sin_iva, costo_con_iva, impuesto_id) VALUES ('ZZ-VISITA', 'ZZ-VISITA', 100, 79.1, $1) RETURNING id`, [impuesto.id])).rows[0];
    // Su última factura, hace 20 días (día de Costa Rica), cada 15: le tocaba hace 5 → atrasado.
    await facturas.crearFactura(pedido({ fecha: enDias(-20) }), admin);
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('antes de marcar nada: atrasado, y la fecha que se propone es hoy + 15', async () => {
    const c = await agenda();
    assert.equal(c.rotacion.estado, 'atrasado');
    assert.equal(c.proximaSugerida, enDias(15));
  });

  test('«próxima visita» se guarda con motivo, fecha, ruta, quién y el GPS del momento', async () => {
    const v = await visitas.registrarProximaVisita({ clienteId: cliente, motivo: 'sin_encargado', proximaFecha: enDias(3), nota: ' vuelve el viernes ', ubicacion: GPS },
      { usuarioId: agente, rutasPermitidas: [rutaA] });
    assert.equal(v.resultado, 'proxima_visita');
    assert.equal(v.motivo, 'sin_encargado');
    assert.equal(v.nota, 'vuelve el viernes');
    assert.equal(v.ruta_id, rutaA);
    assert.equal(v.usuario_id, agente);
    assert.equal(v.ubicacion_estado, 'tomada');
    assert.equal(Number(v.latitud), 10.0569);
  });

  test('la agenda lo pasa a Próximos con esa fecha y dice por qué y quién', async () => {
    const c = await agenda();
    assert.equal(c.rotacion.proximaVisita, enDias(3));
    assert.equal(c.rotacion.estado, 'proximo');
    assert.equal(c.rotacion.reprogramada.motivo, 'sin_encargado');
    assert.equal(c.rotacion.reprogramada.por, 'ZZ Agente F4');
    assert.equal(c.rotacion.dias, 15);
  });

  test('si después le factura, manda la factura: la reprogramación queda sin efecto', async () => {
    await facturas.crearFactura(pedido(), admin);
    const c = await agenda();
    assert.equal(c.rotacion.reprogramada, undefined);
    assert.equal(c.rotacion.proximaVisita, enDias(15));
  });

  test('lo que no vale se rechaza: sin motivo, hoy o antes, más de 180 días, nota larga', async () => {
    const base = { clienteId: cliente, motivo: 'cerrado', proximaFecha: enDias(2) };
    const mal = (cambio, estado = 400) => assert.rejects(visitas.registrarProximaVisita({ ...base, ...cambio }, quien), (e) => e.status === estado);
    await mal({ motivo: '' });
    await mal({ motivo: 'inventado' });
    await mal({ proximaFecha: hoyCR() });
    await mal({ proximaFecha: enDias(-1) });
    await mal({ proximaFecha: enDias(181) });
    await mal({ proximaFecha: '2026-13-45x' });
    await mal({ nota: 'x'.repeat(501) });
    await mal({ clienteId: 999999999 }, 404);
  });

  test('el agente solo marca clientes de sus rutas (403), por el controlador también', async () => {
    await assert.rejects(visitas.registrarProximaVisita({ clienteId: otro, motivo: 'cerrado', proximaFecha: enDias(2) }, { usuarioId: agente, rutasPermitidas: [rutaA] }),
      (e) => e.status === 403);
    const res = {}; res.set = () => res; res.status = (c) => { res.estado = c; return res; }; res.json = (b) => { res.cuerpo = b; return res; };
    await db.query(`INSERT INTO usuario_ruta (usuario_id, ruta_id) VALUES ($1, $2)`, [agente, rutaA]);
    await preventa.proximaVisita({ usuario: { id: agente }, permisos: { esAdmin: false, modulos: new Set(['preventa']) },
      body: { clienteId: otro, motivo: 'cerrado', proximaFecha: enDias(2) } }, res);
    assert.equal(res.estado, 403);
  });

  test('facturar desde la visita anota la venta con la factura y el GPS, en la misma transacción', async () => {
    const f = await facturas.crearFactura(pedido({ visita: { desde: 'preventa', ...GPS } }), agente);
    const { rows } = await db.query(`SELECT * FROM visita WHERE factura_id = $1`, [f.id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].resultado, 'venta');
    assert.equal(rows[0].usuario_id, agente);
    assert.equal(rows[0].cliente_id, cliente);
    assert.equal(rows[0].ubicacion_estado, 'tomada');
  });

  test('sin visita no se anota nada; si la factura falla, la visita tampoco queda', async () => {
    const contar = async () => (await db.query(`SELECT COUNT(*)::int AS n FROM visita WHERE cliente_id = $1 AND resultado = 'venta'`, [cliente])).rows[0].n;
    const antes = await contar();
    await facturas.crearFactura(pedido(), admin);
    assert.equal(await contar(), antes);
    await assert.rejects(facturas.crearFactura(pedido({ items: [{ productoId: 999999999, price: 1, quantity: 1 }], visita: GPS }), agente));
    assert.equal(await contar(), antes);
  });

  test('la base también lo exige: próxima visita sin motivo o GPS «tomado» sin coordenadas no entran', async () => {
    await db.query('SAVEPOINT chk1');
    await assert.rejects(db.query(`INSERT INTO visita (cliente_id, fecha, resultado, proxima_fecha) VALUES ($1, CURRENT_DATE, 'proxima_visita', CURRENT_DATE + 3)`, [cliente]));
    await db.query('ROLLBACK TO SAVEPOINT chk1');
    await assert.rejects(db.query(`INSERT INTO visita (cliente_id, fecha, resultado, ubicacion_estado) VALUES ($1, CURRENT_DATE, 'venta', 'tomada')`, [cliente]));
    await db.query('ROLLBACK TO SAVEPOINT chk1');
  });
});

describe('la pantalla', () => {
  test('los motivos son los mismos de los dos lados', async () => {
    const { MOTIVOS_VISITA } = await import(path.join(FRONT, 'utils', 'visitaPreventa.js'));
    assert.deepEqual(MOTIVOS_VISITA.map(m => m.clave), require('../src/modules/preventa/visitas').MOTIVOS);
  });

  test('las fechas que ofrece: primero la del servidor (hoy + rotación), y otras para planificar sin repetir', async () => {
    const { fechasParaProximaVisita, textoReprogramada } = await import(path.join(FRONT, 'utils', 'visitaPreventa.js'));
    const o = fechasParaProximaVisita('2026-10-29', '2026-11-05', 7);
    assert.equal(o[0].fecha, '2026-11-05');
    assert.match(o[0].nombre, /cada 7 días/);
    assert.deepEqual(o.map(x => x.fecha), ['2026-11-05', '2026-10-30', '2026-11-13']);
    assert.equal(textoReprogramada({ reprogramada: { motivo: 'cerrado', por: 'Ana' } }), 'Reprogramada por Ana · Estaba cerrado');
    assert.equal(textoReprogramada({}), null);
  });

  test('la visita ofrece «Próxima visita» y el modal no deja guardar sin motivo', () => {
    assert.match(leer('components', 'preventa', 'DetalleVisita.jsx'), /onClick=\{\(\) => setProxima\(true\)\}[^>]*>Próxima visita<\/Boton>/);
    assert.match(leer('components', 'preventa', 'ModalProximaVisita.jsx'), /disabled=\{!motivo \|\| !fecha\}/);
    assert.match(leer('hooks', 'useProximaVisita.js'), /const ubicacion = await tomarUbicacion\(\)/);
  });

  test('desde Preventa, la factura lleva la visita con el GPS tomado al llegar', () => {
    assert.match(leer('hooks', 'useClienteDesdePreventa.js'), /tomarUbicacion\(\)\.then\(u => \{ if \(vivo\) setUbicacion\(u\) \}\)/);
    assert.match(leer('hooks', 'useFacturacion.js'), /if \(!facturaExistente && visitaPreventa\) facturaData\.visita = visitaPreventa/);
    assert.match(leer('pages', 'Facturacion.jsx'), /useEffect\(\(\) => \{ setVisitaPreventa\(preventa\.visita\) \}, \[preventa\.visita, setVisitaPreventa\]\)/);
  });

  test('el GPS nunca frena la acción: sin permiso o sin señal se anota por qué', () => {
    const s = leer('services', 'ubicacionService.js');
    assert.match(s, /resolve\(\{ estado: e\.code === 1 \? 'negada' : 'no_disponible' \}\)/);
    assert.match(s, /timeout: espera/);
  });
});
