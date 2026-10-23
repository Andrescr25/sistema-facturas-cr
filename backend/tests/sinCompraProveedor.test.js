/**
 * Quitar un producto de las compras, del todo (2026-10-22).
 *
 * QUÉ SE PIDIÓ: «cuando estoy dentro de una orden de compra me deja borrar
 * algún producto, pero estos solo se tachan, necesito poder eliminarlos por
 * completo para ya cerrar esa orden de compra».
 *
 * Lo que se cuida: el producto sale de Reporte Proveedores y de las órdenes
 * nuevas, la tarjeta del proveedor se cierra cuando no le queda nada, el
 * faltante del CLIENTE no cambia, una venta nueva del mismo producto vuelve a
 * aparecer, y no se quita nada con un reporte viejo o de otro proveedor.
 * PostgreSQL local con ROLLBACK.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sembrar } = require('./dobles/ordenesAutomaticas');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
const activo = process.env.PROBAR_BASE_LOCAL === '1';
let pool, c, f, db, bodega, reportes, sinCompra;
const caso = (nombre, fn) => test(nombre, { skip: !activo }, async () => {
  await c.query('SAVEPOINT sin_compra');
  try { await fn(); } finally { await c.query('ROLLBACK TO SAVEPOINT sin_compra'); }
});
if (activo) {
  require('../config/aislado').asegurarBaseLocal();
  assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
  before(async () => {
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL });
    c = await pool.connect(); await c.query('BEGIN'); f = await sembrar(c);
    db = baseEnTransaccion(c, 'sin_compra');
    const ruta = require.resolve('../config/database');
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: db };
    bodega = require('../src/modules/warehouse/bodegaPropia');
    reportes = new (require('../src/modules/reports/report.service'))();
    sinCompra = require('../src/modules/orders-whatsapp/sinCompra.service');
  });
  after(async () => { if (c) { await c.query('ROLLBACK'); c.release(); } await pool?.end(); });
}

const guardar = (i, q, n = 0) => bodega.registrarFaltantes(f.facturas[n], [{ producto_id: f.productos[i], cantidad_faltante: q, tipo_faltante: 'parcial' }]);
async function compra() {
  const r = await reportes.getMissingItemsBySupplier(null, { db, incluirEnviadas: false });
  assert.equal(r.success, true, r.error);
  return r.data.find(p => p.cedula === f.p.identificacion);
}
const ids = (linea) => linea.origenes.map(o => o.faltanteId);
const quitar = (p, linea, cambios = {}) => sinCompra.quitarDeCompras(
  { proveedorNombre: p.nombre, faltanteIds: ids(linea), revisionReporte: p.revisionReporte, ...cambios }, null);

caso('quitarlo lo saca de la compra; sin más productos, la tarjeta del proveedor se cierra', async () => {
  await guardar(0, 5); await guardar(1, 2);
  let p = await compra();
  const [a, b] = p.productos_faltantes;
  assert.equal(await quitar(p, a), ids(a).length);
  p = await compra();
  assert.deepEqual(p.productos_faltantes.map(l => l.producto_id), [b.producto_id], 'tachado ya no: no está');
  assert.equal(await quitar(p, b), 1);
  assert.equal(await compra(), undefined, 'la orden se cierra');
});

caso('el faltante del cliente sigue igual y queda quién lo quitó', async () => {
  await guardar(0, 5);
  const p = await compra(), [linea] = p.productos_faltantes;
  const antes = (await c.query('SELECT estado, cantidad_faltante FROM faltantes WHERE id=ANY($1::int[]) ORDER BY id', [ids(linea)])).rows;
  await quitar(p, linea);
  const despues = (await c.query('SELECT estado, cantidad_faltante FROM faltantes WHERE id=ANY($1::int[]) ORDER BY id', [ids(linea)])).rows;
  assert.deepEqual(despues, antes, 'Reporte Clientes e Impresión lo siguen resolviendo');
  const { rows: [b] } = await c.query("SELECT count(*)::int n FROM bitacora_cambio WHERE entidad='faltante' AND accion='sin_compra' AND entidad_id=ANY($1::text[])", [ids(linea).map(String)]);
  assert.equal(b.n, ids(linea).length);
  assert.equal(await quitar(await compra() || p, linea).catch(e => e.status), 409, 'otra vez: ya no está en la compra');
});

caso('una venta nueva del mismo producto vuelve a aparecer para comprarse', async () => {
  await guardar(0, 5);
  let p = await compra();
  await quitar(p, p.productos_faltantes[0]);
  await guardar(0, 3, 1);
  p = await compra();
  assert.equal(p.productos_faltantes.length, 1);
  assert.equal(p.productos_faltantes[0].cantidad_faltante, 3, 'solo lo nuevo');
});

caso('las órdenes nuevas tampoco lo piden', async () => {
  await guardar(0, 5);
  const p = await compra();
  await quitar(p, p.productos_faltantes[0]);
  const { interno } = require('../src/modules/orders-whatsapp/ordenesCiclo.service');
  const prov = await interno.proveedorEn(c, f.p.id);
  assert.deepEqual(await interno.necesidadesEn(c, prov), []);
});

caso('con un reporte viejo, de otro proveedor o sin revisión no se quita nada', async () => {
  await guardar(0, 5);
  const p = await compra(), [linea] = p.productos_faltantes;
  await guardar(1, 2);
  await assert.rejects(quitar(p, linea), e => e.status === 409, 'el reporte cambió');
  const actual = await compra();
  await assert.rejects(quitar(actual, linea, { faltanteIds: [999999999] }), e => e.status === 409, 'no es de esta compra');
  await assert.rejects(quitar(actual, linea, { revisionReporte: undefined }), e => e.status === 400);
  await assert.rejects(quitar(actual, linea, { faltanteIds: [] }), e => e.status === 400);
  assert.equal((await c.query('SELECT count(*)::int n FROM faltante_sin_compra WHERE faltante_id=ANY($1::int[])', [ids(linea)])).rows[0].n, 0);
});
