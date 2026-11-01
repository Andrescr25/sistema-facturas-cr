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
  let db, plan, visitas, facturas, controlador, agente, otro, sinRutas, rutaA, rutaB, rutaAjena, producto, c, hoy, fechas;
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

  test('el controlador lee siempre el plan de la sesión, y agregar respeta sus rutas', async () => {
    const r = respuesta();
    await controlador.plan({ usuario: { id: String(agente) }, query: { usuarioId: String(sinRutas) } }, r);
    assert.equal(r.cuerpo.data.clientes.length, 4);
    const r2 = respuesta();
    await controlador.agregarAlPlan({ usuario: { id: agente }, permisos: { esAdmin: false, modulos: new Set(['preventa']) }, body: { clienteIds: [c.ajeno] } }, r2);
    assert.equal(r2.estado, 403);
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

  test('al volver de Facturar vuelve a la pestaña de donde salió', () => {
    assert.match(leer('components', 'preventa', 'DetalleVisita.jsx'), /&vista=\$\{vista\}/);
    assert.match(leer('hooks', 'useClienteDesdePreventa.js'), /parametros\.get\('vista'\)/);
  });
});
