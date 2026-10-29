/**
 * «El agente ve solo sus facturas» (decisión del usuario, 2026-10-29).
 *
 * Quien no tiene «Ver las facturas de todos» (`facturas-todas`) ve en la
 * lista solo las facturas que creó, y una ajena pedida por su número «no
 * existe» en todo lo que la abre, imprime, manda, edita o emite —también sus
 * notas de crédito y sus comprobantes de Hacienda—. Lo hace valer el servidor
 * (facturacion/soloSusFacturas.js). Contra PostgreSQL local, en una
 * transacción que se deshace.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

const SRC = path.join(__dirname, '..', 'src');
const leer = (...p) => sinComentarios(fs.readFileSync(path.join(SRC, ...p), 'utf8'));

describe('cada quien ve solo sus facturas — contra PostgreSQL local', () => {
  let db, facturas, consulta, notas, guardia, agente, otro, deAgente, deOtro, notaDeAgente, notaDeOtro;
  const req = (usuarioId, modulos = ['facturacion']) => ({ usuario: { id: usuarioId }, permisos: { esAdmin: false, modulos: new Set(modulos) } });
  const noExiste = (e) => e.status === 404 && e.code === 'NO_EXISTE';

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    db = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
    await db.connect(); await db.query('BEGIN');
    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    for (const r of Object.keys(require.cache)) if (r.includes(`${path.sep}src${path.sep}`)) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'sussfacturas') };
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    consulta = require('../src/modules/facturacion/facturaConsulta.service');
    notas = require('../src/modules/facturacion/notaCredito.service');
    guardia = require('../src/modules/facturacion/soloSusFacturas');
    const clientes = require('../src/modules/clientes/clientes.service');

    const usuario = async (u) => (await db.query(
      `INSERT INTO usuario (usuario, nombre, password_hash, activo, es_admin) VALUES ($1, $1, 'zz', TRUE, FALSE) RETURNING id`, [u])).rows[0].id;
    agente = await usuario('zz-agente-sus');
    otro = await usuario('zz-cajero-sus');

    const ficha = await clientes.crearCliente({ nombre: 'ZZ Solo sus facturas' }, agente);
    const impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa = 13 LIMIT 1')).rows[0];
    const producto = (await db.query(`INSERT INTO producto (nombre, referencia, precio_sin_iva, costo_con_iva, impuesto_id)
      VALUES ('ZZ-SUS-A', 'ZZ-SUS-A', 100, 79.1, $1) RETURNING id`, [impuesto.id])).rows[0];
    const pedido = { clienteId: ficha.id, clienteNombre: ficha.nombre, items: [{ productoId: producto.id, price: 100, quantity: 2, discount: 0, descuentoBase: 0 }] };
    deAgente = await facturas.crearFactura(pedido, agente);
    deOtro = await facturas.crearFactura(pedido, otro);
    const devolver = (f, u) => notas.crearNotaCredito({ facturaId: f.id, motivo: 'devolucion', motivoTexto: 'ZZ solo sus facturas', lineas: [{ numeroLinea: 1, cantidad: 1 }] }, u);
    notaDeAgente = await devolver(deAgente, agente);
    notaDeOtro = await devolver(deOtro, otro);
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('la lista trae solo las que creó él', async () => {
    const { data } = await consulta.listarFacturas({ estado: 'todas', creadoPor: agente, limite: 500 });
    const ids = data.map(f => f.id);
    assert.ok(ids.includes(deAgente.id));
    assert.equal(ids.includes(deOtro.id), false);
    assert.ok(data.length >= 1);
  });

  test('sin filtro (quien ve las de todos) trae las dos, como hasta hoy', async () => {
    const { data } = await consulta.listarFacturas({ estado: 'todas', buscar: 'ZZ Solo sus facturas', limite: 500 });
    const ids = data.map(f => f.id);
    assert.ok(ids.includes(deAgente.id) && ids.includes(deOtro.id));
  });

  test('una factura ajena «no existe» (404, sin decir que es de otro); la suya, sí', async () => {
    await guardia.exigirFacturaPropia(req(agente), deAgente.id);
    await assert.rejects(guardia.exigirFacturaPropia(req(agente), deOtro.id), noExiste);
    await assert.rejects(guardia.exigirFacturaPropia(req(agente), 'abc'), noExiste);
  });

  test('con «Ver las facturas de todos», o siendo administrador, abre cualquiera', async () => {
    await guardia.exigirFacturaPropia(req(agente, ['facturacion', 'facturas-todas']), deOtro.id);
    await guardia.exigirFacturaPropia({ usuario: { id: agente }, permisos: { esAdmin: true, modulos: new Set() } }, deOtro.id);
    assert.equal(await guardia.soloDe(req(agente, ['facturacion', 'facturas-todas'])), null);
    assert.equal(await guardia.soloDe(req(agente)), agente);
  });

  test('las notas de crédito: la de su factura sí, la ajena no', async () => {
    await guardia.exigirNotaPropia(req(agente), notaDeAgente.id);
    await assert.rejects(guardia.exigirNotaPropia(req(agente), notaDeOtro.id), (e) => noExiste(e) && /nota de crédito/.test(e.message));
  });

  test('como middleware: deja seguir con lo suyo y corta con 404 lo ajeno', async () => {
    const correr = (mw, r) => new Promise((resolve) => mw(r, {}, (err) => resolve(err || null)));
    assert.equal(await correr(guardia.facturaPropia, { ...req(agente), params: { id: String(deAgente.id) } }), null);
    assert.ok(noExiste(await correr(guardia.facturaPropia, { ...req(agente), params: { id: String(deOtro.id) } })));
    assert.ok(noExiste(await correr(guardia.facturaDelCuerpoPropia, { ...req(agente), body: { facturaId: deOtro.id } })));
    assert.ok(noExiste(await correr(guardia.notaPropia, { ...req(agente), params: { id: String(notaDeOtro.id) } })));
  });
});

describe('todo lo que abre una factura por su número pasa por el guardia', () => {
  test('cada ruta /facturas/:id y /notas-credito/:id de Facturación lo lleva', () => {
    const rutas = leer('modules', 'facturacion', 'facturacion.routes.js');
    const conId = [...rutas.matchAll(/^router\.(get|post|put|patch|delete)\('(\/(?:facturas|notas-credito)\/:id[^']*)', ([^)]*)\)/gm)];
    assert.ok(conId.length >= 10, `solo ${conId.length} rutas con :id`);
    for (const [, metodo, ruta, manejadores] of conId) {
      const guardia = ruta.startsWith('/facturas') ? 'suya' : 'suNota';
      assert.ok(manejadores.startsWith(`${guardia}, `), `${metodo.toUpperCase()} ${ruta} no pasa por ${guardia}`);
    }
    assert.match(rutas, /router\.post\('\/notas-credito', sobreSuFactura, notaCredito\.crear\)/, 'una nota nueva sobre una factura ajena tampoco');
    assert.match(rutas, /router\.get\('\/notas-credito\/motivos', notaCredito\.motivos\)/, '«motivos» no es una nota: no lleva guardia');
  });

  test('las de Hacienda también: emitir, estado, correo y los comprobantes (XML)', () => {
    const rutas = leer('integrations', 'hacienda', 'rutas.js');
    for (const [ruta, guardia] of [['/facturas/:id/estado', 'suya'], ['/facturas/:id/emitir', 'suya'], ['/facturas/:id/correo', 'suya'],
      ['/notas-credito/:id/estado', 'suNota'], ['/notas-credito/:id/emitir', 'suNota'], ['/notas-credito/:id/correo', 'suNota']]) {
      assert.match(rutas, new RegExp(`"${ruta.replace(/\//g, '\\/')}",\\s*${guardia},`), `${ruta} sin ${guardia}`);
    }
    assert.match(rutas, /if \(c\.origen === "factura"\) await ventasPropias\.exigirFacturaPropia\(req, c\.origen_id\);/);
    assert.match(rutas, /if \(c\.origen === "nota_credito"\) await ventasPropias\.exigirNotaPropia\(req, c\.origen_id\);/);
  });

  test('la lista pide el filtro al servidor y la pantalla lo dice', () => {
    assert.match(leer('modules', 'facturacion', 'facturaPropia.controller.js'), /creadoPor: await soloDe\(req\)/);
    const panel = sinComentarios(fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'facturacion', 'PanelFacturasEmitidas.jsx'), 'utf8'));
    assert.match(panel, /const soloLasSuyas = !puedeAccion\(usuario, 'facturas-todas'\)/);
    assert.match(panel, /Se muestran solo las facturas que hiciste vos\./);
  });
});

describe('quien no tiene el inicio entra a su primer módulo', () => {
  const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');

  test('inicioDe: el Dashboard si lo tiene; si no, su primer módulo; si no ve nada, null', async () => {
    const { inicioDe } = await import(path.join(FRONT, 'utils', 'modulos.js'));
    assert.equal(inicioDe({ esAdmin: true, modulos: [] }), '/');
    assert.equal(inicioDe({ esAdmin: false, modulos: ['dashboard', 'facturacion'] }), '/');
    assert.equal(inicioDe({ esAdmin: false, modulos: ['facturacion', 'catalogo-agente', 'preventa', 'precio-factura'] }), '/facturacion');
    assert.equal(inicioDe({ esAdmin: false, modulos: ['preventa'] }), '/preventa');
    assert.equal(inicioDe({ esAdmin: false, modulos: [] }), null);
  });

  test('el portón lo manda ahí, y «Volver al inicio» también', () => {
    const porton = sinComentarios(fs.readFileSync(path.join(FRONT, 'components', 'RequierePermiso.jsx'), 'utf8'));
    assert.match(porton, /if \(pathname === '\/' && inicio && inicio !== '\/'\) return <Navigate to=\{inicio\} replace \/>/);
    assert.match(porton, /<Link to=\{inicio \|\| '\/'\}/);
  });
});
