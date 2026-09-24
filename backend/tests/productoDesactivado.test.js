const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Un producto desactivado no se factura.
 *
 * DE DÓNDE SALE. El 14 de setiembre de 2026 se facturó "DISCO 1000 HOJAS
 * LIJAR" (ref 10156), que estaba desactivado en Alegra por ser un duplicado de
 * "DISCO 4 1/2 1000 HOJAS LIJAR." (ref D1000). Además de ser el producto
 * equivocado, costaba ₡775 en vez de ₡515: al cliente se le cobró de más.
 *
 * Facturación pedía a Alegra TODOS los productos, sin filtrar por estado,
 * mientras el catálogo de clientes y el interno sí filtraban por
 * `status = 'active'`. Era la única pantalla sin esa regla.
 *
 * DOS DEFENSAS, PORQUE UNA NO ALCANZA:
 *   · el catálogo que baja al dispositivo ya no los trae;
 *   · el servidor los rechaza igual, porque una tablet que bajó el catálogo
 *     ANTES de que el producto se desactivara lo sigue ofreciendo.
 */

const rutaDb = require.resolve('../config/database');
const rutaCliente = require.resolve('../src/integrations/alegra');
const rutaIdem = require.resolve('../src/modules/facturacion/idempotencia');
const rutaServicio = require.resolve('../src/modules/facturacion/facturacion.service');

const FACTURA = {
  client: 19,
  date: '2026-09-14',
  items: [
    { id: 1018, quantity: 4, price: 450, tax: [{ id: '1' }] },
    { id: 1437, quantity: 4, price: 775, tax: [{ id: '1' }] }
  ]
};

/**
 * @param {Array} desactivados  filas que devuelve el catálogo local para la
 *   consulta de productos que NO están activos
 */
function montar({ desactivados = [], itemsDeAlegra = null } = {}) {
  for (const r of [rutaDb, rutaCliente, rutaIdem, rutaServicio]) delete require.cache[r];

  const registro = { posts: 0, consultas: [] };

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        registro.consultas.push({ sql, params });
        if (/FROM alegra_products_cache/.test(sql)) return { rows: desactivados };
        return { rows: [] };
      }
    }
  };

  require.cache[rutaCliente] = {
    id: rutaCliente, filename: rutaCliente, loaded: true,
    exports: {
      getClient: () => ({
        request: async (metodo, ruta, params) => {
          if (metodo === 'GET' && ruta === '/items') {
            registro.paramsItems = params;
            return itemsDeAlegra || [];
          }
          registro.posts++;
          return { id: 7001, numberTemplate: { fullNumber: '001-7001' }, total: 4900 };
        }
      })
    }
  };

  const Servicio = require(rutaServicio);
  return { servicio: new Servicio(), registro };
}

describe('el servidor no deja facturar un desactivado', () => {
  test('rechaza la factura y dice cuál producto es', async () => {
    const { servicio, registro } = montar({
      desactivados: [{ alegra_id: '1437', name: 'DISCO 1000 HOJAS LIJAR' }]
    });

    await assert.rejects(
      servicio.createInvoice(FACTURA, 'clave-1'),
      (e) => e.status === 400 && /DISCO 1000 HOJAS LIJAR/.test(e.message)
    );
    assert.equal(registro.posts, 0, 'no puede llegar a Alegra');
  });

  test('el mensaje dice qué hacer, no solo que no se puede', async () => {
    const { servicio } = montar({
      desactivados: [{ alegra_id: '1437', name: 'DISCO 1000 HOJAS LIJAR' }]
    });

    await assert.rejects(
      servicio.createInvoice(FACTURA, 'clave-2'),
      (e) => /duplicado|producto bueno/.test(e.message)
    );
  });

  test('si son varios, los nombra a todos', async () => {
    const { servicio } = montar({
      desactivados: [
        { alegra_id: '1437', name: 'DISCO 1000 HOJAS LIJAR' },
        { alegra_id: '1018', name: 'BROCHA 3' }
      ]
    });

    await assert.rejects(
      servicio.createInvoice(FACTURA, 'clave-3'),
      (e) => /DISCO 1000 HOJAS LIJAR/.test(e.message) && /BROCHA 3/.test(e.message)
    );
  });

  test('se revisa ANTES de reservar la clave de idempotencia', async () => {
    // Una factura que no se puede armar no tiene por qué dejar un intento
    // registrado: después ese intento confundiría al reenviarla.
    const { servicio, registro } = montar({
      desactivados: [{ alegra_id: '1437', name: 'DISCO 1000 HOJAS LIJAR' }]
    });

    await assert.rejects(servicio.createInvoice(FACTURA, 'clave-4'));
    assert.ok(
      !registro.consultas.some(c => /factura_intento/i.test(c.sql)),
      'quedó un intento registrado de una factura que nunca se mandó'
    );
  });
});

describe('lo que SÍ pasa', () => {
  test('con todos activos, la factura sale', async () => {
    const { servicio, registro } = montar({ desactivados: [] });

    const r = await servicio.createInvoice(FACTURA, null);

    assert.equal(r.data.id, 7001);
    assert.equal(registro.posts, 1);
  });

  test('un producto que no está en la copia NO bloquea la venta', async () => {
    // Puede ser nuevo y no haber entrado en la última sincronización.
    // Bloquear por no saber sería peor que el problema que se arregla.
    const { servicio, registro } = montar({ desactivados: [] });

    await servicio.createInvoice({ ...FACTURA, items: [{ id: 99999, quantity: 1, price: 100 }] }, null);
    assert.equal(registro.posts, 1);
  });

  test('una factura sin líneas no consulta el catálogo', async () => {
    const { servicio, registro } = montar({ desactivados: [] });

    await servicio.createInvoice({ ...FACTURA, items: [] }, null);
    assert.ok(!registro.consultas.some(c => /alegra_products_cache/.test(c.sql)));
  });
});

describe('el catálogo que baja al dispositivo', () => {
  test('se le piden a Alegra solo los activos', async () => {
    const { servicio, registro } = montar({
      itemsDeAlegra: [{ id: 1, name: 'UNO', status: 'active' }]
    });

    await servicio.getItems();

    assert.equal(registro.paramsItems.status, 'active');
    assert.equal(registro.paramsItems.type, 'product');
  });

  test('si Alegra ignora el filtro, se descartan igual', async () => {
    // Que no vuelva a pasar en silencio el día que cambie la API.
    const { servicio } = montar({
      itemsDeAlegra: [
        { id: 1, name: 'BUENO', status: 'active' },
        { id: 1437, name: 'DISCO 1000 HOJAS LIJAR', status: 'inactive' }
      ]
    });

    const r = await servicio.getItems();

    assert.equal(r.total, 1);
    assert.deepEqual(r.data.map(i => i.name), ['BUENO']);
  });
});
