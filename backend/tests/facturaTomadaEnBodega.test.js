/**
 * Una factura que Bodega ya tomó no se edita — de punta a punta contra la base
 * local de la rama.
 *
 * LA REGLA (2026-10-23, pedido del usuario): «si hay que quitar algo, nota de
 * crédito; si hay que agregar algo, factura nueva; la única forma de editarla
 * es que no la haya tomado nadie en bodega». El 22/10 la 001000015075 cambió
 * cinco veces de total mientras estaba en el almacén y el papel no coincidía.
 *
 * QUÉ SE CUIDA
 *  - Antes de que Bodega la toque, Facturación sigue editando.
 *  - Tomarla (abrirla), despacharla, reabrir el despacho o registrar lo que
 *    faltó la bloquean, y reabrir NO la libera.
 *  - La consulta lo dice (`tomadaEnBodega`) para que la pantalla no ofrezca Editar.
 *  - EXCEPCIÓN: Impresión sigue ajustando con `editarFacturaEn`.
 *
 * CÓMO NO DEJA RASTRO. Una sola conexión dentro de BEGIN y ROLLBACK al final;
 * las transacciones de los módulos se vuelven SAVEPOINT. Solo con la base
 * LOCAL: config/aislado.js se niega a conectar a otra.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const hayBase = Boolean(process.env.DATABASE_URL);

let pool; let cliente;

/** config/database sustituido: todo por la conexión de la prueba. */
function baseDePrueba() {
  const query = (sql, params) => cliente.query(sql, params);
  let nivel = 0;
  return {
    query,
    pool: {
      query,
      connect: async () => ({
        query: async (sql, params) => {
          const t = String(sql).trim();
          if (t === 'BEGIN') return cliente.query(`SAVEPOINT prueba_${++nivel}`);
          if (t === 'COMMIT') return cliente.query(`RELEASE SAVEPOINT prueba_${nivel--}`);
          if (t === 'ROLLBACK') return cliente.query(`ROLLBACK TO SAVEPOINT prueba_${nivel--}`);
          return cliente.query(sql, params);
        },
        release() {}
      })
    }
  };
}

