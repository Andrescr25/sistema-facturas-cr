// Integración con PostgreSQL REAL y Alegra simulada. Solo se habilita con
// una URL explícita a loopback y una base zz_*. No lee backend/.env.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Pool } = require('pg');

const urlLocal = process.env.IMPRESION_TEST_DATABASE_URL;
if (urlLocal) {
  const url = new URL(urlLocal);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Las pruebas de impresión solo aceptan PostgreSQL local');
  assert.match(url.pathname, /^\/zz_[a-z0-9_]+$/, 'La base de pruebas debe tener prefijo zz_');
  assert.equal(url.search, '', 'La URL de pruebas no admite opciones que redirijan la conexión');
}
const raiz = path.resolve(__dirname, '..');
const rutaDb = require.resolve('../config/database');
const rutaIntegracion = require.resolve('../src/integrations/alegra');
const rutas = [
  '../src/modules/invoices/invoice.service', '../src/modules/invoices/invoice.controller',
  '../src/modules/reports/report.service', '../src/utils/database.helper', '../src/utils/resolverProducto',
  '../services/proveedorAsignacionService', '../src/modules/orders-whatsapp/cicloPedidos'
].map(require.resolve);
const tablas = new Set(['proveedores', 'productos', 'facturas', 'factura_items', 'faltantes', 'procesamientos', 'facturas_reimpresion', 'faltantes_ajustes']);
let secuencia = 0;

const pedidoOriginal = () => [
  { id: 101, reference: { code: 'ZZ-A' }, description: 'ZZ primero', quantity: 10, price: 100, discount: 10, tax: [{ id: 7, percentage: 1 }] },
  { id: 202, reference: 'ZZ-B', description: 'ZZ segundo', quantity: 4, price: 200, discount: 0, tax: [{ id: 9, percentage: 13 }] }
];
const cambio = (datos = {}) => ({ producto_codigo: 'ZZ-A', producto_alegra_id: 101, cantidad_faltante: 3, cantidad_entregada: 1, estado: 'parcial', requiere_actualizacion: true, ...datos });
const factura = (datos = {}) => ({ alegra_id: 990001, numero_factura: 'zz-impresion-1', cliente_nombre: 'ZZ Cliente', fecha_emision: '2026-10-08', ajustes: [cambio()], estado: 'requiere_reimpresion', ...datos });

