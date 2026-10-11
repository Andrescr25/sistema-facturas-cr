/**
 * Una factura cobrada, su cobro anulado, y lo que se puede hacer después —
 * de punta a punta contra la base local de la rama.
 *
 * EL ERROR (2026-10-11, encontrado recorriendo Facturación en el navegador).
 * La pantalla marcaba "Efectivo" sola para todo cliente de contado y las
 * facturas salían cobradas sin que nadie lo decidiera. Para corregir una había
 * que anular su cobro, y al anularlo... la factura seguía bloqueada: el
 * servidor sumaba TODO lo que hubiera en `pago_factura`, también lo de cobros
 * anulados, que no se borran. Respondía "tiene ₡X en cobros aplicados" para
 * siempre y no había manera de editarla ni de anularla.
 *
 * POR QUÉ CONTRA LA BASE. Lo que estaba mal era un JOIN que faltaba. Un doble
 * devuelve el total que se le diga y la prueba pasa igual con el SQL malo.
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

describe('la factura cobrada y su cobro anulado — contra la base local', { skip: hayBase ? false : 'sin DATABASE_URL' }, () => {
  let facturas; let cobros; let consulta;
  let ficha; let producto; let otro; let usuarioId; let efectivo;

  const venta = (extra = {}) => ({
    clienteId: ficha.id,
    items: [{ productoId: producto.id, reference: producto.referencia, name: producto.nombre, quantity: 2, price: 1000, description: 'zz ENTREGADO' }],
    ...extra
  });
  const cobrosDe = async (facturaId) => (await cliente.query(
    `SELECT p.id, p.anulado, pf.monto FROM pago_factura pf JOIN pago p ON p.id = pf.pago_id WHERE pf.factura_id = $1 ORDER BY p.id`,
    [facturaId])).rows;

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    cliente = await pool.connect();
    await cliente.query('BEGIN');

    const rutaDb = require.resolve('../config/database');
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseDePrueba() };
    for (const modulo of ['../src/modules/facturacion/facturaPropia.service', '../src/modules/cuentas-por-cobrar/cobros.service',
      '../src/modules/facturacion/facturaConsulta.service']) delete require.cache[require.resolve(modulo)];
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    cobros = require('../src/modules/cuentas-por-cobrar/cobros.service');
    consulta = require('../src/modules/facturacion/facturaConsulta.service');

    ficha = (await cliente.query(
      `SELECT c.id, c.nombre FROM cliente c WHERE c.activo AND NOT EXISTS (SELECT 1 FROM ciclo_ruta_cliente x WHERE x.cliente_id = c.id) ORDER BY c.id LIMIT 1`)).rows[0];
    const productos = (await cliente.query(
      `SELECT id, nombre, referencia FROM producto WHERE activo AND coalesce(trim(referencia), '') <> '' AND impuesto_id IS NOT NULL ORDER BY id LIMIT 2`)).rows;
    [producto, otro] = productos;
    usuarioId = (await cliente.query('SELECT id FROM usuario WHERE activo ORDER BY id LIMIT 1')).rows[0]?.id;
    efectivo = (await cliente.query(`SELECT id FROM metodo_pago WHERE activo AND clave = 'efectivo'`)).rows[0]?.id;
    assert.ok(ficha && producto && otro && usuarioId && efectivo, 'a la base local le falta un cliente, dos productos, un usuario o el método Efectivo');
  });

  after(async () => {
    await cliente?.query('ROLLBACK').catch(() => {});
    cliente?.release();
    await pool?.end().catch(() => {});
  });

  test('sin cobro pedido, la factura nace SIN cobrar y con todo su saldo', async () => {
    const f = await facturas.crearFactura(venta(), usuarioId);
    assert.deepEqual(await cobrosDe(f.id), [], 'nació con un cobro que nadie pidió');
    const vista = await consulta.obtenerFactura(f.id);
    assert.equal(vista.cobrado, 0);
    assert.equal(vista.saldo, vista.total);
  });

  test('con el cobro pedido, sale cobrada; y así NO se edita ni se anula', async () => {
    const f = await facturas.crearFactura(venta({ metodoPagoId: efectivo, metodoPagoTexto: 'Efectivo', cobro: { metodoPagoId: efectivo } }), usuarioId);
    const [cobro] = await cobrosDe(f.id);
    assert.equal(Number(cobro.monto), Number(f.total));

    await assert.rejects(facturas.anularFactura(f.id, { motivo: 'zz prueba' }, usuarioId),
      (e) => e.status === 409 && /cobros aplicados/.test(e.message) && /anular el cobro/.test(e.message));
    await assert.rejects(facturas.editarFactura(f.id, venta(), usuarioId), (e) => e.status === 409);
  });

  test('el detalle de la factura dice de cuánto es el cobro entero y cuántas facturas cubre', async () => {
    const f = await facturas.crearFactura(venta({ cobro: { metodoPagoId: efectivo } }), usuarioId);
    const vista = await consulta.obtenerFactura(f.id);
    assert.equal(vista.cobros.length, 1);
    assert.equal(vista.cobros[0].anulado, false);
    assert.equal(vista.cobros[0].facturas, 1);
    assert.equal(vista.cobros[0].montoPago, vista.total);
  });

  test('ANULADO EL COBRO, la factura se puede editar — antes quedaba bloqueada para siempre', async () => {
    const f = await facturas.crearFactura(venta({ cobro: { metodoPagoId: efectivo } }), usuarioId);
    const [cobro] = await cobrosDe(f.id);
    await cobros.anularAbono(cobro.id, { motivo: 'zz salió cobrada sin querer' }, usuarioId);

    // El cobro NO se borra: sigue en su tabla, anulado. Es lo que confundía a la guarda.
    assert.deepEqual((await cobrosDe(f.id)).map(c => c.anulado), [true]);

    await facturas.editarFactura(f.id, {
      items: [
        { productoId: producto.id, quantity: 5, price: 1000, description: 'zz ENTREGADO' },
        { productoId: otro.id, reference: otro.referencia, name: otro.nombre, quantity: 1, price: 500 }
      ]
    }, usuarioId);
    const vista = await consulta.obtenerFactura(f.id);
    assert.equal(vista.lineas.length, 2);
    assert.equal(vista.lineas[0].cantidad, 5);
    assert.equal(vista.lineas[0].descripcion, 'zz ENTREGADO', 'editar borró el detalle escrito en la línea');
    assert.equal(vista.cobrado, 0, 'el cobro anulado sigue contando como cobrado');
    assert.equal(vista.saldo, vista.total);
  });

  test('ANULADO EL COBRO, la factura se puede anular', async () => {
    const f = await facturas.crearFactura(venta({ cobro: { metodoPagoId: efectivo } }), usuarioId);
    const [cobro] = await cobrosDe(f.id);
    await cobros.anularAbono(cobro.id, { motivo: 'zz salió cobrada sin querer' }, usuarioId);

    const anulada = await facturas.anularFactura(f.id, { motivo: 'zz prueba: anular después de revertir el cobro' }, usuarioId);
    assert.equal(anulada.estado, 'anulada');
  });

  test('con un cobro anulado y otro vigente, sigue protegida', async () => {
    const f = await facturas.crearFactura(venta({ cobro: { metodoPagoId: efectivo } }), usuarioId);
    const [primero] = await cobrosDe(f.id);
    await cobros.anularAbono(primero.id, { motivo: 'zz se cobró con el método equivocado' }, usuarioId);
    await cobros.registrarAbono({ facturaId: f.id, saldarTotal: true, metodoPagoId: efectivo }, usuarioId);

    assert.deepEqual((await cobrosDe(f.id)).map(c => c.anulado), [true, false]);
    await assert.rejects(facturas.anularFactura(f.id, { motivo: 'zz prueba' }, usuarioId),
      (e) => e.status === 409 && /cobros aplicados/.test(e.message));
  });
});
