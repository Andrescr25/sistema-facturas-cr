/**
 * Corregir el producto de una compra ya registrada (2026-11-05).
 *
 * El usuario: «un empleado puede enlazar un producto del proveedor con otro
 * producto nuestro mal; esto repercute en Reporte Clientes, porque sale como
 * que no ingresó pero fue por un error. Que me dejes ver esas facturas de
 * compra ya registradas y editar algo que esté mal».
 *
 * PostgreSQL real, solo en una copia tachi_codex_*: todo corre en una
 * transacción que se deshace. Las compras se registran con el camino de
 * siempre (registrarCompra) sobre una relación equivocada.
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { randomUUID } = require('node:crypto');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');

const activo = process.env.PROBAR_BASE_LOCAL === '1';

describe('corregir el producto de una compra registrada — PostgreSQL local', { skip: !activo }, () => {
  let pool, c, compras, correccion, inv, ingreso, historial;
  let X, Y, mapeoId, cedula, f1, f2, f3, faltanteY;
  const AHORA = "(now() AT TIME ZONE 'America/Costa_Rica')";
  const uno = async (sql, p) => (await c.query(sql, p)).rows[0];
  const lineaDeCompra = (facturaId) => uno(`SELECT cl.* FROM compra_linea cl JOIN compra co ON co.id = cl.compra_id
    WHERE co.factura_proveedor_id = $1`, [facturaId]);
  const existencia = async (id) => Number((await inv.saldo(c, id)).existencia);
  const costo = async (id) => Number((await uno('SELECT costo_con_iva FROM producto WHERE id = $1', [id])).costo_con_iva);
  const disponible = async (faltanteId) => Number((await uno(
    `SELECT ${ingreso.ingresoDisponibleSql('f')} AS d FROM faltantes f WHERE f.id = $1`, [faltanteId])).d);

  async function facturaDelBuzon(estado = 'PROCESADA') {
    const numero = `ZZ-CORR-${randomUUID().slice(0, 8)}`;
    const f = await uno(`INSERT INTO facturas_proveedores(clave,numero_consecutivo,fecha_emision,proveedor_nombre,proveedor_cedula,
      total_productos,total_factura,archivo_xml,estado) VALUES($1,$1,CURRENT_TIMESTAMP,'zz-proveedor corrección',$2,1,226,'zz.xml',$3) RETURNING id`,
    [numero, cedula, estado]);
    await c.query(`INSERT INTO productos_factura_proveedor(factura_id,numero_linea,codigo_proveedor,descripcion,cantidad,unidad_medida,
      precio_unitario,impuesto,total_linea,producto_id,mapeo_id,estado_relacionado)
      VALUES($1,1,'ZZ-C1','NEU.18 325/350x18 VINI (del proveedor)',2,'Unid',100,26,226,$2,$3,'RELACIONADO')`, [f.id, X, mapeoId]);
    return f.id;
  }

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/, 'usar una copia desechable');
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    c = await pool.connect();
    await c.query('BEGIN');
    for (const r of Object.keys(require.cache)) if (r.includes(`${path.sep}src${path.sep}`)) delete require.cache[r];
    const rutaDb = require.resolve('../config/database');
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(c, 'corregir_zz') };
    // El historial de costos lee con Prisma fuera de la transacción: acá solo se anota qué pidió.
    historial = [];
    const rutaHistorial = require.resolve('../src/modules/precios/costoHistorico');
    require.cache[rutaHistorial] = { id: rutaHistorial, filename: rutaHistorial, loaded: true,
      exports: { sincronizarCostoDeLineas: async (ids) => { historial.push(...ids); }, sincronizarCostoDeFactura: async () => {}, sincronizarCostoDeMapeo: async () => {} } };
    compras = require('../src/modules/compras/compras.service');
    correccion = require('../src/modules/compras/corregirProductoCompra');
    inv = require('../src/modules/inventario/inventario.service');
    ingreso = require('../src/modules/missing-items/ingresoFaltante');

    const iva = await uno('SELECT id FROM impuesto WHERE tarifa = 13 AND activo LIMIT 1');
    const producto = async (nombre) => (await uno(`INSERT INTO producto(nombre,referencia,precio_sin_iva,costo_con_iva,impuesto_id,inventariable)
      VALUES($1,$1,300,50,$2,true) RETURNING id`, [`${nombre} ${randomUUID().slice(0, 6)}`, iva.id])).id;
    X = await producto('ZZ NEUMATICO KENDA (equivocado)');
    Y = await producto('ZZ NEUMATICO VINI (el bueno)');
    cedula = `zz-corr-${randomUUID().slice(0, 8)}`;
    await c.query("INSERT INTO proveedor(nombre,identificacion) VALUES('zz-proveedor corrección',$1)", [cedula]);
    mapeoId = (await uno(`INSERT INTO supplier_product_mapping (supplier_name, supplier_cedula, supplier_code, supplier_desc,
      alegra_item_id, alegra_name, producto_id, factor_conversion) VALUES ('zz-proveedor corrección',$1,'ZZ-C1','NEU.18 VINI','','zz',$2,1) RETURNING id`,
    [cedula, X])).id;

    // Un cliente pidió el VINI hace una hora; esperaba en Reporte Clientes.
    const fa = await uno(`INSERT INTO factura(numero,estado,fecha,cliente_nombre,total) VALUES($1,'emitida',CURRENT_DATE,'ZZ CLIENTE',1000) RETURNING id`,
      [`ZZ-F-${randomUUID().slice(0, 8)}`]);
    faltanteY = (await uno(`INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,proveedor_asignado,estado,created_at)
      VALUES($1,$2,2,'parcial','ZZ','pendiente',${AHORA} - interval '1 hour') RETURNING id`, [fa.id, Y])).id;

    f1 = await facturaDelBuzon();
    await compras.registrarCompra(f1, {}, null);
    f2 = await facturaDelBuzon();
    await compras.registrarCompra(f2, {}, null);
    f3 = await facturaDelBuzon(); // todavía sin registrar
  });

  after(async () => { if (c) { await c.query('ROLLBACK'); c.release(); } await pool?.end(); });

  test('así quedó el error: las dos compras le sumaron a KENDA y el VINI «no ingresó»', async () => {
    assert.equal((await lineaDeCompra(f1)).producto_id, X);
    assert.equal(await existencia(X), 4);
    assert.equal(await existencia(Y), 0);
    assert.equal(await disponible(faltanteY), 0);
  });

  test('ver la compra: cómo la llamó el proveedor, a qué producto quedó y la relación de hoy', async () => {
    const { compra, lineas } = await correccion.compraDeFactura(f1);
    assert.equal(compra.estado, 'registrada');
    assert.equal(lineas.length, 1);
    const [l] = lineas;
    assert.equal(l.descripcion, 'NEU.18 325/350x18 VINI (del proveedor)');
    assert.equal(l.codigoProveedor, 'ZZ-C1');
    assert.equal(l.producto.id, X);
    assert.deepEqual([l.relacion.productoId, l.otrasCompras, l.entregas.length, l.costoUnitario], [X, 1, 0, 113]);
    await assert.rejects(correccion.compraDeFactura(f3), (e) => e.status === 404);
  });

  test('corregir SOLO esta línea: la compra, su línea del buzón, el inventario y el costo; Reporte Clientes ya la ve', async () => {
    const l1 = await lineaDeCompra(f1);
    const r = await correccion.corregirProducto(l1.id, { productoId: Y }, null);
    assert.deepEqual([r.cambiadas, r.compras, r.relacionCorregida], [1, 1, false]);
    assert.equal((await lineaDeCompra(f1)).producto_id, Y);
    assert.equal((await lineaDeCompra(f2)).producto_id, X, 'la otra compra no se toca');
    assert.equal((await uno('SELECT producto_id FROM productos_factura_proveedor WHERE factura_id = $1', [f1])).producto_id, Y);
    assert.equal((await uno('SELECT producto_id FROM supplier_product_mapping WHERE id = $1', [mapeoId])).producto_id, X, 'la relación sigue igual');
    assert.deepEqual([await existencia(X), await existencia(Y)], [2, 2]);
    assert.equal(await costo(Y), 113, 'la compra corregida es la última del VINI');
    assert.equal(await disponible(faltanteY), 2, 'el VINI ya ingresó para Reporte Clientes');
    // Y la pantalla avisa que la relación del código dice otra cosa.
    const [l] = (await correccion.compraDeFactura(f1)).lineas;
    assert.deepEqual([l.producto.id, l.relacion.productoId], [Y, X]);
    assert.ok(historial.length > 0, 'pidió actualizar el historial de costos');
  });

  test('corregir TODAS las de ese código: las compras, la relación y la factura del buzón todavía sin registrar', async () => {
    const l2 = await lineaDeCompra(f2);
    const r = await correccion.corregirProducto(l2.id, { productoId: Y, todas: true }, null);
    assert.deepEqual([r.cambiadas, r.relacionCorregida], [1, true]);
    assert.equal((await lineaDeCompra(f2)).producto_id, Y);
    assert.equal((await uno('SELECT producto_id FROM supplier_product_mapping WHERE id = $1', [mapeoId])).producto_id, Y);
    assert.equal((await uno('SELECT producto_id FROM productos_factura_proveedor WHERE factura_id = $1', [f3])).producto_id, Y,
      'la próxima en registrarse ya viene bien');
    assert.deepEqual([await existencia(X), await existencia(Y)], [0, 4]);
    assert.equal(await costo(X), 113, 'al KENDA no le queda otra compra: su costo no se inventa');
  });

  test('no corrige una línea que ya respalda la entrega de un faltante, ni a un producto de baja, ni sin cambio', async () => {
    const l2 = await lineaDeCompra(f2);
    await c.query('INSERT INTO faltante_ingreso(faltante_id,compra_linea_id,cantidad) VALUES($1,$2,1)', [faltanteY, l2.id]);
    await assert.rejects(correccion.corregirProducto(l2.id, { productoId: X }, null),
      (e) => e.status === 409 && /ZZ CLIENTE/.test(e.message) && /Reporte Clientes/.test(e.message));
    assert.equal((await lineaDeCompra(f2)).producto_id, Y, 'no se escribió nada');
    const [l] = (await correccion.compraDeFactura(f2)).lineas;
    assert.equal(l.entregas[0].cliente, 'ZZ CLIENTE');
    await c.query('DELETE FROM faltante_ingreso WHERE compra_linea_id = $1', [l2.id]);

    assert.equal((await correccion.corregirProducto(l2.id, { productoId: Y }, null)).cambiadas, 0, 'el mismo producto no cambia nada');
    await c.query('UPDATE producto SET activo = FALSE WHERE id = $1', [X]);
    await assert.rejects(correccion.corregirProducto(l2.id, { productoId: X }, null), (e) => e.status === 409 && /dado de baja/.test(e.message));
    await c.query('UPDATE producto SET activo = TRUE WHERE id = $1', [X]);
    await assert.rejects(correccion.corregirProducto(l2.id, { productoId: 'x' }, null), (e) => e.status === 400);
  });

  test('cada corrección queda en la bitácora de la compra', async () => {
    const { rows } = await c.query(`SELECT b.accion, b.motivo FROM bitacora_cambio b JOIN compra co ON co.id::text = b.entidad_id
      WHERE b.entidad = 'compra' AND co.factura_proveedor_id IN ($1, $2) AND b.accion = 'editar' ORDER BY b.id`, [f1, f2]);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.motivo === 'corregir el producto de una compra registrada'));
  });

  test('la compra estaba bien y la relación mal: «dejar la relación como esta compra» no mueve inventario', async () => {
    // Alguien volvió a relacionar el código con KENDA después: la relación y el buzón pendiente dicen KENDA.
    await c.query('UPDATE supplier_product_mapping SET producto_id = $2 WHERE id = $1', [mapeoId, X]);
    await c.query('UPDATE productos_factura_proveedor SET producto_id = $2 WHERE factura_id = ANY($1::uuid[])', [[f1, f2, f3], X]);
    const antes = [await existencia(X), await existencia(Y)];
    const l2 = await lineaDeCompra(f2);
    const [vista] = (await correccion.compraDeFactura(f2)).lineas;
    assert.deepEqual([vista.producto.id, vista.relacion.productoId], [Y, X], 'la pantalla lo avisa');

    assert.equal((await correccion.corregirProducto(l2.id, { productoId: Y }, null)).relacionCorregida, undefined, 'sin «todas» no toca la relación');
    const r = await correccion.corregirProducto(l2.id, { productoId: Y, todas: true }, null);
    assert.deepEqual([r.cambiadas, r.relacionCorregida], [0, true]);
    assert.equal((await uno('SELECT producto_id FROM supplier_product_mapping WHERE id = $1', [mapeoId])).producto_id, Y);
    for (const f of [f1, f2, f3]) {
      assert.equal((await uno('SELECT producto_id FROM productos_factura_proveedor WHERE factura_id = $1', [f])).producto_id, Y, 'el buzón sigue a la compra');
    }
    assert.deepEqual([await existencia(X), await existencia(Y)], antes, 'el inventario no se movió');

    // La relación ya está bien, pero Revisión de Precios muestra la línea con otro producto: también se arregla.
    await c.query('UPDATE productos_factura_proveedor SET producto_id = $2 WHERE factura_id = $1', [f1, X]);
    const [conDesfase] = (await correccion.compraDeFactura(f1)).lineas;
    assert.deepEqual([conDesfase.relacion.productoId, conDesfase.revision.productoId], [Y, X]);
    const r2 = await correccion.corregirProducto((await lineaDeCompra(f1)).id, { productoId: Y, todas: true }, null);
    assert.equal(r2.relacionCorregida, true);
    assert.equal((await uno('SELECT producto_id FROM productos_factura_proveedor WHERE factura_id = $1', [f1])).producto_id, Y);
  });

  test('una línea que quedó SIN producto: se le pone el suyo y entra al inventario', async () => {
    const l1 = await lineaDeCompra(f1);
    // Como queda una compra registrada sin producto: esa línea no entró al inventario.
    await c.query('UPDATE compra_linea SET producto_id = NULL WHERE id = $1', [l1.id]);
    await inv.reconciliarDocumentoEn(c, 'compra', l1.compra_id, null);
    const antes = await existencia(Y);
    const r = await correccion.corregirProducto(l1.id, { productoId: Y }, null);
    assert.equal(r.cambiadas, 1);
    assert.equal((await lineaDeCompra(f1)).producto_id, Y);
    assert.equal(await existencia(Y), antes + 2, 'entraron sus 2 unidades');
    await correccion.corregirProducto(l1.id, { productoId: Y }, null);
    assert.equal(await existencia(Y), antes + 2, 'repetir no las cuenta dos veces');
  });

  test('«Compras para revisar» trae la compra que no cuadra, con el motivo, y nunca un gasto', async () => {
    const delas = async () => (await correccion.comprasParaRevisar()).facturas.filter((f) => [f1, f2].includes(f.facturaId));
    assert.deepEqual(await delas(), [], 'ya está todo cuadrado');
    await c.query('UPDATE productos_factura_proveedor SET producto_id = $2 WHERE factura_id = $1', [f2, X]);
    const [f] = await delas();
    assert.equal(f.facturaId, f2);
    assert.deepEqual(f.lineas.map((l) => [l.motivo, l.revision, l.descripcion]),
      [['revision', (await uno('SELECT nombre FROM producto WHERE id = $1', [X])).nombre, 'NEU.18 325/350x18 VINI (del proveedor)']]);
    const { rows: gastos } = await c.query(`SELECT COUNT(*)::int n FROM facturas_proveedores WHERE id = ANY($1::uuid[]) AND estado <> 'ENVIADA'`,
      [(await correccion.comprasParaRevisar()).facturas.map((x) => x.facturaId)]);
    assert.equal(gastos[0].n, 0);
  });
});
