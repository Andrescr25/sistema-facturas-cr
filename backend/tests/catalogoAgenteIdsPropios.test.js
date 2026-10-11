/** Integración real, solo PostgreSQL local: cada caso termina en ROLLBACK. */
const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ quiet: true });
require('../config/aislado').asegurarBaseLocal();
let pool, conexion, catalogo, nuevos, agente, pedidos;
let fallo, clienteId, productoId, otroClienteId, otroProductoId;

describe('tablet con ids propios — contra PostgreSQL local', () => {
  before(async () => {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');
    let nivel = 0;
    const ejecutar = (sql, params) => {
      if (fallo && String(sql).includes(fallo)) throw new Error('zz-fallo controlado');
      return conexion.query(sql, params);
    };
    const db = { query: ejecutar, pool: { query: ejecutar, connect: async () => ({
      query: (sql, params) => {
        if (sql === 'BEGIN') return conexion.query(`SAVEPOINT agente_${++nivel}`);
        if (sql === 'COMMIT') return conexion.query(`RELEASE SAVEPOINT agente_${nivel--}`);
        if (sql === 'ROLLBACK') return conexion.query(`ROLLBACK TO SAVEPOINT agente_${nivel--}`);
        return ejecutar(sql, params);
      }, release() {}
    }) } };
    for (const [nombre, exports] of [['../config/database', db], ['../lib/prisma', {}]]) {
      const ruta = require.resolve(nombre);
      require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports };
    }
    catalogo = require('../src/modules/catalogo-agente/catalogo-agente.service');
    nuevos = require('../src/modules/inventario-auditorias/productosNuevos');
    agente = require('../src/modules/catalogo-agente/pedidos-agente.service');
    pedidos = require('../src/modules/portal-clientes/portal-clientes.pedidos.service');
    // Mismo NÚMERO en dos espacios de ids, pero fichas distintas: la prueba
    // detecta una traducción ambigua incluso si ambas fichas son válidas.
    clienteId = 999900002; productoId = 999900001;
    await conexion.query("INSERT INTO cliente (id, nombre) VALUES ($1, 'zz-tablet propio')", [clienteId]);
    otroClienteId = (await conexion.query("INSERT INTO cliente (nombre, alegra_id) VALUES ('zz-tablet antiguo', $1) RETURNING id", [String(clienteId)])).rows[0].id;
    const imp13 = (await conexion.query('SELECT id FROM impuesto WHERE tarifa=13 AND activo LIMIT 1')).rows[0].id;
    const imp1 = (await conexion.query('SELECT id FROM impuesto WHERE tarifa=1 AND activo LIMIT 1')).rows[0].id;
    await conexion.query("INSERT INTO producto (id, nombre, precio_sin_iva, impuesto_id) VALUES ($1, 'zz-tablet propio', 1000, $2)", [productoId, imp13]);
    otroProductoId = (await conexion.query("INSERT INTO producto (nombre, alegra_id, precio_sin_iva, impuesto_id) VALUES ('zz-tablet antiguo', $1, 2000, $2) RETURNING id", [String(productoId), imp1])).rows[0].id;
    await conexion.query(`UPDATE serie_consecutivo s SET siguiente = GREATEST(s.siguiente,
      (SELECT COALESCE(MAX(f.consecutivo),0)+1 FROM factura f WHERE f.serie=s.serie AND f.tipo_documento=s.tipo_documento))`);
  });
  beforeEach(async () => { fallo = null; await conexion.query('SAVEPOINT caso_tablet'); });
  afterEach(async () => { fallo = null; await conexion.query('ROLLBACK TO SAVEPOINT caso_tablet'); });
  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });
  const propio = (clave = 'zz-tablet-propio') => ({ clienteId, claveIdempotencia: clave,
    clienteNombre: 'Nombre manipulado', lineas: [{ productoId, cantidad: 2, precio: 1, taxPercentage: 0 }] });

  test('producto y cliente sin Alegra entran; el cliente sin compras tiene p:[]', async () => {
    const visibles = (await conexion.query('SELECT COUNT(*)::int n FROM producto WHERE activo AND NOT oculto AND precio_sin_iva>0')).rows[0].n;
    let producto;
    for (let start = 0; start < visibles; start += 30) {
      const pagina = await catalogo.listarProductos({ start });
      assert.equal(pagina.versionIds, 'propios-v1');
      producto ||= pagina.products.find(p => p.productoId === productoId);
    }
    assert.equal(producto.id, String(productoId));
    for (const campo of ['alegraItemId', 'costo_con_iva', 'inventory']) assert.equal(campo in producto, false);
    const historial = await catalogo.obtenerHistorialParaCatalogo();
    assert.deepEqual(historial.clientes.find(c => c.id === String(clienteId)), { id: String(clienteId), n: 'zz-tablet propio', p: [] });
  });
  test('lista manual propia: doble toque, búsqueda, baja de visibilidad y retiro por registro', async () => {
    assert.equal((await nuevos.agregar(productoId, 'zz-personal')).yaEstaba, false);
    assert.equal((await nuevos.agregar(productoId, 'zz-personal')).yaEstaba, true);
    const registro = (await nuevos.listar()).find(n => n.productoId === productoId);
    assert.notEqual(registro.registroId, productoId);
    assert.equal(registro.visibleEnCatalogo, true);
    assert.ok((await nuevos.buscar('zz-tablet')).some(p => p.productoId === productoId));
    assert.ok((await nuevos.idsParaCatalogo()).some(n => n.productoId === productoId));
    await conexion.query('UPDATE producto SET oculto=TRUE WHERE id=$1', [productoId]);
    assert.equal((await nuevos.listar()).find(n => n.registroId === registro.registroId).visibleEnCatalogo, false);
    assert.equal((await nuevos.idsParaCatalogo()).some(n => n.productoId === productoId), false);
    await nuevos.quitar(registro.registroId);
    assert.equal((await nuevos.listar()).some(n => n.registroId === registro.registroId), false);
  });
  test('pedido propio → factura: maestro, IVA, total e historial; reenviar conserva el original', async () => {
    const r = await agente.crear(null, propio());
    assert.equal(r.pedido.cliente_id, clienteId);
    assert.equal(r.pedido.cliente_nombre, 'zz-tablet propio');
    assert.equal(Number(r.pedido.total), 2260);
    assert.equal(r.pedido.alegra_contact_id, null);
    await conexion.query('UPDATE producto SET precio_sin_iva=9999 WHERE id=$1', [productoId]);
    const repetido = await agente.crear(null, propio());
    assert.equal(repetido.yaExistia, true);
    assert.equal(repetido.pedido.id, r.pedido.id);
    const factura = await pedidos.facturar(r.pedido.id, null);
    assert.equal(factura.total, 2260);
    assert.equal((await pedidos.facturar(r.pedido.id, null)).facturaId, factura.facturaId);
    const linea = (await conexion.query('SELECT producto_id, tarifa FROM factura_linea WHERE factura_id=$1', [factura.facturaId])).rows[0];
    assert.equal(linea.producto_id, productoId);
    assert.equal(Number(linea.tarifa), 13);
    const historial = await catalogo.obtenerHistorialParaCatalogo();
    assert.equal(historial.clientes.find(c => c.id === String(clienteId)).p[0][0], String(productoId));
  });
  test('una cola antigua resuelve exclusivamente alegra_id, aunque coincida con otro id propio', async () => {
    const entrada = { alegraContactId: String(clienteId), claveIdempotencia: 'zz-tablet-antiguo',
      lineas: [{ alegraItemId: String(productoId), cantidad: 1 }] };
    const r = await agente.crear(null, entrada);
    assert.equal(r.pedido.cliente_id, otroClienteId);
    assert.equal(Number(r.pedido.total), 2020);
    const linea = (await conexion.query('SELECT producto_id, alegra_item_id FROM pedido_cliente_linea WHERE pedido_id=$1', [r.pedido.id])).rows[0];
    assert.equal(linea.producto_id, otroProductoId);
    assert.equal(linea.alegra_item_id, String(productoId));
    assert.equal((await agente.crear(null, entrada)).pedido.id, r.pedido.id);
    await assert.rejects(() => agente.crear(null, { ...propio('zz-mezcla'), alegraContactId: String(clienteId) }), e => e.status === 400);
    await assert.rejects(() => agente.crear(null, { ...propio('zz-mezcla-linea'), lineas: entrada.lineas }), e => e.status === 400);
    await assert.rejects(() => agente.crear(null, { ...entrada, alegraContactId: 'zz-sin-ficha', claveIdempotencia: 'zz-no-adivinar' }), e => e.status === 409);
  });
  test('fallo de líneas revierte cabecera y clave; el siguiente envío queda completo', async () => {
    fallo = 'INSERT INTO pedido_cliente_linea';
    await assert.rejects(() => agente.crear(null, propio('zz-rollback-agente')), /zz-fallo/);
    fallo = null;
    assert.equal((await conexion.query("SELECT COUNT(*)::int n FROM pedido_cliente WHERE clave_idempotencia='zz-rollback-agente'")).rows[0].n, 0);
    const r = await agente.crear(null, propio('zz-rollback-agente'));
    assert.equal(r.yaExistia, false);
    assert.equal((await conexion.query('SELECT COUNT(*)::int n FROM pedido_cliente_linea WHERE pedido_id=$1', [r.pedido.id])).rows[0].n, 1);
  });
  test('rotación A/B incluye el producto sin Alegra vendido en factura propia', async () => {
    const entrada = propio('zz-rotacion-agente');
    entrada.lineas[0].cantidad = 10000000;
    const r = await agente.crear(null, entrada);
    await pedidos.facturar(r.pedido.id, null);
    const rotacion = await catalogo.obtenerRotacion();
    assert.equal(rotacion.versionIds, 'propios-v1');
    assert.ok(rotacion.A.includes(String(productoId)));
  });
  test('036 concilia por referencia histórica, conserva huérfanos y es repetible', async () => {
    await conexion.query('DROP TABLE producto_nuevo_catalogo');
    await conexion.query(`CREATE TABLE producto_nuevo_catalogo (
      alegra_item_id VARCHAR(100) PRIMARY KEY, agregado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, agregado_por VARCHAR(255))`);
    await conexion.query("INSERT INTO producto_nuevo_catalogo (alegra_item_id) VALUES ($1), ('zz-huerfano')", [String(productoId)]);
    // El BEGIN/COMMIT del archivo se sustituye por el SAVEPOINT del caso:
    // también el DDL vuelve al esquema anterior al terminar esta prueba.
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/independencia/036_catalogo_agente_con_ids_propios.sql'), 'utf8')
      .replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
    await conexion.query(sql);
    await conexion.query(sql);
    const filas = (await conexion.query('SELECT * FROM producto_nuevo_catalogo ORDER BY alegra_item_id')).rows;
    assert.equal(filas.find(n => n.alegra_item_id === String(productoId)).producto_id, otroProductoId);
    const huerfano = filas.find(n => n.alegra_item_id === 'zz-huerfano');
    assert.equal(huerfano.producto_id, null);
    assert.equal((await nuevos.listar()).find(n => n.registroId === huerfano.id).visibleEnCatalogo, false);
    await nuevos.quitar(huerfano.id);
    await nuevos.agregar(productoId);
    assert.ok((await nuevos.idsParaCatalogo()).some(n => n.productoId === productoId));
  });
});
