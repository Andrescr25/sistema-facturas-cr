/**
 * Volver a enviar una orden de compra ya enviada (2026-11-11). El usuario:
 * «agrégame la opción en Reporte Proveedor de volver a enviar, para quitar la
 * opción de "usar código proveedor"».
 *
 * PostgreSQL local dentro de una transacción que se deshace, y WhatsApp
 * simulado: nunca sale un mensaje.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { sembrar } = require('./dobles/ordenesAutomaticas');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');

const activo = process.env.PROBAR_BASE_LOCAL === '1';
let pool, c, f, s, reenvio, wa, reportes, db, transportes, salidaBloqueada = false, ultimo, falla = null;

const caso = (nombre, fn) => test(nombre, { skip: !activo }, async () => {
  await c.query('SAVEPOINT reenvio_caso'); transportes = 0; salidaBloqueada = false; falla = null;
  wa.enviarDocumento = async (d) => { transportes++; ultimo = d; if (falla) throw falla; return { enviado: true, numero: d.telefono, via: 'interno' }; };
  try { await fn(); } finally { await c.query('ROLLBACK TO SAVEPOINT reenvio_caso'); }
});

if (activo) {
  require('../config/aislado').asegurarBaseLocal();
  before(async () => {
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL }); c = await pool.connect(); await c.query('BEGIN'); f = await sembrar(c);
    db = baseEnTransaccion(c, 'reenvio'); const connect = db.pool.connect;
    db.pool.connect = async () => { const cl = await connect(), q = cl.query; cl.query = (sql, p) => (sql.startsWith('SET TRANSACTION') ? Promise.resolve({ rows: [] }) : q(sql, p)); return cl; };
    const ruta = require.resolve('../config/database'); require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: db };
    require('../config/aislado').salidasBloqueadas = () => salidaBloqueada;
    s = require('../src/modules/orders-whatsapp/envioDesdeReporte.service');
    reenvio = require('../src/modules/orders-whatsapp/reenvioOrden.service');
    wa = require('../src/integrations/whatsapp');
    reportes = new (require('../src/modules/reports/report.service'))();
  });
  after(async () => { if (c) { await c.query('ROLLBACK'); c.release(); } await pool?.end(); });
}

/** Los datos del pedido tal como los manda Reporte Proveedores. */
async function pedido() {
  await require('../src/modules/warehouse/bodegaPropia').registrarFaltantes(f.facturas[0], [{ producto_id: f.productos[0], cantidad_faltante: 10, tipo_faltante: 'parcial' }]);
  const r = await reportes.getMissingItemsBySupplier(null, { db, incluirEnviadas: false });
  const p = r.data.find((x) => x.cedula === f.p.identificacion);
  return { clave: randomUUID(), cedula: p.cedula, nombre: p.nombre, revisionReporte: p.revisionReporte, fechaInicio: null,
    productos: p.productos_faltantes.map((l) => ({ productoId: l.producto_id, cantidad: Number(l.cantidad_faltante), cantidadOriginal: Number(l.cantidad_faltante), factorConversion: 1 })) };
}

/** Una orden enviada de verdad (con el transporte simulado). */
async function ordenEnviada() {
  const { orden } = await s.enviar(await pedido());
  assert.equal(orden.estado, 'enviada');
  transportes = 0;
  return orden;
}
const estadoDe = async (id) => (await c.query('SELECT estado, version, enviada_en::text, envio_id FROM orden_compra_ciclo WHERE id = $1', [id])).rows[0];
const bitacora = async (id) => (await c.query("SELECT accion, despues FROM bitacora_cambio WHERE entidad = 'orden_compra_ciclo' AND entidad_id = $1 AND accion LIKE '%reenvio%' ORDER BY id", [String(id)])).rows;

caso('propone el número del envío original y el mensaje de siempre', async () => {
  const o = await ordenEnviada();
  const p = await reenvio.propuesta(o.id);
  assert.equal(p.telefono, '8888 8888');
  assert.equal(p.mensaje, 'Hola buenas, adjunto pedido\ngracias');
  assert.deepEqual(p.telefonos, [{ formateado: '8888 8888' }]);
});

caso('vuelve a mandar el PDF sin los códigos del proveedor, y la orden queda igual', async () => {
  const o = await ordenEnviada();
  const antes = await estadoDe(o.id);
  const r = await reenvio.reenviar(o.id, { telefono: '8888 8888', preferirDatosProveedor: false }, f.usuarioId ?? null);
  assert.deepEqual([r.estado, r.numero, transportes], ['enviado', '50688888888', 1]);
  assert.equal(ultimo.mensaje, 'Hola buenas, adjunto pedido\ngracias');
  assert.equal(ultimo.pdf.subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(await estadoDe(o.id), antes, 'ni el estado ni la versión de la orden cambian');
  const [inicio, fin] = await bitacora(o.id);
  assert.equal(inicio.accion, 'iniciar_reenvio');
  assert.equal(inicio.despues.preferirDatosProveedor, false);
  assert.equal(inicio.despues.sha256, createHash('sha256').update(ultimo.pdf).digest('hex'), 'la huella es la del PDF que salió');
  assert.equal(fin.accion, 'reenvio_enviado');
  const { rows: [w] } = await c.query("SELECT exito FROM envio_whatsapp WHERE tipo = 'orden_compra' AND referencia = $1 ORDER BY id DESC LIMIT 1", [String(o.id)]);
  assert.equal(w.exito, true);
});

caso('un segundo reenvío dentro de 2 minutos no sale: un doble clic no manda dos PDF', async () => {
  const o = await ordenEnviada();
  await reenvio.reenviar(o.id, { telefono: '8888 8888', preferirDatosProveedor: false });
  await assert.rejects(reenvio.reenviar(o.id, { telefono: '8888 8888', preferirDatosProveedor: true }), (e) => e.status === 409 && /hace un momento/.test(e.message));
  assert.equal(transportes, 1);
});

caso('si WhatsApp no inició el envío, lo dice y queda en el historial como fallido', async () => {
  const o = await ordenEnviada();
  falla = Object.assign(new Error('sin sesión'), { envioNoIniciado: true });
  const r = await reenvio.reenviar(o.id, { telefono: '8888 8888', preferirDatosProveedor: false });
  assert.equal(r.estado, 'no_enviado');
  assert.equal((await bitacora(o.id)).at(-1).accion, 'reenvio_no_enviado');
});

caso('una orden que no se ha enviado no se reenvía; sin elegir la opción, tampoco', async () => {
  const enviada = await ordenEnviada();
  await assert.rejects(reenvio.reenviar(enviada.id, { telefono: '8888 8888' }), (e) => e.status === 400);
  await c.query('ROLLBACK TO SAVEPOINT reenvio_caso');
  const { orden: preparada } = await s.revisarEnvio(await pedido());
  assert.equal(preparada.estado, 'pendiente_enviar');
  await assert.rejects(reenvio.reenviar(preparada.id, { telefono: '8888 8888', preferirDatosProveedor: false }), (e) => e.status === 409 && /ya se envió/.test(e.message));
  await assert.rejects(reenvio.propuesta(preparada.id), (e) => e.status === 409);
  assert.equal(transportes, 0);
});

caso('con las salidas bloqueadas (la base local) no reclama ni manda nada', async () => {
  const o = await ordenEnviada();
  salidaBloqueada = true;
  await assert.rejects(reenvio.reenviar(o.id, { telefono: '8888 8888', preferirDatosProveedor: false }), (e) => e.code === 'SALIDA_BLOQUEADA');
  assert.equal(transportes, 0);
  assert.deepEqual(await bitacora(o.id), []);
});
