/**
 * «Mi día»: el plan de visitas del agente (2026-11-01; migración 077).
 *
 * El usuario: «quiero que el agente pueda organizar mejor cuál cliente quiere
 * visitar primero… que lo edite a su gusto»; un plan por día con clientes de
 * todas sus rutas. Contra PostgreSQL local (con la 077 aplicada), en una
 * transacción que se deshace.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

describe('el plan del día — contra PostgreSQL local', () => {
  let db, plan, visitas, facturas, controlador, seguimiento, agente, otro, sinRutas, rutaA, rutaB, rutaAjena, producto, c, hoy, fechas;
  const ids = (p) => p.clientes.map(x => x.cliente.id);
  const respuesta = () => { const r = {}; r.set = () => r; r.status = (x) => { r.estado = x; return r; }; r.json = (b) => { r.cuerpo = b; return r; }; return r; };

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
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'plandia') };
    plan = require('../src/modules/preventa/planDelDia');
    visitas = require('../src/modules/preventa/visitas');
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    controlador = require('../src/modules/preventa/preventa.controller');
    seguimiento = require('../src/modules/seguimiento/seguimiento.service');
    fechas = require('../src/utils/fechaCR');
    hoy = fechas.hoyEnCostaRica();

    const usuario = async (u) => (await db.query(
      `INSERT INTO usuario (usuario, nombre, password_hash, activo, es_admin) VALUES ($1, $1, 'zz', TRUE, FALSE) RETURNING id`, [u])).rows[0].id;
    agente = await usuario('zz-agente-plan'); otro = await usuario('zz-otro-plan'); sinRutas = await usuario('zz-sin-rutas-plan');
    const ruta = async (n) => (await db.query(`INSERT INTO ruta_cliente (nombre, activo) VALUES ($1, TRUE) RETURNING id`, [n])).rows[0].id;
    rutaA = await ruta('ZZ Plan A'); rutaB = await ruta('ZZ Plan B'); rutaAjena = await ruta('ZZ Plan ajena');
    for (const r of [rutaA, rutaB]) await db.query('INSERT INTO usuario_ruta (usuario_id, ruta_id) VALUES ($1, $2)', [agente, r]);
    const impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa = 13 LIMIT 1')).rows[0];
    producto = (await db.query(`INSERT INTO producto (nombre, referencia, precio_sin_iva, costo_con_iva, impuesto_id) VALUES ('ZZ-PLAN', 'ZZ-PLAN', 1000, 700, $1) RETURNING id`, [impuesto.id])).rows[0].id;
    // [nombre, ruta, orden en la ruta, rotación, días desde su última compra (null = nunca)]
    const fichas = {
      atrasadoA: ['ZZ Plan Atrasado A', rutaA, 2, 7, 10],
      hoyA: ['ZZ Plan Hoy A', rutaA, 1, 7, 7],
      proximoA: ['ZZ Plan Próximo A', rutaA, 3, 15, 3],
      sinRotacionA: ['ZZ Plan Sin rotación A', rutaA, 4, null, 2],
      atrasadoB: ['ZZ Plan Atrasado B', rutaB, 1, 7, 12],
      ajeno: ['ZZ Plan Ajeno', rutaAjena, 1, 7, 9]
    };
    c = {};
    for (const [clave, [nombre, r, orden, rotacion, dias]] of Object.entries(fichas)) {
      c[clave] = (await db.query(`INSERT INTO cliente (nombre, activo, ruta_id, orden_ruta, rotacion_dias) VALUES ($1, TRUE, $2, $3, $4) RETURNING id`, [nombre, r, orden, rotacion])).rows[0].id;
      if (dias !== null) {
        await facturas.crearFactura({ clienteId: c[clave], clienteNombre: nombre, fecha: fechas.sumarDias(hoy, -dias),
          items: [{ productoId: producto, price: 1000, quantity: 1, discount: 0, descuentoBase: 0 }] }, otro);
      }
    }
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('la primera vez del día se arma solo: atrasados y de hoy, ruta por ruta y en el orden de cada una', async () => {
    const p = await plan.planDe(agente);
    assert.deepEqual(ids(p), [c.hoyA, c.atrasadoA, c.atrasadoB]);
    assert.equal(p.siguiente, c.hoyA);
    assert.equal(p.visitados, 0);
    assert.equal(p.clientes[0].cliente.ruta.nombre, 'ZZ Plan A', 'el cliente trae lo mismo que la agenda');
    assert.ok(p.clientes[0].cliente.rotacion && p.clientes[0].cliente.proximaSugerida);
  });

  test('quitar lo saca y no vuelve solo; queda anotado como quitado', async () => {
    const p = await plan.quitar(agente, c.atrasadoB);
    assert.deepEqual(ids(p), [c.hoyA, c.atrasadoA]);
    assert.deepEqual(p.quitados.map(x => x.id), [c.atrasadoB]);
    assert.deepEqual(ids(await plan.planDe(agente)), [c.hoyA, c.atrasadoA], 'abrirlo otra vez no lo vuelve a armar');
    await assert.rejects(plan.quitar(agente, c.ajeno), (e) => e.status === 404);
  });

  test('agregar va al final, de cualquiera de sus rutas; de otra ruta, no', async () => {
    let p = await plan.agregar(agente, [c.proximoA], { rutasPermitidas: [rutaA, rutaB] });
    assert.deepEqual(ids(p), [c.hoyA, c.atrasadoA, c.proximoA]);
    p = await plan.agregar(agente, [c.atrasadoB], { rutasPermitidas: [rutaA, rutaB] });
    assert.deepEqual(ids(p), [c.hoyA, c.atrasadoA, c.proximoA, c.atrasadoB], 'el quitado vuelve, al final');
    assert.deepEqual(p.quitados, []);
    p = await plan.agregar(agente, [c.hoyA], { rutasPermitidas: [rutaA, rutaB] });
    assert.deepEqual(ids(p), [c.hoyA, c.atrasadoA, c.proximoA, c.atrasadoB], 'el que ya estaba no se mueve');
    await assert.rejects(plan.agregar(agente, [c.ajeno], { rutasPermitidas: [rutaA, rutaB] }), (e) => e.status === 403);
    await assert.rejects(plan.agregar(agente, [], { rutasPermitidas: [rutaA, rutaB] }), (e) => e.status === 400);
  });

  test('ordenar guarda el orden que eligió; si no calza con lo guardado, se rechaza', async () => {
    const orden = [c.atrasadoB, c.proximoA, c.hoyA, c.atrasadoA];
    const p = await plan.ordenar(agente, orden);
    assert.deepEqual(ids(p), orden);
    assert.equal(p.siguiente, c.atrasadoB);
    for (const malo of [[c.atrasadoB, c.proximoA, c.hoyA], [...orden, c.sinRotacionA], [c.atrasadoB, c.atrasadoB, c.hoyA, c.atrasadoA]]) {
      await assert.rejects(plan.ordenar(agente, malo), (e) => e.status === 409, JSON.stringify(malo));
    }
  });

  test('con «próxima visita» o una factura suya de hoy queda atendido, y el siguiente avanza', async () => {
    await visitas.registrarProximaVisita({ clienteId: c.atrasadoB, motivo: 'cerrado', proximaFecha: fechas.sumarDias(hoy, 2) }, { usuarioId: agente, rutasPermitidas: [rutaA, rutaB] });
    let p = await plan.planDe(agente);
    assert.deepEqual(p.clientes[0].atendido.como, 'proxima_visita');
    assert.equal(p.siguiente, c.proximoA);
    const f = await facturas.crearFactura({ clienteId: c.proximoA, clienteNombre: 'ZZ Plan Próximo A',
      items: [{ productoId: producto, price: 1000, quantity: 1, discount: 0, descuentoBase: 0 }] }, agente);
    p = await plan.planDe(agente);
    assert.deepEqual([p.clientes[1].atendido.como, p.clientes[1].atendido.factura], ['venta', f.numero]);
    assert.equal(p.visitados, 2);
    assert.equal(p.siguiente, c.hoyA);
    await assert.rejects(plan.quitar(agente, c.proximoA), (e) => e.status === 409 && /Ya lo visitaste/.test(e.message));
  });

  test('una factura de otro usuario no cuenta como su visita', async () => {
    await facturas.crearFactura({ clienteId: c.hoyA, clienteNombre: 'ZZ Plan Hoy A',
      items: [{ productoId: producto, price: 1000, quantity: 1, discount: 0, descuentoBase: 0 }] }, otro);
    const p = await plan.planDe(agente);
    assert.equal(p.clientes.find(x => x.cliente.id === c.hoyA).atendido, null);
  });

  test('quien no tiene rutas arranca con el día vacío, sin filas', async () => {
    const p = await plan.planDe(sinRutas);
    assert.deepEqual(p.clientes, []);
    const { rows } = await db.query('SELECT 1 FROM plan_visita WHERE usuario_id = $1', [sinRutas]);
    assert.equal(rows.length, 0);
  });

  test('«Guardar como orden de mi ruta»: los del día toman los lugares que ya tenían, en el orden del día; los demás no se mueven', async () => {
    assert.deepEqual(plan.ordenConElDia([1, 2, 3, 4], [4, 2]), [1, 4, 3, 2]);
    assert.deepEqual(plan.ordenConElDia([1, 2, 3], [9, 3, 1]), [3, 2, 1], 'el que no es de la ruta no cuenta');
    assert.deepEqual(plan.ordenConElDia([1, 2, 3], []), [1, 2, 3]);
    // El día va [B atrasado, A próximo, A hoy, A atrasado]; la ruta A era hoy(1), atrasado(2), próximo(3), sin rotación(4).
    await assert.rejects(plan.guardarComoOrdenDeRuta(agente, { rutasPermitidas: [rutaB] }), (e) => e.status === 403 && /ZZ Plan A no es una de tus rutas/.test(e.message));
    const r = await plan.guardarComoOrdenDeRuta(agente, { rutasPermitidas: [rutaA, rutaB] });
    assert.deepEqual(r.rutas.map(x => x.nombre), ['ZZ Plan A'], 'la B ya estaba así: no se toca');
    const { rows } = await db.query('SELECT id FROM cliente WHERE ruta_id = $1 ORDER BY orden_ruta', [rutaA]);
    assert.deepEqual(rows.map(x => x.id), [c.proximoA, c.hoyA, c.atrasadoA, c.sinRotacionA]);
    const { rows: [b] } = await db.query(`SELECT accion, usuario_id FROM bitacora_cambio WHERE entidad = 'ruta_cliente' AND entidad_id = $1 ORDER BY id DESC LIMIT 1`, [String(rutaA)]);
    assert.deepEqual([b.accion, b.usuario_id], ['ordenar', agente]);
    assert.equal(r.plan.clientes.find(x => x.cliente.id === c.proximoA).cliente.ordenRuta, 1, 'el día ya trae el lugar nuevo');
    assert.deepEqual((await plan.guardarComoOrdenDeRuta(agente, { rutasPermitidas: [rutaA, rutaB] })).rutas, [], 'otra vez: nada que cambiar');
  });

  test('el controlador lee siempre el plan de la sesión, y agregar respeta sus rutas', async () => {
    const r = respuesta();
    await controlador.plan({ usuario: { id: String(agente) }, query: { usuarioId: String(sinRutas) } }, r);
    assert.equal(r.cuerpo.data.clientes.length, 4);
    const r2 = respuesta();
    await controlador.agregarAlPlan({ usuario: { id: agente }, permisos: { esAdmin: false, modulos: new Set(['preventa']) }, body: { clienteIds: [c.ajeno] } }, r2);
    assert.equal(r2.estado, 403);
  });
  test('«Su día» (Empleados) trae su plan: qué visitó y a qué hora, a quién sacó y a quién visitó fuera del plan', async () => {
    await plan.quitar(agente, c.atrasadoA);
    await facturas.crearFactura({ clienteId: c.sinRotacionA, clienteNombre: 'ZZ Plan Sin rotación A',
      items: [{ productoId: producto, price: 1000, quantity: 1, discount: 0, descuentoBase: 0 }] }, agente);
    const d = await seguimiento.dia({ usuarioId: agente });
    assert.deepEqual(d.plan.clientes.map(x => [x.numero, x.id, x.atendido?.como ?? null]),
      [[1, c.atrasadoB, 'proxima_visita'], [2, c.proximoA, 'venta'], [3, c.hoyA, null]]);
    assert.match(d.plan.clientes[1].atendido.hora, /^\d{2}:\d{2}$/);
    assert.deepEqual(d.plan.quitados.map(x => x.id), [c.atrasadoA]);
    assert.deepEqual(d.plan.fueraDelPlan.map(x => x.nombre), ['ZZ Plan Sin rotación A']);
    assert.deepEqual(d.resumen.plan, { planeados: 3, visitados: 2, quitados: 1, fueraDelPlan: 1 });
    const sinPlan = await seguimiento.dia({ usuarioId: sinRutas });
    assert.equal(sinPlan.plan, null);
    assert.equal(sinPlan.resumen.plan, null);
    const { rows } = await db.query('SELECT 1 FROM plan_visita WHERE usuario_id = $1', [sinRutas]);
    assert.equal(rows.length, 0, 'mirarlo no le arma el plan');
  });
});

describe('la pantalla', () => {
  const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
  const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));

  test('mover dentro de la lista, sin perder ni repetir a nadie', async () => {
    const { moverEn } = await import(path.join(FRONT, 'utils', 'planDelDia.js'));
    assert.deepEqual(moverEn([1, 2, 3, 4], 0, 2), [2, 3, 1, 4]);
    assert.deepEqual(moverEn([1, 2, 3, 4], 3, 0), [4, 1, 2, 3]);
    assert.deepEqual(moverEn([1, 2, 3], 1, 1), [1, 2, 3]);
    assert.deepEqual(moverEn([1, 2, 3], 0, 9), [1, 2, 3], 'fuera de la lista no mueve');
  });

  test('«Orden de la ruta»: ruta por ruta y por su lugar; y cuándo guardar cambiaría una ruta', async () => {
    const { ordenDeRuta, estaEnOrdenDeRuta, difiereDeLaRuta } = await import(path.join(FRONT, 'utils', 'planDelDia.js'));
    const x = (id, ruta, ordenRuta, nombre = `C${id}`) => ({ cliente: { id, nombre, ruta: ruta ? { id: ruta } : null, ordenRuta } });
    const rutas = [{ id: 7 }, { id: 3 }];
    const dia = [x(1, 3, 1), x(2, 7, 2), x(3, null, null), x(4, 7, 1), x(5, 3, null, 'A')];
    assert.deepEqual(ordenDeRuta(dia, rutas).map(y => y.cliente.id), [4, 2, 1, 5, 3]);
    assert.equal(estaEnOrdenDeRuta(dia, rutas), false);
    assert.equal(estaEnOrdenDeRuta(ordenDeRuta(dia, rutas), rutas), true);
    assert.equal(difiereDeLaRuta([x(1, 7, 1), x(2, 3, 5), x(3, 7, 2)]), false, 'mezclar rutas no cambia ninguna');
    assert.equal(difiereDeLaRuta([x(1, 7, 2), x(2, 7, 1)]), true);
  });

  test('«Mapa del día»: cada uno con su número del plan; los que no tienen ubicación, aparte', async () => {
    const { puntosDelDia } = await import(path.join(FRONT, 'utils', 'planDelDia.js'));
    const x = (id, enlace, atendido = null) => ({ cliente: { id, nombre: `C${id}`, ubicacion_maps: enlace }, atendido });
    const { conPunto, sinPunto } = puntosDelDia([
      x(1, 'https://www.google.com/maps?q=10.056900,-84.435100', { como: 'venta' }),
      x(2, null),
      x(3, 'https://www.google.com/maps?q=10.060300,-84.428700'),
      x(4, 'https://maps.app.goo.gl/sin-coordenadas')
    ]);
    assert.deepEqual(conPunto.map(p => [p.numero, p.id, p.atendido, p.lat]), [[1, 1, true, 10.0569], [3, 3, false, 10.0603]]);
    assert.deepEqual(sinPunto.map(p => [p.numero, p.id]), [[2, 2], [4, 4]]);
  });

  test('el mapa se carga aparte, numera en orden, une con una línea de la paleta y tocar un número lo elige', () => {
    assert.match(leer('components', 'preventa', 'ModalMapaDelDia.jsx'), /const MapaDelDia = lazy\(\(\) => import\('\.\/MapaDelDia'\)\)/);
    const m = leer('components', 'preventa', 'MapaDelDia.jsx');
    assert.match(m, /crearMapa\(caja\.current\)/);
    assert.match(m, /className: 'stroke-neutro-500'/);
    assert.match(m, /\.on\('click', \(\) => alElegir\.current\(p\.id\)\)/);
    assert.match(leer('components', 'preventa', 'PlanDelDia.jsx'), /\{total > 0 && <Boton variante="secundario" icono=\{IconoMapa\} onClick=\{\(\) => setConMapa\(true\)\}>Mapa del día<\/Boton>\}/);
  });

  test('Preventa abre en «Mi día»; «Toda la ruta» es la agenda de siempre', () => {
    const p = leer('pages', 'Preventa.jsx');
    assert.match(p, /const vista = parametros\.get\('vista'\) === 'ruta' \? 'ruta' : 'dia'/);
    assert.match(p, /<PlanDelDia /);
    assert.match(p, /<ListaAgenda agenda=\{agenda\} \/>/);
  });

  test('ordenar sirve con el dedo: el asa no deja que la página se desplace mientras arrastra', () => {
    const l = leer('components', 'preventa', 'ListaOrdenable.jsx');
    assert.match(l, /touch-none/);
    assert.match(l, /onPointerDown: empezar\(i\)/);
    assert.match(l, /setPointerCapture/);
  });

  test('«Guardar como orden de mi ruta» muestra cómo queda antes de guardar, y solo sale si cambiaría algo', () => {
    const p = leer('components', 'preventa', 'PlanDelDia.jsx');
    assert.match(p, /\{difiereDeLaRuta\(plan\.clientes\) && \(/);
    assert.match(p, /<ModalOrdenDeRuta clientes=\{plan\.clientes\} onGuardar=\{guardarEnRuta\}/);
    assert.match(leer('hooks', 'usePlanDelDia.js'), /api\.post\('\/preventa\/plan\/orden-de-ruta'\)/);
  });

  test('en «Su día» de Empleados, el plan va antes del recorrido', () => {
    assert.match(leer('components', 'empleados', 'DiaDelEmpleado.jsx'), /<PlanDelDiaEmpleado plan=\{s\.dia\.plan\} \/>/);
    assert.match(leer('components', 'empleados', 'PlanDelDiaEmpleado.jsx'), /Ese día no armó su plan en «Mi día»/);
  });

  test('al volver de Facturar vuelve a la pestaña de donde salió', () => {
    assert.match(leer('components', 'preventa', 'DetalleVisita.jsx'), /&vista=\$\{vista\}/);
    assert.match(leer('hooks', 'useClienteDesdePreventa.js'), /parametros\.get\('vista'\)/);
  });
});
