/**
 * Test de comprasAnteriores (portal-clientes.sugerencias.service.js).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * La tarjeta "Volver a pedir" llegó a mostrar el subtotal antes de IVA —un
 * ~13 % menos que la factura real— porque sumaba el precio de las líneas tal
 * cual. Se detectó con la factura 5263 de "La Ecosr Sociedad Anonima
 * (TOSCANA)": ₡279.113 en Alegra, ₡248.353 en la tarjeta. Se arregló
 * reconstruyendo el total (cantidad × precio × la tarifa de hoy del producto).
 *
 * EN ESTA RAMA EL TOTAL SE LEE DEL DOCUMENTO. Desde la migración
 * independencia/034 las compras anteriores salen de las facturas propias, y
 * el total de la tarjeta es `factura.total`: el mismo monto que el cliente ve
 * en su cuenta por cobrar, con el impuesto que se le cobró ese día. No hay
 * nada que reconstruir, y un cambio de tarifa posterior no lo altera.
 *
 * CÓMO SE PRUEBA SIN BASE DE DATOS
 * Se sustituye `query` y se fija la forma de la consulta. Que la consulta
 * corre de verdad contra Postgres está en ventaLinea.test.js.
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
        ultimaConsulta = { sql: String(sql).replace(/\s+/g, ' '), params };
        return { rows: filasSimuladas };
      }
    }
  };

  const svc = require(rutaServicio);
  return { svc, verConsulta: () => ultimaConsulta };
}

describe('comprasAnteriores — el total de la tarjeta es el de la factura', () => {
  test('sale de las facturas propias EMITIDAS del cliente, con el total del documento', async () => {
    const { svc, verConsulta } = cargarServicioConDoble([
      { factura_id: 4321, fecha: new Date('2026-08-18'), productos: 20, total: '279112.86' }
    ]);

    const r = await svc.comprasAnteriores('38', 10);

    const { sql, params } = verConsulta();
    assert.match(sql, /SELECT f\.id AS factura_id, f\.fecha, f\.total/, 'el total es el de la factura, con su impuesto');
    assert.match(sql, /FROM factura f/);
    assert.match(sql, /f\.estado = 'emitida'/, 'una proforma o una anulada no es una compra');
    assert.match(sql, /f\.cliente_id = \(SELECT id FROM cliente WHERE alegra_id = \$1\)/, 'el cliente del portal, por su ficha propia');
    assert.doesNotMatch(sql, /venta_historico|alegra_products_cache/);
    assert.deepEqual(params, ['38', 10]);
    assert.deepEqual(r, [{ facturaId: 4321, fecha: new Date('2026-08-18'), productos: 20, total: 279112.86 }]);
  });

  test('la compra se abre por el id de la factura propia, y solo si es de ESE cliente', async () => {
    const { svc, verConsulta } = cargarServicioConDoble([{ alegra_item_id: '900', cantidad: '2.4' }]);
    const lineas = await svc.lineasDeCompra('38', '4321');
    const { sql, params } = verConsulta();
    assert.match(sql, /FROM venta_linea v/);
    assert.match(sql, /v\.cliente_id = \(SELECT id FROM cliente WHERE alegra_id = \$1\) AND v\.factura_id = \$2/);
    assert.deepEqual(params, ['38', 4321]);
    assert.deepEqual(lineas, [{ alegraItemId: '900', cantidad: 2 }]);
  });

  test('un id de compra que no es un número no llega a la base', async () => {
    const { svc, verConsulta } = cargarServicioConDoble([]);
    await assert.rejects(() => svc.lineasDeCompra('38', 'abc'), (e) => e.status === 404);
    await assert.rejects(() => svc.detalleCompra('38', '1; DROP'), (e) => e.status === 404);
    assert.equal(verConsulta(), null);
  });
});
