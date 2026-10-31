const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const util = () => import(path.join(__dirname, '../../frontend/src/utils/productosFacturaCobro.js'));

describe('el detalle que se muestra al cobrar', () => {
  test('nombre, código, precio y total con IVA usan los campos del documento', async () => {
    const { productosFacturaCobro } = await util();
    const linea = Object.freeze({ numeroLinea: 2, productoId: 9, nombre: 'TORNILLO', referencia: 'TOR-2',
      cantidad: 3, precioUnitario: 1000, descuentoPorcentaje: 10, impuestoMonto: 351, total: 3051.01 });
    assert.deepEqual(productosFacturaCobro([linea]), [{ id: 2, descripcion: 'TORNILLO', codigo: 'TOR-2',
      cantidad: 3, precioUnitario: 1000, descuento: 10, total: 3051.01 }]);
  });

  test('repetir un producto conserva las dos líneas y un total cero real', async () => {
    const { productosFacturaCobro } = await util();
    const filas = productosFacturaCobro([
      { numeroLinea: 1, productoId: 9, nombre: 'PAGADO', total: 113 },
      { numeroLinea: 2, productoId: 9, descripcion: 'REGALÍA', descuentoPorcentaje: 100, total: 0 }
    ]);
    assert.deepEqual(filas.map(p => p.id), [1, 2]);
    assert.equal(filas[1].descripcion, 'REGALÍA');
    assert.equal(filas[1].total, 0);
    assert.deepEqual(productosFacturaCobro([]), []);
  });
});

describe('productos de una factura bajo el permiso de Cobros — PostgreSQL local', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, () => {
  let c, servidor, servicio, factura, sinLineas, cajero, facturador, jwt, url;
  const token = id => jwt.sign({ sub: String(id), usuario: 'zz-cobros' }, process.env.JWT_SECRET);
  const pedir = (ruta, usuario = cajero) => fetch(url + ruta, { headers: usuario ? { Authorization: `Bearer ${token(usuario)}` } : {} });

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    c = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    await c.query('BEGIN');
    const db = require.resolve('../config/database');
    require.cache[db] = { id: db, filename: db, loaded: true, exports: require('./dobles/buzonEnTransaccion').baseEnTransaccion(c, 'cobro_productos') };
    servicio = require('../src/modules/cuentas-por-cobrar/cobros.service');
    const usuario = async (nombre, modulo) => {
      const { rows: [u] } = await c.query("INSERT INTO usuario(usuario,nombre,password_hash,activo) VALUES($1,$1,'zz',true) RETURNING id", [nombre]);
      await c.query('INSERT INTO usuario_modulo(usuario_id,modulo) VALUES($1,$2)', [u.id, modulo]);
      return u.id;
    };
    cajero = await usuario('zz-cobros-productos', 'cuentas-por-cobrar');
    facturador = await usuario('zz-cobros-facturador', 'facturacion');
    const admin = (await c.query('SELECT id FROM usuario WHERE es_admin ORDER BY id LIMIT 1')).rows[0].id;
    const cliente = (await c.query("INSERT INTO cliente(nombre,activo) VALUES('ZZ Cobro productos',true) RETURNING id")).rows[0].id;
    const impuesto = (await c.query('SELECT id FROM impuesto WHERE tarifa=13 LIMIT 1')).rows[0].id;
    const producto = (await c.query("INSERT INTO producto(nombre,referencia,precio_sin_iva,impuesto_id) VALUES('ZZ TORNILLO','ZZ-COBRO-PROD',1000,$1) RETURNING id", [impuesto])).rows[0].id;
    const crear = () => require('../src/modules/facturacion/facturaPropia.service').crearFactura({ clienteId: cliente,
      items: [{ productoId: producto, quantity: 3, price: 1000, discount: 10 },
        { productoId: producto, quantity: 0.5, price: 1000, discount: 100 }] }, admin);
    factura = await crear();
    sinLineas = await crear();
    await c.query('DELETE FROM factura_linea WHERE factura_id=$1', [sinLineas.id]);
    jwt = require('jsonwebtoken');
    const app = require('express')();
    app.use('/api', require('../src/modules/auth/auth.middleware').requireAuth, require('../src/modules/usuarios/permisos.middleware').requirePermiso);
    app.use('/api/cuentas-por-cobrar', require('../src/modules/cuentas-por-cobrar/cuentas-por-cobrar.routes'));
    app.get('/api/facturacion/facturas/:id', (req, res) => res.json({ success: true }));
    servidor = app.listen(0, '127.0.0.1');
    await new Promise(resolve => servidor.once('listening', resolve));
    url = `http://127.0.0.1:${servidor.address().port}/api`;
  });
  beforeEach(() => c.query('SAVEPOINT detalle_cobro'));
  afterEach(() => c.query('ROLLBACK TO SAVEPOINT detalle_cobro'));
  after(async () => {
    if (servidor) await new Promise(resolve => servidor.close(resolve));
    if (c) { await c.query('ROLLBACK'); await c.end(); }
  });

  test('solo Cobros puede leer las líneas de una factura creada por otra persona', async () => {
    const r = await pedir(`/cuentas-por-cobrar/propios/facturas/${factura.id}/productos`);
    assert.equal(r.status, 200);
    const { data } = await r.json();
    assert.equal(data.length, 2);
    assert.equal(data[0].nombre, 'ZZ TORNILLO');
    assert.equal(data[0].precioUnitario, 1000);
    assert.equal(data[0].total, 3051);
    assert.equal(data[1].cantidad, 0.5);
    assert.equal(data[1].total, 0);
    assert.equal((await pedir(`/facturacion/facturas/${factura.id}`)).status, 403);
  });

  test('sin sesión o sin Cobros no se entrega el detalle', async () => {
    const ruta = `/cuentas-por-cobrar/propios/facturas/${factura.id}/productos`;
    assert.equal((await pedir(ruta, null)).status, 401);
    assert.equal((await pedir(ruta, facturador)).status, 403);
  });

  test('reutiliza la fotografía de venta aunque el producto ya no esté relacionado', async () => {
    await c.query('UPDATE factura_linea SET producto_id=null WHERE factura_id=$1', [factura.id]);
    const lineas = await servicio.productosDeFactura(factura.id);
    assert.equal(lineas[0].nombre, 'ZZ TORNILLO');
    assert.equal(lineas[0].referencia, 'ZZ-COBRO-PROD');
    assert.equal(lineas[0].total, 3051);
  });

  test('distingue factura sin líneas de factura inexistente y valida el id', async () => {
    assert.deepEqual(await servicio.productosDeFactura(sinLineas.id), []);
    await assert.rejects(servicio.productosDeFactura(999999999), e => e.status === 404);
    await assert.rejects(servicio.productosDeFactura('x'), e => e.status === 400);
  });
});
