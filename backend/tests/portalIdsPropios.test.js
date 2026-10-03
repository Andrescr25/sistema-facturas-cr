/** Portal sobre PostgreSQL local; todos los cambios se deshacen con ROLLBACK. */
const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ quiet: true });
require('../config/aislado').asegurarBaseLocal();
let pool, conexion, servicio, carrito, pedidos, catalogo, sugerencias, saldo, middleware;
let cuentaId, clienteId, ajenoId, productos, fallo = null, avisos = 0;
const secretoAnterior = process.env.JWT_SECRET_CLIENTES;
describe('portal con ids propios — contra PostgreSQL local', () => {
  before(async () => {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');
    let nivel = 0;
    const ejecutar = async (sql, params) => {
      if (fallo && String(sql).includes(fallo)) throw new Error('zz-fallo controlado');
      return conexion.query(sql, params);
    };
    const db = { query: ejecutar, pool: { query: ejecutar, connect: async () => ({
      query: async (sql, params) => {
        if (sql === 'BEGIN') return conexion.query(`SAVEPOINT portal_${++nivel}`);
        if (sql === 'COMMIT') return conexion.query(`RELEASE SAVEPOINT portal_${nivel--}`);
        if (sql === 'ROLLBACK') return conexion.query(`ROLLBACK TO SAVEPOINT portal_${nivel--}`);
        return ejecutar(sql, params);
      }, release() {}
    }) } };
    for (const [nombre, exports] of [['../config/database', db], ['../lib/prisma', {}],
      ['../src/modules/portal-clientes/avisoPedidoNuevo', { avisar: async () => { avisos++; } }]]) {
      const ruta = require.resolve(nombre);
      require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports };
    }
    process.env.JWT_SECRET_CLIENTES = 'zz-secreto-de-prueba-portal-distinto-del-personal';
    servicio = require('../src/modules/portal-clientes/portal-clientes.cliente.service');
    carrito = require('../src/modules/portal-clientes/portal-clientes.carrito.service');
    pedidos = require('../src/modules/portal-clientes/portal-clientes.pedidos.service');
    catalogo = require('../src/modules/catalogo-clientes/catalogo-clientes.service');
    sugerencias = require('../src/modules/portal-clientes/portal-clientes.sugerencias.service');
    saldo = require('../src/modules/portal-clientes/portal-clientes.saldo.service');
    middleware = require('../src/modules/portal-clientes/portal-clientes.middleware');
    const { rows: [c] } = await conexion.query(`INSERT INTO cliente (nombre) VALUES ('zz-portal propio') RETURNING id`);
    const { rows: [otro] } = await conexion.query(`INSERT INTO cliente (nombre) VALUES ('zz-portal ajeno') RETURNING id`);
    clienteId = c.id; ajenoId = otro.id;
    const { rows: [cp] } = await conexion.query(`INSERT INTO cliente_portal (cliente_id, nombre) VALUES ($1, 'zz-portal propio') RETURNING id`, [clienteId]);
    cuentaId = cp.id;
    productos = [];
    for (const tarifa of [0, 1, 2, 13]) {
      const { rows: [imp] } = await conexion.query('SELECT id FROM impuesto WHERE tarifa = $1 AND activo ORDER BY id LIMIT 1', [tarifa]);
      assert.ok(imp, `falta tarifa ${tarifa}`);
      const { rows: [p] } = await conexion.query(`INSERT INTO producto (nombre, precio_sin_iva, impuesto_id) VALUES ($1, 1000, $2) RETURNING id`, [`zz-portal tarifa ${tarifa}`, imp.id]);
      productos.push({ ...p, tarifa });
    }
    await conexion.query(`UPDATE serie_consecutivo s SET siguiente = GREATEST(s.siguiente,
      (SELECT COALESCE(MAX(f.consecutivo), 0) + 1 FROM factura f WHERE f.serie = s.serie AND f.tipo_documento = s.tipo_documento))`);
  });
  beforeEach(async () => { fallo = null; avisos = 0; await conexion.query('SAVEPOINT caso_portal'); });
  afterEach(async () => { fallo = null; await conexion.query('ROLLBACK TO SAVEPOINT caso_portal'); });
  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
    if (secretoAnterior === undefined) delete process.env.JWT_SECRET_CLIENTES;
    else process.env.JWT_SECRET_CLIENTES = secretoAnterior;
  });
  const armar = async () => {
    for (const p of productos) await carrito.ponerCantidad(cuentaId, p.id, 2);
    return servicio.crearPedido(cuentaId, { observaciones: 'zz-pedido de prueba' });
  };
  test('un producto sin Alegra aparece con su id propio y sin costo', async () => {
    const r = await catalogo.listarProductos({ busqueda: 'zz-portal tarifa', porPagina: 120 });
    assert.equal(r.productos.length, 4);
    for (const p of r.productos) {
      assert.ok(productos.some(x => x.id === p.id));
      assert.equal(p.id, p.productoId);
      assert.equal('costo_con_iva' in p, false);
      assert.equal('alegraItemId' in p, false);
    }
  });
  test('invitar, activar y entrar sin Alegra; la invitación es de un uso', async () => {
    const personal = require('../src/modules/portal-clientes/portal-clientes.service');
    const inv = await personal.generarInvitacion(clienteId, null);
    assert.equal((await servicio.verInvitacion(inv.token)).nombre, 'zz-portal propio');
    const r = await servicio.activar(inv.token, { usuario: 'zz-portal-propio', password: 'zz-contrasena-portal' });
    assert.equal(r.cliente.clienteId, clienteId);
    const token = require('jsonwebtoken').verify(r.token, process.env.JWT_SECRET_CLIENTES);
    assert.equal(token.clienteId, clienteId);
    assert.equal('contacto' in token, false);
    await assert.rejects(() => servicio.activar(inv.token, { usuario: 'zz-portal-propio', password: 'zz-contrasena-portal' }), e => e.status === 400);
    assert.equal((await servicio.entrar({ usuario: 'zz-portal-propio', password: 'zz-contrasena-portal' })).cliente.clienteId, clienteId);
  });
  test('un token viejo se resuelve por su cuenta e ignora contacto y clienteId; revocar lo bloquea', async () => {
    const token = require('jsonwebtoken').sign({ sub: String(cuentaId), contacto: String(ajenoId), clienteId: ajenoId }, process.env.JWT_SECRET_CLIENTES);
    const req = { method: 'GET', path: '/yo', headers: { authorization: `Bearer ${token}` } };
    let sigue = false;
    await middleware.requireCliente(req, { status: n => { throw new Error(`estado ${n}`); } }, () => { sigue = true; });
    assert.equal(sigue, true);
    assert.equal(req.cliente.clienteId, clienteId);
    await conexion.query('UPDATE cliente_portal SET activo = FALSE WHERE id = $1', [cuentaId]);
    let codigo;
    await middleware.requireCliente(req, { status(n) { codigo = n; return this; }, json() {} }, () => { throw new Error('una cuenta revocada no entra'); });
    assert.equal(codigo, 403);
  });
  test('carrito → pedido → factura propia, tarifas y total conservados; repetir devuelve la misma', async () => {
    const pedido = await armar();
    assert.equal(pedido.total, 8320);
    assert.equal(avisos, 1);
    assert.equal((await carrito.obtenerCarrito(cuentaId)).lineas.length, 0);
    const factura = await pedidos.facturar(pedido.id, null);
    assert.equal(factura.total, pedido.total);
    const otra = await pedidos.facturar(pedido.id, null);
    assert.equal(otra.facturaId, factura.facturaId);
    assert.equal(otra.yaExistia, true);
    const { rows: [f] } = await conexion.query('SELECT * FROM factura WHERE id = $1', [factura.facturaId]);
    assert.equal(f.cliente_id, clienteId);
    assert.equal(f.alegra_id, null);
    assert.equal(f.estado, 'emitida');
    const { rows: lineas } = await conexion.query('SELECT producto_id, tarifa FROM factura_linea WHERE factura_id = $1', [f.id]);
    assert.deepEqual(lineas.map(l => Number(l.tarifa)).sort((a,b) => a-b), [0,1,2,13]);
    assert.ok(lineas.every(l => productos.some(p => p.id === l.producto_id)));
    assert.equal((await servicio.detallePedido(cuentaId, pedido.id)).etapa, 'en_preparacion');
    await conexion.query("UPDATE factura SET estado_bodega = 'procesado' WHERE id = $1", [f.id]);
    assert.equal((await servicio.detallePedido(cuentaId, pedido.id)).etapa, 'listo_para_envio');
    assert.equal((await saldo.facturasPendientes(clienteId)).total, 8320);
    assert.equal((await saldo.facturasPendientes(ajenoId)).total, 0);
  });
  test('un fallo en las líneas no deja pedido ni vacía el carrito ni avisa', async () => {
    await carrito.ponerCantidad(cuentaId, productos[0].id, 2);
    const previo = (await conexion.query('SELECT COUNT(*)::int n FROM pedido_cliente')).rows[0].n;
    fallo = 'INSERT INTO pedido_cliente_linea';
    await assert.rejects(() => servicio.crearPedido(cuentaId), /zz-fallo/);
    fallo = null;
    assert.equal((await conexion.query('SELECT COUNT(*)::int n FROM pedido_cliente')).rows[0].n, previo);
    assert.equal((await carrito.obtenerCarrito(cuentaId)).lineas.length, 1);
    assert.equal(avisos, 0);
  });
  test('un fallo al marcar el pedido revierte la factura y la numeración', async () => {
    const pedido = await armar();
    const antes = (await conexion.query('SELECT COUNT(*)::int n FROM factura')).rows[0].n;
    const series = (await conexion.query('SELECT id, siguiente FROM serie_consecutivo ORDER BY id')).rows;
    fallo = 'UPDATE pedido_cliente SET estado';
    await assert.rejects(() => pedidos.facturar(pedido.id, null), /zz-fallo/);
    fallo = null;
    assert.equal((await conexion.query('SELECT COUNT(*)::int n FROM factura')).rows[0].n, antes);
    assert.deepEqual((await conexion.query('SELECT id, siguiente FROM serie_consecutivo ORDER BY id')).rows, series);
    assert.equal((await pedidos.detalle(pedido.id)).estado, 'pendiente');
  });
  test('compras y volver a pedir solo para su cliente, sin ids de Alegra', async () => {
    const pedido = await armar();
    const f = await pedidos.facturar(pedido.id, null);
    assert.equal((await sugerencias.comprasAnteriores(clienteId))[0].facturaId, f.facturaId);
    const lineas = await sugerencias.lineasDeCompra(clienteId, f.facturaId);
    assert.ok(lineas.every(l => productos.some(p => p.id === Number(l.productoId))));
    await assert.rejects(() => sugerencias.lineasDeCompra(ajenoId, f.facturaId), e => e.status === 404);
    await assert.rejects(() => sugerencias.detalleCompra(ajenoId, f.facturaId), e => e.status === 404);
    assert.equal((await carrito.agregarVarios(cuentaId, lineas)).total, pedido.total);
    assert.equal((await sugerencias.fichaProducto(clienteId, productos[0].id)).historial.veces, 1);
  });
  test('un cambio de precio conserva el prometido; un cambio de tarifa bloquea', async () => {
    const pedido = await armar();
    await conexion.query('UPDATE producto SET precio_sin_iva = 9999 WHERE id = $1', [productos[0].id]);
    assert.equal((await pedidos.facturar(pedido.id, null)).total, pedido.total);
    const segundo = await armar();
    await conexion.query('UPDATE producto SET impuesto_id = NULL WHERE id = $1', [productos[3].id]);
    await assert.rejects(() => pedidos.facturar(segundo.id, null), e => e.status === 409);
    assert.equal((await pedidos.detalle(segundo.id)).estado, 'pendiente');
  });
  test('precios finales fraccionarios y cantidades grandes conservan cada total al facturar', async () => {
    for (const [indice, base, cantidad] of [[3, 33451.32743, 2], [1, 373.76238, 300], [2, 16.91176, 300]]) {
      await conexion.query('UPDATE producto SET precio_sin_iva=$1 WHERE id=$2', [base, productos[indice].id]);
      const c = await carrito.ponerCantidad(cuentaId, productos[indice].id, cantidad);
      const pedido = await servicio.crearPedido(cuentaId);
      assert.equal(pedido.total, c.total);
      const f = await pedidos.facturar(pedido.id, null);
      assert.equal(f.total, pedido.total);
      const { rows: [linea] } = await conexion.query('SELECT total, impuesto_monto FROM factura_linea WHERE factura_id=$1', [f.facturaId]);
      assert.equal(Number(linea.total), pedido.total);
      assert.ok(Number(linea.impuesto_monto) > 0);
    }
  });
});
