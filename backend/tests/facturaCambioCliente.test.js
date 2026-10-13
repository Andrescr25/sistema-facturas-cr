/**
 * Corregir el cliente de una factura ya emitida — contra la base local.
 *
 * EL ERROR (2026-10-13, en producción). El usuario abrió una factura de
 * venta, tocó Editar, eligió otro cliente y al guardar: 500, «Invalid time
 * value». Al cambiar el cliente se recalcula el vencimiento con el plazo del
 * cliente nuevo, sumándole días a la fecha de la factura. Esa fecha se leía
 * con `String(factura.fecha).slice(0, 10)`, y la base no la entrega como
 * texto: el driver devuelve un Date, y eso da "Mon Oct 12".
 *
 * POR QUÉ CONTRA LA BASE. La prueba con dobles tenía la fecha escrita como
 * '2026-09-12' y pasaba. Solo el driver de verdad devuelve lo que rompía.
 *
 * Una sola conexión dentro de BEGIN y ROLLBACK al final; solo con la base
 * LOCAL (config/aislado.js se niega a conectar a otra).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');

require('dotenv').config({ quiet: true });

describe('cambiar el cliente de una factura — contra la base local', { skip: process.env.DATABASE_URL ? false : 'sin DATABASE_URL' }, () => {
  let pool; let conexion; let facturas;
  let original; let aCredito; let deContado; let producto; let usuarioId; let plazo;

  const dia = async (expresion, facturaId) => (await conexion.query(
    `SELECT to_char(${expresion}, 'YYYY-MM-DD') AS d FROM factura WHERE id = $1`, [facturaId])).rows[0].d;
  const leer = async (facturaId) => (await conexion.query(
    `SELECT cliente_id, cliente_nombre, condicion_venta, plazo_credito_id, plazo_texto FROM factura WHERE id = $1`, [facturaId])).rows[0];
  const venta = (cliente) => ({
    clienteId: cliente.id, clienteNombre: cliente.nombre,
    items: [{ productoId: producto.id, reference: producto.referencia, name: producto.nombre, quantity: 1, price: 1000 }]
  });

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');
    const rutaDb = require.resolve('../config/database');
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(conexion, 'cambio') };
    delete require.cache[require.resolve('../src/modules/facturacion/facturaPropia.service')];
    facturas = require('../src/modules/facturacion/facturaPropia.service');

    // Tres clientes que no estén en el recorrido de una ruta (ahí el cliente
    // de la factura no se corrige), y se les fija el plazo para la prueba.
    const clientes = (await conexion.query(
      `SELECT c.id, c.nombre FROM cliente c WHERE c.activo AND NOT EXISTS (SELECT 1 FROM ciclo_ruta_cliente x WHERE x.cliente_id = c.id) ORDER BY c.id LIMIT 3`)).rows;
    [original, aCredito, deContado] = clientes;
    plazo = (await conexion.query('SELECT id, nombre, dias FROM plazo_credito WHERE dias > 0 ORDER BY dias LIMIT 1')).rows[0];
    producto = (await conexion.query(
      `SELECT id, nombre, referencia FROM producto WHERE activo AND coalesce(trim(referencia), '') <> '' AND impuesto_id IS NOT NULL ORDER BY id LIMIT 1`)).rows[0];
    usuarioId = (await conexion.query('SELECT id FROM usuario WHERE activo ORDER BY id LIMIT 1')).rows[0]?.id;
    assert.ok(original && aCredito && deContado && plazo && producto && usuarioId, 'a la base local le faltan tres clientes, un plazo de crédito, un producto o un usuario');
    await conexion.query('UPDATE cliente SET plazo_credito_id = NULL WHERE id = ANY($1::int[])', [[original.id, deContado.id]]);
    await conexion.query('UPDATE cliente SET plazo_credito_id = $2 WHERE id = $1', [aCredito.id, plazo.id]);
  });

  after(async () => {
    await conexion?.query('ROLLBACK').catch(() => {});
    conexion?.release();
    await pool?.end().catch(() => {});
  });

  test('a un cliente con crédito: guarda, y vence a los días de SU plazo desde la fecha de la factura', async () => {
    const f = await facturas.crearFactura(venta(original), usuarioId);
    assert.equal((await leer(f.id)).condicion_venta, 'contado');

    await facturas.editarFactura(f.id, { ...venta(aCredito) }, usuarioId);

    const despues = await leer(f.id);
    assert.equal(despues.cliente_id, aCredito.id, 'no cambió el cliente');
    assert.equal(despues.cliente_nombre, aCredito.nombre);
    assert.deepEqual([despues.condicion_venta, despues.plazo_credito_id, despues.plazo_texto], ['credito', plazo.id, plazo.nombre]);
    assert.equal(await dia('fecha_vencimiento', f.id), await dia(`fecha + ${Number(plazo.dias)}`, f.id), 'el vencimiento no es la fecha más los días del plazo');
  });

  test('a un cliente de contado: guarda, y vence el mismo día de la factura', async () => {
    const f = await facturas.crearFactura(venta(aCredito), usuarioId);
    assert.equal((await leer(f.id)).condicion_venta, 'credito');

    await facturas.editarFactura(f.id, { ...venta(deContado) }, usuarioId);

    const despues = await leer(f.id);
    assert.equal(despues.cliente_id, deContado.id);
    assert.deepEqual([despues.condicion_venta, despues.plazo_credito_id, despues.plazo_texto], ['contado', null, 'De contado']);
    assert.equal(await dia('fecha_vencimiento', f.id), await dia('fecha', f.id));
  });

  test('una factura de otro día conserva SU fecha: el vencimiento no se calcula desde hoy', async () => {
    const f = await facturas.crearFactura(venta(original), usuarioId);
    await conexion.query("UPDATE factura SET fecha = DATE '2026-01-31', fecha_vencimiento = DATE '2026-01-31' WHERE id = $1", [f.id]);

    await facturas.editarFactura(f.id, { ...venta(aCredito) }, usuarioId);

    assert.equal(await dia('fecha', f.id), '2026-01-31', 'cambiar el cliente movió la fecha de la factura');
    // Fin de mes: sumar días tiene que cruzar bien a febrero o marzo.
    assert.equal(await dia('fecha_vencimiento', f.id), await dia(`DATE '2026-01-31' + ${Number(plazo.dias)}`, f.id));
  });

  test('editar sin cambiar el cliente no toca la condición ni el vencimiento', async () => {
    const f = await facturas.crearFactura(venta(aCredito), usuarioId);
    const antes = [await leer(f.id), await dia('fecha_vencimiento', f.id)];
    await facturas.editarFactura(f.id, { ...venta(aCredito), items: [{ productoId: producto.id, quantity: 3, price: 1000 }] }, usuarioId);
    assert.deepEqual([await leer(f.id), await dia('fecha_vencimiento', f.id)], antes);
  });
});
