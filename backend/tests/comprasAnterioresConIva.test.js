/**
 * Test de comprasAnteriores (portal-clientes.sugerencias.service.js).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * `precio_unitario` en venta_historico es el precio SIN impuesto (así lo
 * manda Alegra en las líneas de factura). La tarjeta "Volver a pedir" sumaba
 * ese precio tal cual, así que mostraba el subtotal antes de IVA — un ~13%
 * menos que la factura real — mientras el modal "Ver y repetir" sí sumaba
 * con impuesto (vía precioConImpuesto, en detalleCompra). Se detectó con la
 * factura 5263 de "La Ecosr Sociedad Anonima (TOSCANA)": ₡279.113 en Alegra,
 * ₡248.353 en la tarjeta.
 *
 * CÓMO SE PRUEBA SIN BASE DE DATOS
 * La suma la hace Postgres, no JS — no se puede probar el cálculo completo
 * sin una base real. Lo que sí se puede fijar es que la consulta siga pidiendo
 * el impuesto: se sustituye `query` (la misma que usa portal-clientes.auth.js,
 * que solo la reexporta de config/database) y se verifica que el SQL una el
 * producto con su impuesto y multiplique por (1 + tarifa/100). Si alguien
 * vuelve a sumar solo precio_unitario, este test lo marca roto antes de que se
 * note en el catálogo.
 *
 * LA TARIFA SALE DEL MAESTRO PROPIO (`producto` + `impuesto`), no de
 * `alegra_products_cache`: es la misma fuente que usan el catálogo, el carrito
 * y el detalle de la compra, para que los tres cuenten el mismo total.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const rutaDb = require.resolve('../config/database');
const rutaAuth = require.resolve('../src/modules/portal-clientes/portal-clientes.auth');
const rutaServicio = require.resolve('../src/modules/portal-clientes/portal-clientes.sugerencias.service');

function cargarServicioConDoble(filasSimuladas = []) {
  // portal-clientes.auth.js reexporta `query` de config/database — si queda
  // cacheado, se lleva pegada la primera base de la corrida y las pruebas
  // siguientes ven los datos de la prueba anterior. Los tres se limpian.
  delete require.cache[rutaDb];
  delete require.cache[rutaAuth];
  delete require.cache[rutaServicio];

  let ultimaConsulta = null;
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true, exports: {
      query: async (sql, params) => {
        ultimaConsulta = { sql, params };
        return { rows: filasSimuladas };
      }
    }
  };

  const svc = require(rutaServicio);
  return { svc, verConsulta: () => ultimaConsulta };
}

describe('comprasAnteriores — el total de la tarjeta incluye impuesto', () => {
  test('la consulta suma con impuesto, no solo el precio sin IVA', async () => {
    const { svc, verConsulta } = cargarServicioConDoble([
      { alegra_invoice_id: 5263, fecha: new Date('2026-08-18'), productos: 20, total: '279112.86' }
    ]);

    await svc.comprasAnteriores('38', 10);

    const { sql, params } = verConsulta();
    assert.match(sql, /LEFT JOIN producto p ON p\.alegra_id = v\.alegra_item_id/, 'debe unir con el maestro propio');
    assert.match(sql, /LEFT JOIN impuesto imp ON imp\.id = p\.impuesto_id/, 'de ahí sale la tarifa');
    assert.match(sql, /1 \+ COALESCE\(imp\.tarifa, 0\) \/ 100/, 'debe multiplicar por (1 + impuesto/100)');
    assert.equal(/alegra_products_cache/.test(sql), false, 'la caché de Alegra ya no es la fuente');
    assert.deepEqual(params, ['38', 10]);
  });

  test('un producto sin impuesto (COALESCE a 0) no rompe la suma', async () => {
    const { svc } = cargarServicioConDoble([
      { alegra_invoice_id: 1, fecha: new Date('2026-01-01'), productos: 1, total: '1000.00' }
    ]);

    const r = await svc.comprasAnteriores('38', 5);
    assert.equal(r[0].total, 1000);
  });
});
