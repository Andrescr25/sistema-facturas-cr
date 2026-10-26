/** Operación de catálogo compuesta: PostgreSQL desechable y ROLLBACK. */
const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { baseEnTransaccion } = require('../src/utils/baseEnTransaccion');

describe('catálogo según una proforma revisada', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, () => {
  let pool, c, servicio, categoriaId, subcategoriaId, marcaId, impuestoId, usuario, ids;
  before(async () => {
    const url = new URL(process.env.DATABASE_URL);
    assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
    assert.match(url.pathname, /^\/tachi_codex_[a-z0-9_]+$/);
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 1 });
    c = await pool.connect(); await c.query('BEGIN');
    const ruta = require.resolve('../config/database');
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: baseEnTransaccion(c, 'proforma_test') };
    servicio = require('../src/modules/productos/proformaCatalogo.service');
    categoriaId = (await c.query("INSERT INTO categoria_producto(nombre) VALUES('ZZ proforma catálogo') RETURNING id")).rows[0].id;
    subcategoriaId = (await c.query("INSERT INTO subcategoria(categoria,nombre) VALUES('ZZ proforma catálogo','ZZ llaves') RETURNING id")).rows[0].id;
    marcaId = (await c.query(`INSERT INTO marca_catalogo(subcategoria_id,nombre,imagen) VALUES($1,'ZZ llaves','{"url":"/archivos/marcas/zz.webp"}') RETURNING id`, [subcategoriaId])).rows[0].id;
    impuestoId = (await c.query('SELECT id FROM impuesto WHERE tarifa=13 AND activo LIMIT 1')).rows[0].id;
    usuario = (await c.query('SELECT id FROM usuario ORDER BY id LIMIT 1')).rows[0].id;
    await c.query("INSERT INTO proveedor(nombre,identificacion) VALUES('ZZ proforma','ZZ-COROFIJA')");
    ids = [];
    for (const n of [8, 13, 15]) ids.push((await c.query(`INSERT INTO producto(nombre,referencia,cabys,impuesto_id,categoria_id,subcategoria_id,marca_catalogo_id,precio_sin_iva,costo_con_iva,imagen_url)
      VALUES($1,$2,'4292104010200',$3,$4,$5,$6,1000,500,'/archivos/productos/zz.webp') RETURNING id`, ['ZZ llave ' + n, 'ZZ-VIEJA-' + n, impuestoId, categoriaId, subcategoriaId, marcaId])).rows[0].id);
  });
  beforeEach(() => c.query('SAVEPOINT caso_proforma'));
  afterEach(() => c.query('ROLLBACK TO SAVEPOINT caso_proforma'));
  after(async () => { if (c) { await c.query('ROLLBACK'); c.release(); } await pool?.end(); });
  const plan = () => ({ proforma: 'ZZ-397028', proveedorCedula: 'ZZ-COROFIJA', proveedorNombre: 'ZZ proforma',
    categoriaId, subcategoriaId, marcaId, impuestoId, cabys: '4292104010200', unidad: 'Unid', nombreMarca: 'ZZ Ferrawy',
    actualizarPorMedida: { 8: ids[0] }, retirar: ids.slice(1),
    productos: [8, 6, 13].map(n => ({ medidaMm: n, codigoProveedor: 'ZZ-YOV' + n, nombre: `ZZ FERRAWY LLAVE COROFIJA ${n}MM (C 10)(M 300)`,
      costoSinIva: '200', ivaPorcentaje: 13, margenPorcentaje: 28, costoConIva: '226.00000', precioSinIva: '277.77778', precioConIva: '313.89' })) });
  const foto = async () => ({ productos: (await c.query('SELECT * FROM producto WHERE id=ANY($1::int[]) ORDER BY id', [ids])).rows });
  const contar = async tabla => (await c.query(`SELECT count(*)::int n FROM ${tabla}`)).rows[0].n;

  test('28% real, IVA, creación, retiro sin borrar, relaciones unitarias y bitácora; no compra ni stock', async () => {
    const antes = await foto(), conteos = {};
    for (const t of ['compra', 'compra_linea', 'factura_linea', 'movimiento_inventario', 'costo_historico']) conteos[t] = await contar(t);
    let respaldo;
    const r = await servicio.aplicarPlan(plan(), antes, usuario, async b => { respaldo = b; });
    assert.equal(r.length, 3); assert.equal(r.filter(p => p.creado).length, 2);
    assert.equal(respaldo.productos.length, 3);
    const p = (await c.query('SELECT * FROM producto WHERE id=$1', [ids[0]])).rows[0];
    assert.equal(p.imagen_url, antes.productos[0].imagen_url);
    assert.equal(p.referencia, antes.productos[0].referencia);
    assert.ok(Math.abs((1 - Number(p.costo_con_iva) / (1 + 13 / 100) / Number(p.precio_sin_iva)) * 100 - 28) < 0.00001);
    const retirados = (await c.query('SELECT activo,marca_catalogo_id FROM producto WHERE id=ANY($1::int[])', [ids.slice(1)])).rows;
    assert.ok(retirados.every(p => !p.activo && p.marca_catalogo_id === null));
    const marca = (await c.query('SELECT imagen FROM marca_catalogo WHERE id=$1', [marcaId])).rows[0];
    assert.equal(marca.imagen.url, '/archivos/marcas/zz.webp');
    const relaciones = (await c.query("SELECT * FROM supplier_product_mapping WHERE supplier_cedula='ZZ-COROFIJA'")).rows;
    assert.equal(relaciones.length, 3);
    assert.ok(relaciones.every(m => Number(m.factor_conversion) === 1 && m.alegra_item_id !== null));
    assert.equal((await c.query('SELECT margen_resultante FROM precio_historico WHERE producto_id=$1 ORDER BY id DESC LIMIT 1', [ids[0]])).rows[0].margen_resultante, '28.00');
    for (const t of Object.keys(conteos)) assert.equal(await contar(t), conteos[t], t);
    assert.ok((await contar('bitacora_cambio')) > 0);
    const totalTrasAplicar = await contar('producto');
    await assert.rejects(servicio.aplicarPlan(plan(), antes, usuario, async () => {}), e => e.status === 409);
    assert.equal(await contar('producto'), totalTrasAplicar);
  });
  test('falla al crear una medida y revierte las ediciones e historial previos', async () => {
    const antes = await foto(), h = await contar('precio_historico'), n = await contar('producto');
    const p = plan(); p.cabys = 'inválido';
    await assert.rejects(servicio.aplicarPlan(p, antes, usuario, async () => {}), e => e.status === 400);
    assert.deepEqual(await foto(), antes);
    assert.equal(await contar('producto'), n); assert.equal(await contar('precio_historico'), h);
  });
  test('edición posterior o falta de respaldo impide cualquier escritura', async () => {
    const antes = await foto();
    await assert.rejects(servicio.aplicarPlan(plan(), antes, usuario, async () => { throw new Error('sin respaldo'); }), /sin respaldo/);
    assert.deepEqual(await foto(), antes);
    await c.query('UPDATE producto SET precio_sin_iva=999 WHERE id=$1', [ids[0]]);
    await assert.rejects(servicio.aplicarPlan(plan(), antes, usuario, async () => assert.fail('No debe llegar al respaldo')), e => e.status === 409);
  });
  test('rechaza un código de proveedor asignado a otro producto', async () => {
    await c.query(`INSERT INTO supplier_product_mapping(supplier_name,supplier_cedula,supplier_code,supplier_desc,producto_id,alegra_item_id,alegra_name)
      VALUES('ZZ','ZZ-COROFIJA','ZZ-YOV6','ZZ',$1,'','ZZ')`, [ids[1]]);
    await assert.rejects(servicio.aplicarPlan(plan(), await foto(), usuario, async () => {}), e => e.status === 409);
  });
  test('conserva una presentación agregada a la marca después de revisar el plan', async () => {
    const antes = await foto();
    await c.query(`INSERT INTO producto(nombre,categoria_id,subcategoria_id,marca_catalogo_id,precio_sin_iva)
      VALUES('ZZ agregada después',$1,$2,$3,100)`, [categoriaId, subcategoriaId, marcaId]);
    await assert.rejects(servicio.aplicarPlan(plan(), antes, usuario, async () => assert.fail('No debe guardar ni modificar nada')), e => e.status === 409);
  });
  test('el costo y margen se validan con la tarifa propia y sin confundir empaque con cantidad', () => {
    for (const iva of [0, 1, 2, 4, 8, 13]) {
      const p = plan();
      for (const f of p.productos) {
        f.ivaPorcentaje = iva; f.costoConIva = String(200 * (1 + iva / 100));
        f.precioConIva = String(Math.round(Number(f.precioSinIva) * (1 + iva / 100) * 100) / 100);
      }
      assert.equal(servicio.validarPlan(p).length, 3);
    }
    const p = plan(); p.productos[0].precioSinIva = '256';
    assert.throws(() => servicio.validarPlan(p), e => e.status === 400);
    p.productos[0].precioSinIva = 'NaN';
    assert.throws(() => servicio.validarPlan(p), e => e.status === 400);
  });
});
