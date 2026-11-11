/**
 * Cambiar SOLO el descuento de una línea de una factura ya emitida (2026-11-11).
 *
 * El usuario: «aplicar descuento a un producto específico desde factura, que no
 * me deje modificar cantidad ni nada, pero sí editar el descuento».
 *
 * QUÉ SE CUIDA
 *  - Se puede aunque Bodega ya la tomó (Editar sigue bloqueado): la cantidad,
 *    el producto, el precio y el inventario no se mueven.
 *  - La línea y la factura quedan con los mismos montos que si se hubiera
 *    facturado con ese descuento desde el principio.
 *  - Con un cobro parcial se puede; si lo cobrado pasa del total nuevo, no.
 *  - Electrónica o con nota de crédito, no. Queda en la bitácora.
 *
 * Contra la base LOCAL, en una sola transacción que se deshace (las de los
 * módulos se vuelven SAVEPOINT).
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config({ quiet: true });

describe('el descuento de una línea — sin base', () => {
  const { montosDeLinea, armarLineas } = require('../src/modules/facturacion/facturaLineas');
  const { porcentajeValido } = require('../src/modules/facturacion/descuentoLinea.service');

  test('la misma fórmula que al facturar', () => {
    const producto = { id: 1, nombre: 'ZZ', activo: true, tarifa: 13 };
    const armado = armarLineas([{ productoId: 1, quantity: 3, price: 1234.5, discount: 12.5 }], new Map([['1', producto]]), (i) => i.productoId);
    const [l] = armado.lineas;
    assert.deepEqual(montosDeLinea({ cantidad: 3, precio: 1234.5, porcentaje: 12.5, tarifa: 13 }),
      { descuentoMonto: l.descuento_monto, base: armado.subtotal, impuestoMonto: l.impuesto_monto, total: l.total });
  });

  test('el porcentaje va de 0 a 100, a centésimas', () => {
    assert.equal(porcentajeValido('10'), 10);
    assert.equal(porcentajeValido(7.255), 7.26);
    for (const malo of [-1, 101, '', null, undefined, 'diez']) assert.throws(() => porcentajeValido(malo), (e) => e.status === 400);
  });
});

describe('cambiar el descuento de una línea — contra la base local', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, () => {
  let pool; let cliente; let facturas; let descuento; let consulta; let tomada; let notas;
  let ficha; let producto; let otro; let usuarioId; let efectivo;
  const rutaDb = require.resolve('../config/database');

  const venta = (extra = {}) => ({
    clienteId: ficha.id,
    items: [
      { productoId: producto.id, reference: producto.referencia, name: producto.nombre, quantity: 4, price: 1000 },
      { productoId: otro.id, reference: otro.referencia, name: otro.nombre, quantity: 2, price: 2500 }
    ],
    ...extra
  });
  const lineas = async (id) => (await cliente.query(
    'SELECT numero_linea, producto_id, cantidad::float, precio_unitario::float, descuento_porcentaje::float, total::float FROM factura_linea WHERE factura_id = $1 ORDER BY numero_linea', [id])).rows;
  const kardex = async (id) => (await cliente.query(
    "SELECT producto_id, SUM(cantidad)::float AS cantidad FROM movimiento_inventario WHERE origen_tipo = 'factura' AND origen_id = $1 GROUP BY 1 ORDER BY 1", [id])).rows;
  const enBitacora = async (id) => (await cliente.query(
    "SELECT antes, despues, motivo FROM bitacora_cambio WHERE entidad = 'factura' AND entidad_id = $1 AND accion = 'editar' ORDER BY id", [String(id)])).rows;

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 1 });
    cliente = await pool.connect();
    await cliente.query('BEGIN');
    const { baseEnTransaccion } = require('../src/utils/baseEnTransaccion');
    for (const r of Object.keys(require.cache)) if (r.includes('/src/')) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(cliente, 'descuentolinea') };
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    descuento = require('../src/modules/facturacion/descuentoLinea.service');
    consulta = require('../src/modules/facturacion/facturaConsulta.service');
    tomada = require('../src/modules/warehouse/tomadaEnBodega');
    notas = require('../src/modules/facturacion/notaCredito.service');

    ficha = (await cliente.query(
      `SELECT c.id FROM cliente c WHERE c.activo AND COALESCE(c.descuento_global, 0) = 0
          AND NOT EXISTS (SELECT 1 FROM ciclo_ruta_cliente x WHERE x.cliente_id = c.id) ORDER BY c.id LIMIT 1`)).rows[0];
    [producto, otro] = (await cliente.query(
      `SELECT p.id, p.nombre, p.referencia FROM producto p JOIN impuesto i ON i.id = p.impuesto_id
        WHERE p.activo AND i.tarifa = 13 AND coalesce(trim(p.referencia), '') <> '' ORDER BY p.id LIMIT 2`)).rows;
    usuarioId = (await cliente.query('SELECT id FROM usuario WHERE activo ORDER BY id LIMIT 1')).rows[0]?.id;
    efectivo = (await cliente.query(`SELECT id FROM metodo_pago WHERE activo AND clave = 'efectivo'`)).rows[0]?.id;
    assert.ok(ficha && producto && otro && usuarioId && efectivo, 'a la base local le falta un cliente, dos productos al 13 %, un usuario o Efectivo');
  });

  after(async () => {
    await cliente?.query('ROLLBACK').catch(() => {});
    cliente?.release();
    await pool?.end().catch(() => {});
  });

  test('con la factura tomada en Bodega: cambia el descuento y nada más; Editar sigue bloqueado', async () => {
    const f = await facturas.crearFactura(venta(), usuarioId);
    await tomada.tomar(f.id, usuarioId);
    const antes = await lineas(f.id);
    const inventario = await kardex(f.id);

    const r = await descuento.cambiarDescuentoDeLinea(f.id, 1, { descuentoPorcentaje: 10, motivo: 'zz cliente frecuente' }, usuarioId);

    const despues = await lineas(f.id);
    assert.deepEqual(despues.map(l => [l.producto_id, l.cantidad, l.precio_unitario]), antes.map(l => [l.producto_id, l.cantidad, l.precio_unitario]));
    assert.deepEqual(despues.map(l => l.descuento_porcentaje), [10, 0]);
    assert.deepEqual(despues[1], antes[1], 'la otra línea no se tocó');
    assert.deepEqual(await kardex(f.id), inventario, 'el inventario no se movió');
    await assert.rejects(facturas.editarFactura(f.id, venta(), usuarioId), (e) => e.status === 409 && /Bodega/.test(e.message));

    // Igual que si se hubiera facturado con el 10 % desde el principio.
    const igual = await facturas.crearFactura(venta({
      items: [{ ...venta().items[0], discount: 10 }, venta().items[1]] }), usuarioId);
    const vista = await consulta.obtenerFactura(f.id);
    const esperada = await consulta.obtenerFactura(igual.id);
    assert.deepEqual([vista.subtotal, vista.descuento, vista.impuesto, vista.total], [esperada.subtotal, esperada.descuento, esperada.impuesto, esperada.total]);
    assert.equal(r.total, esperada.total);
    assert.equal(vista.saldo, vista.total);

    const [b] = await enBitacora(f.id);
    assert.equal(b.motivo, 'zz cliente frecuente');
    assert.equal(b.antes[`descuento de ${producto.nombre}`], 0);
    assert.equal(b.despues[`descuento de ${producto.nombre}`], 10);
  });

  test('el mismo porcentaje no cambia nada ni ensucia la bitácora', async () => {
    const f = await facturas.crearFactura(venta(), usuarioId);
    const r = await descuento.cambiarDescuentoDeLinea(f.id, 2, { descuentoPorcentaje: 0 }, usuarioId);
    assert.equal(r.sinCambios, true);
    assert.deepEqual(await enBitacora(f.id), []);
  });

  test('con un cobro parcial se puede; si lo cobrado pasa del total nuevo, no, y no queda a medias', async () => {
    const f = await facturas.crearFactura(venta({ cobro: { metodoPagoId: efectivo, monto: 3000 } }), usuarioId);
    await descuento.cambiarDescuentoDeLinea(f.id, 2, { descuentoPorcentaje: 20 }, usuarioId);
    const vista = await consulta.obtenerFactura(f.id);
    assert.equal(vista.cobrado, 3000);
    assert.equal(vista.saldo, Math.round((vista.total - 3000) * 100) / 100);

    const pagada = await facturas.crearFactura(venta({ cobro: { metodoPagoId: efectivo } }), usuarioId);
    const antes = await lineas(pagada.id);
    await assert.rejects(descuento.cambiarDescuentoDeLinea(pagada.id, 1, { descuentoPorcentaje: 5 }, usuarioId),
      (e) => e.status === 409 && /cobrado de más/.test(e.message) && /anular el cobro/.test(e.message));
    assert.deepEqual(await lineas(pagada.id), antes);
  });

  test('electrónica, reservada ante Hacienda o con nota de crédito: no; línea que no existe: 404', async () => {
    const f = await facturas.crearFactura(venta(), usuarioId);
    await cliente.query("UPDATE factura SET electronica = TRUE, hacienda_estado = 'aceptada' WHERE id = $1", [f.id]);
    await assert.rejects(descuento.cambiarDescuentoDeLinea(f.id, 1, { descuentoPorcentaje: 5 }, usuarioId),
      (e) => e.status === 409 && /electrónica/.test(e.message) && /nota de crédito/.test(e.message));

    const reservada = await facturas.crearFactura(venta(), usuarioId);
    await cliente.query("UPDATE factura SET hacienda_estado = 'pendiente' WHERE id = $1", [reservada.id]);
    await assert.rejects(descuento.cambiarDescuentoDeLinea(reservada.id, 1, { descuentoPorcentaje: 5 }, usuarioId),
      (e) => e.status === 409 && /reservada ante Hacienda/.test(e.message));

    const conNota = await facturas.crearFactura(venta(), usuarioId);
    await notas.crearNotaCredito({ facturaId: conNota.id, motivo: 'devolucion', motivoTexto: 'zz prueba', lineas: [{ numeroLinea: 1, cantidad: 1 }] }, usuarioId);
    await assert.rejects(descuento.cambiarDescuentoDeLinea(conNota.id, 2, { descuentoPorcentaje: 5 }, usuarioId),
      (e) => e.status === 409 && /nota de crédito/.test(e.message) && /anular esa nota/.test(e.message));

    const otra = await facturas.crearFactura(venta(), usuarioId);
    await assert.rejects(descuento.cambiarDescuentoDeLinea(otra.id, 9, { descuentoPorcentaje: 5 }, usuarioId), (e) => e.status === 404);
  });
});
