/**
 * Tests de las BAJAS en la sincronización del catálogo
 * (alegra-sync.service.js → saveProductsToLocal).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * Un producto desactivado en Alegra seguía apareciéndole al cliente: la
 * sincronización hacía `return` seco al ver un producto inactivo, así que la
 * fila de alegra_products_cache se quedaba en 'active' para siempre. Se
 * detectó con datos reales (1527 MUC-OFF AEROSOL SILICONE SHINE y 2046 JARRA
 * FELIZ DIA MAMÁ: inactivos en Alegra, activos en la caché, visibles en el
 * catálogo de clientes).
 *
 * CÓMO SE PRUEBA SIN BASE DE DATOS
 * saveProductsToLocal escribe en Supabase, que acá ES producción: correrlo de
 * verdad para ver si funciona deja daño real. Se sustituyen sus dos únicas
 * salidas —`prisma` y `query`— por dobles que solo anotan lo que se les pidió,
 * cargándolos en require.cache ANTES de pedir el servicio. Lo que se afirma es
 * la sentencia que se habría emitido.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const rutaDb = require.resolve('../config/database');
const rutaPrisma = require.resolve('../lib/prisma');
const rutaServicio = require.resolve('../src/integrations/alegra/services/alegra-sync.service');
const rutaCliente = require.resolve('../src/integrations/alegra/alegra.client');

let sentencias;   // toda llamada a query()
let existentes;   // lo que "ya está" en la caché

function cargarServicioConDobles() {
  for (const r of [rutaDb, rutaPrisma, rutaServicio, rutaCliente]) delete require.cache[r];

  sentencias = [];
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true, exports: {
      query: async (sql, params) => { sentencias.push({ sql, params }); return { rows: [] }; }
    }
  };
  require.cache[rutaPrisma] = {
    id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: {
      alegraProduct: {
        findMany: async () => existentes,
        createMany: async (a) => sentencias.push({ sql: 'createMany', params: a.data }),
        deleteMany: async (a) => sentencias.push({ sql: 'deleteMany', params: a.where.alegraId.in })
      }
    }
  };
  // El cliente de Alegra se instancia en el constructor; no se usa en
  // saveProductsToLocal, pero pediría credenciales de red al cargarse.
  require.cache[rutaCliente] = {
    id: rutaCliente, filename: rutaCliente, loaded: true,
    exports: { getInstance: () => ({ api: {} }) }
  };

  const AlegraSyncService = require(rutaServicio);
  return new AlegraSyncService();
}

/** Fila tal como la devuelve Alegra. */
function itemAlegra({ id, status = 'active', name = 'PRODUCTO', price = 1000 }) {
  return {
    id, name, status, type: 'product',
    price: [{ main: true, price }],
    tax: [{ percentage: 13 }],
    reference: { reference: 'REF' }
  };
}

/** Fila tal como está guardada en la caché. */
function filaCache({ alegraId, status = 'active', name = 'PRODUCTO', price = 1000 }) {
  return {
    alegraId, name, price, cost: 0, reference: 'REF',
    status, imageUrl: '', taxPercentage: 13, updatedAt: new Date()
  };
}

const bajas = () => sentencias.filter(s => String(s.sql).includes("status = 'inactive'"));

describe('saveProductsToLocal — productos dados de baja en Alegra', () => {
  beforeEach(() => { existentes = []; });

  test('un producto que pasó a inactivo en Alegra se marca inactivo en la caché', async () => {
    existentes = [filaCache({ alegraId: '1527', name: 'MUC-OFF AEROSOL SILICONE SHINE 500ML' })];
    const svc = cargarServicioConDobles();

    await svc.saveProductsToLocal([
      itemAlegra({ id: '1527', status: 'inactive', name: 'MUC-OFF AEROSOL SILICONE SHINE 500ML' })
    ]);

    const b = bajas();
    assert.equal(b.length, 1, 'debía emitirse exactamente una sentencia de baja');
    assert.deepEqual(b[0].params[0], ['1527']);
  });

  test('la baja NO toca ninguna otra columna — precio y foto quedan como estaban', async () => {
    existentes = [filaCache({ alegraId: '1527', price: 4500 })];
    const svc = cargarServicioConDobles();

    // Alegra devuelve el producto de baja SIN precio, que es justo el caso
    // que borraría el precio guardado si la baja pasara por el UPDATE de 12
    // columnas.
    await svc.saveProductsToLocal([{ id: '1527', name: 'MUC-OFF', status: 'inactive', price: [] }]);

    const sql = bajas()[0].sql;
    for (const columna of ['price', 'image_url', 'name', 'cost', 'search_text']) {
      assert.ok(!sql.includes(`${columna} =`), `la baja no debe escribir ${columna}`);
    }
  });

  test('un producto inactivo que ya estaba inactivo no vuelve a escribirse', async () => {
    existentes = [filaCache({ alegraId: '1527', status: 'inactive' })];
    const svc = cargarServicioConDobles();

    await svc.saveProductsToLocal([itemAlegra({ id: '1527', status: 'inactive' })]);

    assert.equal(bajas().length, 0);
  });

  test('un producto inactivo que nunca estuvo en la caché no se inserta', async () => {
    existentes = [];
    const svc = cargarServicioConDobles();

    await svc.saveProductsToLocal([itemAlegra({ id: '9999', status: 'inactive' })]);

    assert.equal(bajas().length, 0);
    assert.equal(sentencias.filter(s => s.sql === 'createMany').length, 0);
  });

  test('un producto inactivo NO se borra de la caché: sigue existiendo en Alegra', async () => {
    existentes = [filaCache({ alegraId: '1527' })];
    const svc = cargarServicioConDobles();

    await svc.saveProductsToLocal([itemAlegra({ id: '1527', status: 'inactive' })]);

    assert.equal(sentencias.filter(s => s.sql === 'deleteMany').length, 0);
  });

  test('reactivar en Alegra devuelve el producto al catálogo', async () => {
    existentes = [filaCache({ alegraId: '1527', status: 'inactive' })];
    const svc = cargarServicioConDobles();

    await svc.saveProductsToLocal([itemAlegra({ id: '1527', status: 'active' })]);

    const upd = sentencias.filter(s => String(s.sql).includes('UPDATE alegra_products_cache AS t'));
    assert.equal(upd.length, 1, 'debía actualizarse por el cambio de estado');
    assert.ok(upd[0].params.includes('active'));
    assert.equal(bajas().length, 0);
  });

  test('un catálogo normal, sin bajas, no emite ninguna sentencia de baja', async () => {
    existentes = [filaCache({ alegraId: '1' }), filaCache({ alegraId: '2' })];
    const svc = cargarServicioConDobles();

    await svc.saveProductsToLocal([itemAlegra({ id: '1' }), itemAlegra({ id: '2' })]);

    assert.equal(bajas().length, 0);
  });
});
