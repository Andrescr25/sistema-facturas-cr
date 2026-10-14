/** Servicios reales, con datos nuevos dentro de BEGIN/ROLLBACK en copia local. */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');

describe('descuento global del cliente — PostgreSQL', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, () => {
  let db; let clientes; let facturas; let condiciones; let ficha; let productos; let usuario;
  const pedido = (items, extra = {}) => ({ clienteId: ficha.id, clienteNombre: ficha.nombre, items, ...extra });
  const linea = (i, discount = 0) => ({ productoId: productos[i].id, price: 100, quantity: 2, discount });
  const crearInterna = (datos) => facturas.crearFacturaEnTransaccion(db, datos, usuario);
  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    db = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
    await db.connect(); await db.query('BEGIN');
    const ruta = require.resolve('../config/database');
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: baseEnTransaccion(db, 'descuento') };
    clientes = require('../src/modules/clientes/clientes.service');
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    condiciones = require('../src/modules/facturacion/descuentoCliente.service');
    usuario = (await db.query('SELECT id FROM usuario ORDER BY id LIMIT 1')).rows[0].id;
    ficha = await clientes.crearCliente({ nombre: 'ZZ Descuento cliente', descuento_global: 5 }, usuario);
    productos = [];
    for (const [nombre, costo, tarifa] of [['Mayor21', 79.1, 13], ['Exacto21', 89.27, 13],
      ['SinCosto', 0, 13], ['IVA1', 70.7, 1], ['Exento', 70, 0]]) {
      const impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa = $1 LIMIT 1', [tarifa])).rows[0];
      assert.ok(impuesto, `hace falta impuesto ${tarifa}% en la copia local`);
      const { rows: [p] } = await db.query(`INSERT INTO producto (nombre, referencia, precio_sin_iva, costo_con_iva, impuesto_id)
        VALUES ($1, $2, 100, $3, $4) RETURNING *`, ['ZZ Descuento ' + nombre, 'ZZ-desc-' + nombre, costo, impuesto.id]);
      productos.push(p);
    }
  });
  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('la ficha guarda el porcentaje y la consulta privada trae costos propios y fiables', async () => {
    const recuperada = await clientes.obtenerCliente(ficha.id);
    assert.equal(recuperada.descuento_global, 5);
    const data = await condiciones.condicionesDelCliente(ficha.id);
    assert.equal(data.porcentaje, 5);
    assert.equal(data.costos.find(p => p.id === productos[0].id).costoSinIva, 70);
    assert.equal(data.costos.some(p => p.id === productos[2].id), false);
  });

  test('persisten los descuentos, impuestos y total correcto, usando el mayor', async () => {
    const factura = await crearInterna(pedido([linea(0), linea(1), linea(2), linea(3, 10), linea(4)]));
    const { rows } = await db.query('SELECT * FROM factura_linea WHERE factura_id = $1 ORDER BY numero_linea', [factura.id]);
    assert.deepEqual(rows.map(r => Number(r.descuento_porcentaje)), [5, 0, 0, 10, 5]);
    assert.deepEqual(rows.map(r => Number(r.tarifa)), [13, 13, 13, 1, 0]);
    assert.equal(Number(factura.descuento), 40);
    assert.equal(Number(factura.total), 1038.5);
  });

  test('la vista previa vencida no consume número, factura ni cobro', async () => {
    const { rows: [antes] } = await db.query("SELECT siguiente FROM serie_consecutivo WHERE tipo_documento = 'factura' AND activo AND NOT electronica LIMIT 1");
    await assert.rejects(facturas.crearFactura(pedido([{ ...linea(0), discount: 5, descuentoBase: 0 }],
      { descuentoClienteRevisado: 10, cobro: { metodoPagoId: 1 } }), usuario), e => e.status === 409);
    const { rows: [despues] } = await db.query("SELECT siguiente FROM serie_consecutivo WHERE tipo_documento = 'factura' AND activo AND NOT electronica LIMIT 1");
    assert.equal(despues.siguiente, antes.siguiente);
  });

  test('editar o reimprimir una factura anterior conserva su descuento, aunque cambie la ficha', async () => {
    const factura = await crearInterna(pedido([linea(0)]));
    await clientes.editarCliente(ficha.id, { descuento_global: 10 }, usuario);
    const editada = await facturas.editarFactura(factura.id, { items: [{ ...linea(0), discount: 5 }], motivo: 'ZZ Conservar venta' }, usuario);
    assert.equal(Number(editada.lineas[0].descuento_porcentaje), 5);
    assert.equal(Number(editada.total), Number(factura.total));
    const nueva = await crearInterna(pedido([linea(0)]));
    assert.equal(Number(nueva.lineas[0].descuento_porcentaje), 10);
    await clientes.editarCliente(ficha.id, { descuento_global: 5 }, usuario);
  });

  test('una cola antigua sin descuento revisado queda pendiente y conserva lo prometido', async () => {
    await assert.rejects(facturas.crearFactura(pedido([linea(0)]), usuario),
      e => e.status === 409 && /Actualizá Facturación/.test(e.message));
  });

  test('reintentar una venta ya guardada conserva su importe aunque cambie la ficha', async () => {
    const datos = pedido([{ ...linea(0), discount: 5, descuentoBase: 0 }], { descuentoClienteRevisado: 5 });
    const clave = require('node:crypto').randomUUID();
    const original = await facturas.crearFactura(datos, usuario, { clave });
    await clientes.editarCliente(ficha.id, { descuento_global: 10 }, usuario);
    const repetida = await facturas.crearFactura(datos, usuario, { clave });
    assert.equal(repetida.id, original.id);
    const { rows: [guardada] } = await db.query('SELECT total, descuento FROM factura WHERE id = $1', [original.id]);
    assert.equal(Number(guardada.total), 214.7);
    assert.equal(Number(guardada.descuento), 10);
    await clientes.editarCliente(ficha.id, { descuento_global: 5 }, usuario);
  });

  test('el historial válido permite costo derivado; cruce contradictorio e inestabilidad excluyen la rebaja', async () => {
    const { rows: [compra] } = await db.query(`INSERT INTO facturas_proveedores
      (clave, numero_consecutivo, fecha_emision, proveedor_nombre, proveedor_cedula, total_productos, total_factura, archivo_xml)
      VALUES ('ZZ-descuento-historial', 'ZZ-descuento-historial', CURRENT_DATE, 'ZZ proveedor descuento', 'ZZ-descuento', 7, 0, '<zz/>') RETURNING id`);
    let numero = 0;
    for (const [indice, costos] of [[2, [79.1]], [0, [200, 200, 200]], [3, [70.7, 70.7, 1000]]]) {
      for (const costo of costos) {
        const { rows: [l] } = await db.query(`INSERT INTO productos_factura_proveedor
          (factura_id, numero_linea, codigo_proveedor, descripcion, cantidad, unidad_medida, precio_unitario, total_linea, producto_id, estado_relacionado)
          VALUES ($1, $2, 'ZZ-descuento', 'ZZ costo descuento', 1, 'Unid', $3, $3, $4, 'RELACIONADO') RETURNING id`,
        [compra.id, ++numero, costo, productos[indice].id]);
        await db.query(`INSERT INTO costo_historico (producto_id, producto_factura_id, fecha, costo_unitario, origen)
          VALUES ($1, $2, CURRENT_DATE, $3, 'factura_proveedor')`, [productos[indice].id, l.id, costo]);
      }
    }
    const data = await condiciones.condicionesDelCliente(ficha.id);
    assert.equal(data.costos.find(p => p.id === productos[2].id).costoSinIva, 70);
    assert.equal(data.costos.some(p => p.id === productos[0].id), false);
    assert.equal(data.costos.some(p => p.id === productos[3].id), false);
  });
});