describe('la factura que Bodega ya tomó — contra la base local', { skip: hayBase ? false : 'sin DATABASE_URL' }, () => {
  let facturas; let consulta; let bodega; let tomada;
  let ficha; let producto; let otro; let usuarioId;

  const venta = () => ({
    clienteId: ficha.id,
    items: [{ productoId: producto.id, reference: producto.referencia, name: producto.nombre, quantity: 2, price: 1000 }]
  });
  const cambio = () => ({
    items: [{ productoId: producto.id, quantity: 1, price: 1000 },
      { productoId: otro.id, reference: otro.referencia, name: otro.nombre, quantity: 1, price: 500 }]
  });
  const noSeEdita = (e) => e.status === 409 && /ya la tomó Bodega/.test(e.message)
    && /nota de crédito/.test(e.message) && /factura nueva/.test(e.message);

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    cliente = await pool.connect();
    await cliente.query('BEGIN');

    const rutaDb = require.resolve('../config/database');
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseDePrueba() };
    for (const modulo of ['../src/modules/facturacion/facturaPropia.service', '../src/modules/facturacion/facturaConsulta.service',
      '../src/modules/warehouse/tomadaEnBodega', '../src/modules/warehouse/vigenciaFactura',
      '../src/modules/warehouse/bodegaPropia']) delete require.cache[require.resolve(modulo)];
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    consulta = require('../src/modules/facturacion/facturaConsulta.service');
    bodega = require('../src/modules/warehouse/bodegaPropia');
    tomada = require('../src/modules/warehouse/tomadaEnBodega');

    ficha = (await cliente.query(
      `SELECT c.id, c.nombre FROM cliente c WHERE c.activo AND NOT EXISTS (SELECT 1 FROM ciclo_ruta_cliente x WHERE x.cliente_id = c.id) ORDER BY c.id LIMIT 1`)).rows[0];
    const productos = (await cliente.query(
      `SELECT id, nombre, referencia FROM producto WHERE activo AND coalesce(trim(referencia), '') <> '' AND impuesto_id IS NOT NULL ORDER BY id LIMIT 2`)).rows;
    [producto, otro] = productos;
    usuarioId = (await cliente.query('SELECT id FROM usuario WHERE activo ORDER BY id LIMIT 1')).rows[0]?.id;
    assert.ok(ficha && producto && otro && usuarioId, 'a la base local le falta un cliente, dos productos o un usuario');
  });

  after(async () => {
    await cliente?.query('ROLLBACK').catch(() => {});
    cliente?.release();
    await pool?.end().catch(() => {});
  });

  test('mientras nadie la toma en Bodega, Facturación la edita', async () => {
    const f = await facturas.crearFactura(venta(), usuarioId);
    assert.equal((await consulta.obtenerFactura(f.id)).tomadaEnBodega, false);
    await facturas.editarFactura(f.id, cambio(), usuarioId);
    assert.equal((await consulta.obtenerFactura(f.id)).lineas.length, 2);
  });

  test('abrirla en Bodega la bloquea, y la consulta lo dice (en el detalle y en la lista)', async () => {
    const f = await facturas.crearFactura(venta(), usuarioId);
    assert.deepEqual(await tomada.tomar(f.id, usuarioId), { factura_id: f.id, tomada: true });

    await assert.rejects(facturas.editarFactura(f.id, cambio(), usuarioId), noSeEdita);
    assert.equal((await consulta.obtenerFactura(f.id)).lineas.length, 1, 'el rechazo dejó la factura a medias');
    assert.equal((await consulta.obtenerFactura(f.id)).tomadaEnBodega, true);
    const enLista = (await consulta.listarFacturas({ buscar: f.numero })).data.find((x) => x.id === f.id);
    assert.equal(enLista.tomadaEnBodega, true);
  });

  test('abrirla dos veces no duplica la marca, y la guarda con quién la tomó', async () => {
    const f = await facturas.crearFactura(venta(), usuarioId);
    await tomada.tomar(f.id, usuarioId);
    await tomada.tomar(f.id, null);
    const { rows } = await cliente.query('SELECT usuario_id FROM factura_en_bodega WHERE factura_id = $1', [f.id]);
    assert.deepEqual(rows, [{ usuario_id: usuarioId }]);
  });

  test('despacharla la bloquea, y reabrir el despacho NO la libera', async () => {
    const f = await facturas.crearFactura(venta(), usuarioId);
    await bodega.actualizarEstado(f.id, { estado: 'procesado', usuarioId });
    await assert.rejects(facturas.editarFactura(f.id, cambio(), usuarioId), noSeEdita);

    await bodega.actualizarEstado(f.id, { estado: 'pendiente', usuarioId });
    await assert.rejects(facturas.editarFactura(f.id, cambio(), usuarioId), noSeEdita);
    assert.equal((await consulta.obtenerFactura(f.id)).tomadaEnBodega, true);
  });

  test('registrar lo que faltó también la toma, aunque el aviso de «abrió» no llegara', async () => {
    const f = await facturas.crearFactura(venta(), usuarioId);
    await bodega.registrarFaltantes(f.id, [], 'Bodega', usuarioId);
    await assert.rejects(facturas.editarFactura(f.id, cambio(), usuarioId), noSeEdita);
  });

  test('una factura con faltantes ya registrados cuenta como tomada, aunque no tenga marca', async () => {
    const f = await facturas.crearFactura(venta(), usuarioId);
    await cliente.query(
      `INSERT INTO faltantes (factura_propia_id, producto_propio_id, cantidad_faltante, tipo_faltante, registrado_por, estado)
       VALUES ($1, $2, 1, 'parcial', 'zz prueba', 'pendiente')`, [f.id, producto.id]);
    assert.equal(await tomada.estaTomadaEn(cliente, f.id), true);
    await assert.rejects(facturas.editarFactura(f.id, cambio(), usuarioId), noSeEdita);
  });

  test('EXCEPCIÓN: Impresión sigue ajustando una factura que Bodega tomó', async () => {
    const f = await facturas.crearFactura(venta(), usuarioId);
    await tomada.tomar(f.id, usuarioId);
    await bodega.actualizarEstado(f.id, { estado: 'procesado', usuarioId });

    await facturas.editarFacturaEn(cliente, f.id, cambio(), usuarioId);
    assert.equal((await consulta.obtenerFactura(f.id)).lineas.length, 2);
  });

  test('tomar una factura que no existe o con un id malo responde con error, no con una marca', async () => {
    await assert.rejects(tomada.tomar('abc', usuarioId), (e) => e.status === 400);
    await assert.rejects(tomada.tomar(2147483000, usuarioId), (e) => e.status === 404 || e.status === 409);
  });
});