async function entorno(t) {
  const admin = new Pool({ connectionString: urlLocal });
  const schema = `zz_impresion_${process.pid}_${++secuencia}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: urlLocal, options: `-c search_path=${schema} -c timezone=America/Costa_Rica` });
  t.after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
    for (const r of [rutaDb, rutaIntegracion, ...rutas]) delete require.cache[r];
  });
  // Se leen SOLO los CREATE de estas tablas; jamás se ejecuta setupDatabase.
  const fuente = fs.readFileSync(path.join(raiz, 'setupDatabase.js'), 'utf8');
  for (const m of fuente.matchAll(/await client\.query\(`\s*(CREATE TABLE IF NOT EXISTS (\w+)[\s\S]*?)`\);/g)) {
    if (tablas.has(m[2])) await pool.query(m[1]);
  }
  await pool.query('ALTER TABLE productos ADD COLUMN alegra_id INTEGER');
  await pool.query('ALTER TABLE faltantes ADD COLUMN proveedor_asignado TEXT');
  await pool.query("ALTER TABLE facturas_reimpresion ADD COLUMN categoria VARCHAR(32) DEFAULT 'requiere_cambios', ADD COLUMN total_ajustes INTEGER DEFAULT 0");
  await pool.query("INSERT INTO productos (nombre, codigo, alegra_id) VALUES ('ZZ primero', 'ZZ-A', 101), ('ZZ segundo', 'ZZ-B', 202)");
  await pool.query("INSERT INTO facturas (numero_factura, alegra_id, cliente_nombre, fecha_emision, semana, mes, ano, total) VALUES ('zz-impresion-1', 990001, 'ZZ Cliente', '2026-10-08', 41, 10, 2026, 1813)");
  await pool.query("INSERT INTO faltantes (factura_id, producto_id, cantidad_faltante, tipo_faltante, proveedor_asignado) VALUES (1, 1, 3, 'parcial', 'ZZ Proveedor')");
  await pool.query("INSERT INTO faltantes_ajustes (faltante_id, cantidad_entregada, estado, requiere_actualizacion, revisado) VALUES (1, 1, 'parcial', true, true)");

  const alegra = { items: pedidoOriginal(), catalogo: { 101: 130, 202: 250 }, escrituras: [], falla: false, pierdeRespuesta: false };
  const apiAlegra = {
    getInvoiceById: async () => ({ success: true, data: { items: structuredClone(alegra.items), date: '2026-10-08', total: 1813 } }),
    getUpdatedPriceById: async id => alegra.catalogo[id] ?? null,
    updateInvoice: async (id, payload) => {
      if (alegra.falla) return { success: false, error: 'ZZ Alegra rechazó la modificación' };
      alegra.items = structuredClone(payload.items);
      alegra.escrituras.push(payload);
      if (alegra.pierdeRespuesta) return { success: false, error: 'ZZ respuesta perdida' };
      const total = alegra.items.reduce((s, i) => s + i.quantity * i.price * (1 - i.discount / 100) * (1 + (i.tax[0]?.percentage || 0) / 100), 0);
      return { success: true, data: { total } };
    }
  };
  for (const r of [rutaDb, rutaIntegracion, ...rutas]) delete require.cache[r];
  require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { query: (sql, params) => pool.query(sql, params), getClient: () => pool.connect(), pool } };
  require.cache[rutaIntegracion] = { id: rutaIntegracion, filename: rutaIntegracion, loaded: true, exports: { getInvoiceService: () => apiAlegra, getProductService: () => ({}) } };
  const Servicio = require('../src/modules/invoices/invoice.service');
  const Controller = require('../src/modules/invoices/invoice.controller');
  const Reportes = require('../src/modules/reports/report.service');
  const controller = new Controller();
  const transport = {
    post: async (ruta, payload) => {
      assert.equal(ruta, '/alegra/facturas/procesar-individual');
      const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await controller.processIndividualInvoice({ body: payload }, res);
      if (res.code >= 400) throw new Error(res.body.message);
      return { data: res.body };
    }
  };
  const fuenteFrontend = fs.readFileSync(path.resolve(raiz, '../frontend/src/services/alegraService.js'), 'utf8')
    .replace(/^import .*$/gm, '').replace('export const alegraService', 'const alegraService');
  const silencio = { log() {}, error() {} };
  const frontend = new Function('api', 'console', `${fuenteFrontend}\nreturn alegraService;`)(transport, silencio);
  const estado = async () => {
    const f = await pool.query('SELECT estado_procesamiento, total FROM facturas WHERE id = 1');
    const q = await pool.query('SELECT estado, ajustes_realizados FROM facturas_reimpresion ORDER BY id DESC LIMIT 1');
    const h = await pool.query('SELECT COUNT(*)::int AS total FROM procesamientos');
    return { factura: f.rows[0], cola: q.rows[0], procesamientos: h.rows[0].total };
  };
  return { servicio: new Servicio(), reportes: new Reportes(), frontend, alegra, pool, estado };
}

describe('Reporte Clientes → Impresión sobre PostgreSQL local', { skip: !urlLocal && 'requiere IMPRESION_TEST_DATABASE_URL local, base zz_*' }, () => {
  test('enviar a impresión guarda los ajustes sin modificar Alegra; finalizar aplica precios y cantidades', async t => {
    const e = await entorno(t);
    const reporte = await e.reportes.getMissingItemsByClient();
    assert.equal(reporte.success, true);
    assert.equal(reporte.data[0].facturas_con_faltantes[0].productos_faltantes[0].producto_alegra_id, 101);
    assert.equal((await e.frontend.procesarFacturaIndividual(factura())).success, true);
    assert.equal(e.alegra.escrituras.length, 0);
    assert.equal((await e.estado()).cola.estado, 'pendiente');
    const pendientes = await e.servicio.getPendingReprintInvoices();
    const enCola = pendientes.data.requiere_cambios[0];
    assert.equal(enCola.ajustes_realizados[0].cantidad_original, 10);
    await e.frontend.procesarFacturaIndividual({ ...enCola, marcar_como_procesada: true, actualizar_precios: true });
    assert.deepEqual(e.alegra.items.map(i => [i.id, i.quantity, i.price, i.discount, i.tax[0].percentage]), [[101, 8, 130, 10, 1], [202, 4, 250, 0, 13]]);
    const estado = await e.estado();
    assert.equal(estado.cola.estado, 'procesada');
    assert.equal(estado.factura.estado_procesamiento, 'procesado');
    assert.equal(Number(estado.factura.total), 2075.36);
    assert.equal(estado.procesamientos, 1);
  });

  test('una factura con solo cambio de precios también se actualiza', async t => {
    const e = await entorno(t);
    await e.frontend.procesarFacturaIndividual(factura({ ajustes: [], marcar_como_procesada: true, actualizar_precios: true }));
    assert.deepEqual(e.alegra.items.map(i => i.price), [130, 250]);
    assert.deepEqual(e.alegra.items.map(i => i.quantity), [10, 4]);
  });

  test('una factura aún sin copia local se registra y procesa con los mismos ajustes', async t => {
    const e = await entorno(t);
    await e.frontend.procesarFacturaIndividual(factura({ alegra_id: 990002, numero_factura: 'zz-impresion-2', marcar_como_procesada: true, actualizar_precios: true }));
    const r = await e.pool.query('SELECT estado_procesamiento FROM facturas WHERE alegra_id = 990002');
    assert.equal(r.rows[0].estado_procesamiento, 'procesado');
    assert.equal(e.alegra.items[0].quantity, 8);
  });

  test('un fallo local después del cambio en Alegra conserva la cola pendiente y permite reintentar', async t => {
    const e = await entorno(t);
    const conectar = e.pool.connect.bind(e.pool);
    let falla = true;
    e.pool.connect = function(callback) {
      if (callback) return conectar(callback);
      return conectar().then(client => {
        const consultar = client.query.bind(client);
        const liberar = client.release.bind(client);
        client.query = (sql, params) => {
          if (falla && /UPDATE facturas SET estado_procesamiento/.test(sql)) {
            falla = false;
            return Promise.reject(new Error('ZZ fallo local al finalizar'));
          }
          return consultar(sql, params);
        };
        client.release = () => { client.query = consultar; client.release = liberar; liberar(); };
        return client;
      });
    };
    const datos = factura({ marcar_como_procesada: true, actualizar_precios: true });
    await assert.rejects(() => e.frontend.procesarFacturaIndividual(datos), /fallo local/);
    assert.equal(e.alegra.items[0].quantity, 8);
    const estado = await e.estado();
    assert.equal(estado.factura.estado_procesamiento, 'pendiente');
    assert.equal(estado.cola.estado, 'pendiente');
    assert.equal(estado.procesamientos, 0);
    await e.frontend.procesarFacturaIndividual(datos);
    assert.equal(e.alegra.items[0].quantity, 8);
    assert.equal((await e.estado()).procesamientos, 1);
  });

  test('sin precio actual verificable no imprime con precios viejos', async t => {
    const e = await entorno(t);
    delete e.alegra.catalogo[101];
    await assert.rejects(() => e.frontend.procesarFacturaIndividual(factura({ marcar_como_procesada: true, actualizar_precios: true })), /verificar el precio/);
    assert.equal(e.alegra.escrituras.length, 0);
    assert.equal((await e.estado()).cola.estado, 'pendiente');
  });

  test('si Alegra rechaza, queda pendiente y no llega al historial', async t => {
    const e = await entorno(t);
    await e.frontend.procesarFacturaIndividual(factura());
    e.alegra.falla = true;
    await assert.rejects(() => e.frontend.procesarFacturaIndividual(factura({ marcar_como_procesada: true, actualizar_precios: true })), /rechazó/);
    const estado = await e.estado();
    assert.equal(estado.factura.estado_procesamiento, 'pendiente');
    assert.equal(estado.cola.estado, 'pendiente');
    assert.equal(estado.procesamientos, 0);
  });

  test('recuperar conserva el pedido original y evita una segunda rebaja', async t => {
    const e = await entorno(t);
    const datos = factura({ marcar_como_procesada: true, actualizar_precios: true });
    await e.frontend.procesarFacturaIndividual(datos);
    await e.servicio.recoverProcessedInvoice(990001);
    await e.frontend.procesarFacturaIndividual(datos);
    assert.equal(e.alegra.items[0].quantity, 8);
    assert.equal((await e.estado()).procesamientos, 2);
  });

  test('si se pierde la respuesta después del cambio, reintentar no rebaja dos veces', async t => {
    const e = await entorno(t);
    e.alegra.pierdeRespuesta = true;
    const datos = factura({ marcar_como_procesada: true, actualizar_precios: true });
    await assert.rejects(() => e.frontend.procesarFacturaIndividual(datos), /respuesta perdida/);
    assert.equal(e.alegra.items[0].quantity, 8);
    assert.equal((await e.estado()).cola.estado, 'pendiente');
    e.alegra.pierdeRespuesta = false;
    await e.frontend.procesarFacturaIndividual(datos);
    assert.equal(e.alegra.items[0].quantity, 8);
    assert.equal((await e.estado()).procesamientos, 1);
  });

  test('dos clics simultáneos finalizan una sola vez', async t => {
    const e = await entorno(t);
    const datos = factura({ marcar_como_procesada: true, actualizar_precios: true });
    const resultados = await Promise.all([e.frontend.procesarFacturaIndividual(datos), e.frontend.procesarFacturaIndividual(datos)]);
    assert.ok(resultados.every(r => r.success));
    assert.equal(e.alegra.escrituras.length, 1);
    assert.equal((await e.estado()).procesamientos, 1);
  });

  test('recuperar mientras se guarda espera y devuelve todos los estados a pendiente', async t => {
    const e = await entorno(t);
    let avisar, continuar;
    const inicio = new Promise(resolve => { avisar = resolve; });
    const permiso = new Promise(resolve => { continuar = resolve; });
    const original = e.servicio.alegraInvoiceService.updateInvoice;
    e.servicio.alegraInvoiceService.updateInvoice = async (...args) => {
      avisar();
      await permiso;
      return original(...args);
    };
    const finalizacion = e.frontend.procesarFacturaIndividual(factura({ marcar_como_procesada: true, actualizar_precios: true }));
    await inicio;
    const recuperacion = e.servicio.recoverProcessedInvoice(990001);
    continuar();
    await Promise.all([finalizacion, recuperacion]);
    const estado = await e.estado();
    assert.equal(estado.factura.estado_procesamiento, 'pendiente');
    assert.equal(estado.cola.estado, 'pendiente');
    assert.equal(estado.procesamientos, 1);
  });

  test('editar conserva descuentos e impuestos y distingue precio automático de precio manual', async t => {
    const e = await entorno(t);
    await e.frontend.procesarFacturaIndividual(factura());
    const pendiente = (await e.servicio.getPendingReprintInvoices()).data.requiere_cambios[0];
    const util = await import(pathToFileURL(path.resolve(raiz, '../frontend/src/utils/impresionUtils.js')));
    const editados = util.normalizarItemsFactura(e.alegra.items, pendiente);
    // La pantalla ya mostró 130; el catálogo cambia otra vez antes de guardar.
    editados[0].price = 130;
    e.alegra.catalogo[101] = 140;
    editados[1].price = 190;
    editados[1].precio_editado = true;
    await e.frontend.procesarFacturaIndividual({ ...pendiente, marcar_como_procesada: true, actualizar_precios: true }, util.construirPayloadItems(editados));
    assert.deepEqual(e.alegra.items.map(i => [i.quantity, i.price, i.discount]), [[8, 140, 10], [4, 190, 0]]);
  });

  test('un faltante total quitado puede restaurarse después de recuperar y recibirlo', async t => {
    const e = await entorno(t);
    await e.frontend.procesarFacturaIndividual(factura({ ajustes: [cambio({ cantidad_faltante: 10, cantidad_entregada: 0, estado: 'no_llego' })], marcar_como_procesada: true, actualizar_precios: true }));
    assert.deepEqual(e.alegra.items.map(i => i.id), [202]);
    await e.servicio.recoverProcessedInvoice(990001);
    await e.frontend.procesarFacturaIndividual(factura({ ajustes: [cambio({ cantidad_faltante: 10, cantidad_entregada: 10, estado: 'completo' })], marcar_como_procesada: true, actualizar_precios: true }));
    assert.equal(e.alegra.items.find(i => i.id === 101).quantity, 10);
  });

  test('vaciar la edición se rechaza sin actualizar Alegra ni cerrar la factura', async t => {
    const e = await entorno(t);
    await assert.rejects(() => e.frontend.procesarFacturaIndividual(factura({ marcar_como_procesada: true, actualizar_precios: true }), []), /al menos un producto/);
    assert.equal(e.alegra.escrituras.length, 0);
    assert.equal((await e.estado()).factura.estado_procesamiento, 'pendiente');
    assert.equal((await e.estado()).cola, undefined);
  });

  test('una cantidad corregida a mano se conserva al recuperar; una entrega nueva vuelve a calcularla', async t => {
    const e = await entorno(t);
    const manuales = pedidoOriginal();
    manuales[0].quantity = 9;
    await e.frontend.procesarFacturaIndividual(factura({ marcar_como_procesada: true, actualizar_precios: true }), manuales);
    await e.servicio.recoverProcessedInvoice(990001);
    const datos = factura({ marcar_como_procesada: true, actualizar_precios: true });
    await e.frontend.procesarFacturaIndividual(datos);
    assert.equal(e.alegra.items[0].quantity, 9);
    await e.servicio.recoverProcessedInvoice(990001);
    await e.frontend.procesarFacturaIndividual({ ...datos, ajustes: [cambio({ cantidad_entregada: 3, estado: 'completo' })] });
    assert.equal(e.alegra.items[0].quantity, 10);
  });
});
