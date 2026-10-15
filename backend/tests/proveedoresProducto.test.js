const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');

// El cruce de identidad y la fotografía de compra se comprueban en PostgreSQL
// real con BEGIN/ROLLBACK; un doble no detecta un JOIN con otro producto.
describe('proveedores del producto — PostgreSQL local', () => {
  let pool, db, servicio, productoId, otroId, proveedorId;
  let secuencia = 0;
  const cedula = 'zz-proveedores-ficha';
  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 1 });
    db = await pool.connect();
    await db.query('BEGIN');
    const rutaDb = require.resolve('../config/database');
    const rutaServicio = require.resolve('../src/modules/productos/proveedoresProducto.service');
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db) };
    delete require.cache[rutaServicio];
    servicio = require(rutaServicio);
    productoId = (await db.query("INSERT INTO producto (nombre, referencia, precio_sin_iva) VALUES ('zz-ficha producto', 'zz-FICHA-PROV', 100) RETURNING id")).rows[0].id;
    otroId = (await db.query("INSERT INTO producto (nombre, precio_sin_iva) VALUES ('zz-otro producto', 100) RETURNING id")).rows[0].id;
    proveedorId = (await db.query("INSERT INTO proveedor (nombre, identificacion) VALUES ('zz-proveedor actualizado', $1) RETURNING id", [cedula])).rows[0].id;
  });
  beforeEach(async () => { await db.query('SAVEPOINT caso'); });
  afterEach(async () => { await db.query('ROLLBACK TO SAVEPOINT caso'); });
  after(async () => {
    if (db) { await db.query('ROLLBACK'); db.release(); }
    if (pool) await pool.end();
  });
  const mapeo = async ({ codigo = 'ZZ-CAJA', fiscal = cedula, factor = 1 } = {}) => (
    await db.query(`INSERT INTO supplier_product_mapping
      (supplier_name, supplier_cedula, supplier_code, supplier_desc, producto_id,
       alegra_item_id, alegra_name, factor_conversion)
      VALUES ('zz-nombre antiguo', $1, $2, 'zz-nombre según proveedor', $3, '', '', $4) RETURNING id`,
    [fiscal, codigo, productoId, factor])).rows[0].id;
  async function linea(mapeoId, cambios = {}) {
    const v = { fecha: '2035-02-01', codigo: 'ZZ-CAJA', fiscal: cedula, propio: productoId,
      cantidad: 2, precio: 100, descuento: 0, iva: 26, total: 226,
      estado: 'RELACIONADO', moneda: 'CRC', ...cambios };
    const factura = (await db.query(`INSERT INTO facturas_proveedores
      (clave, numero_consecutivo, fecha_emision, proveedor_nombre, proveedor_cedula,
       total_productos, total_factura, archivo_xml, moneda)
      VALUES ($1, 'zz-ficha', $2, 'zz-proveedor', $3, 1, $4, '<zz/>', $5) RETURNING id`,
    [`zz-ficha-${++secuencia}`, v.fecha, v.fiscal, v.total, v.moneda])).rows[0].id;
    await db.query(`INSERT INTO productos_factura_proveedor
      (factura_id, numero_linea, codigo_proveedor, descripcion, cantidad, unidad_medida,
       precio_unitario, descuento, impuesto, total_linea, producto_id, mapeo_id, estado_relacionado)
      VALUES ($1, 1, $2, 'zz-descripción facturada', $3, 'Unid', $4, $5, $6, $7, $8, $9, $10)`,
    [factura, v.codigo, v.cantidad, v.precio, v.descuento, v.iva, v.total, v.propio, mapeoId, v.estado]);
    return factura;
  }
  const consultar = async () => (await servicio.getRelacionesDeProducto(productoId)).relaciones;
  test('producto sin Alegra y sin proveedores responde vacío; valida 400/404', async () => {
    assert.deepEqual(await servicio.getRelacionesDeProducto(productoId), {
      producto: { id: productoId, reference: 'zz-FICHA-PROV', name: 'zz-ficha producto' }, relaciones: [], total: 0
    });
    await assert.rejects(servicio.getRelacionesDeProducto('1 OR 1=1'), { status: 400 });
    await assert.rejects(servicio.getRelacionesDeProducto(2147483647), { status: 404 });
  });
  test('mapeo sin costo conserva descripción/código; no inventa costo del maestro', async () => {
    await mapeo();
    const [r] = await consultar();
    assert.equal(r.proveedor.nombre, 'zz-proveedor actualizado');
    assert.equal(r.descripcionProveedor, 'zz-nombre según proveedor');
    assert.equal(r.codigoProveedor, 'ZZ-CAJA');
    assert.equal(r.precio, null);
    assert.equal(r.precioProveedor, null);
    assert.equal(r.fechaUltimoCosto, null);
  });
  test('IVA 8 %, descuento y caja de 6 dan costo por unidad propia', async () => {
    await linea(await mapeo({ factor: 6 }), { descuento: 20, iva: 14.4, total: 194.4 });
    const [r] = await consultar();
    assert.equal(r.precio, 16.2);
    assert.equal(r.precioProveedor, 97.2);
    assert.equal(r.factorConversion, 6);
    assert.equal(r.fechaUltimoCosto, '2035-02-01');
    assert.equal(r.descripcionProveedor, 'zz-descripción facturada');
  });
  test('factor fraccionario e IVA 4 % conservan la unidad correcta', async () => {
    await linea(await mapeo({ factor: 0.5 }), { iva: 8, total: 208 });
    const [r] = await consultar();
    assert.equal(r.precio, 208);
    assert.equal(r.precioProveedor, 104);
  });
  test('más de cinco regalías no ocultan el último costo pagado', async () => {
    const m = await mapeo();
    await linea(m);
    for (let i = 2; i <= 9; i++) await linea(m, { fecha: `2035-02-0${i}`, descuento: 200, iva: 0, total: 0 });
    const [r] = await consultar();
    assert.equal(r.precio, 113);
    assert.equal(r.fechaUltimoCosto, '2035-02-01');
  });
  test('solo regalías no inventa costo cero', async () => {
    await linea(await mapeo(), { descuento: 200, iva: 0, total: 0 });
    assert.equal((await consultar())[0].precio, null);
  });
  test('código reasignado e ignoradas/pendientes no aportan costos de otro producto', async () => {
    const m = await mapeo();
    for (const cambios of [{ propio: otroId }, { estado: 'IGNORADO' }, { estado: 'PENDIENTE' }]) await linea(m, cambios);
    assert.equal((await consultar())[0].precio, null);
  });
  test('nombre homónimo/mapeo_id no sustituyen la cédula ni el código de factura', async () => {
    const m = await mapeo();
    await linea(m, { fiscal: 'zz-otro-proveedor' });
    await linea(m, { codigo: 'ZZ-OTRO' });
    await mapeo({ fiscal: 'zz-otro-proveedor', codigo: 'ZZ-SIN-COMPRA' });
    const r = await consultar();
    assert.equal(r.length, 2);
    assert.ok(r.every(x => x.precio === null));
    assert.deepEqual(new Set(r.map(x => x.proveedor.cedula)), new Set([cedula, 'zz-otro-proveedor']));
  });
  async function compra(factura, { estado = 'registrada', propio = productoId, factor = 2 } = {}) {
    const id = (await db.query(`INSERT INTO compra
      (proveedor_id, fecha_emision, total, estado, factura_proveedor_id)
      VALUES ($1, '2035-02-01', 203.4, $2, $3) RETURNING id`, [proveedorId, estado, factura])).rows[0].id;
    await db.query(`INSERT INTO compra_linea
      (compra_id, numero_linea, producto_id, descripcion, codigo_proveedor, cantidad,
       factor_conversion, precio_unitario, descuento, impuesto, total_linea)
      VALUES ($1, 1, $2, 'zz-fotografía de compra', 'ZZ-CAJA', 2, $3, 100, 20, 23.4, 203.4)`, [id, propio, factor]);
  }
  test('compra registrada conserva factor/importes frente a cambios del mapeo', async () => {
    const f = await linea(await mapeo({ factor: 6 }));
    await compra(f);
    const [r] = await consultar();
    assert.equal(r.factorConversion, 2);
    assert.equal(r.precioProveedor, 101.7);
    assert.equal(r.precio, 50.85);
    assert.equal(r.descripcionProveedor, 'zz-fotografía de compra');
  });
  test('compra anulada o de otro producto no aporta costo', async () => {
    const m = await mapeo();
    for (const opciones of [{ estado: 'anulada' }, { propio: otroId }]) await compra(await linea(m), opciones);
    assert.equal((await consultar())[0].precio, null);
  });
  test('facturas exentas conservan USD; no inventa conversión a colones', async () => {
    await linea(await mapeo(), { iva: 0, total: 200, moneda: 'USD' });
    const [r] = await consultar();
    assert.equal(r.precio, 100);
    assert.equal(r.moneda, 'USD');
  });
  test('último comprobante por fecha y códigos distintos conservados separados', async () => {
    const m = await mapeo();
    await linea(m);
    await linea(m, { fecha: '2035-02-02', precio: 200, iva: 0, total: 400 });
    await mapeo({ codigo: 'ZZ-SEGUNDO' });
    const r = await consultar();
    assert.equal(r[0].precio, 200);
    assert.equal(r[0].fechaUltimoCosto, '2035-02-02');
    assert.equal(r[1].precio, null);
  });
});
