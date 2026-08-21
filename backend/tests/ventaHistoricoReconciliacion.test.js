/**
 * Tests de eliminarLineasObsoletas (catalogo-agente.service.js).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * Una factura editada en Alegra (se le quita un producto, se le corrige una
 * cantidad) nunca volvía a mandar esa línea vieja: el upsert de
 * sincronizarHistorialCompras actualiza o agrega filas de venta_historico,
 * pero nada las borraba. Se detectó con datos reales: la factura 5263 de "La
 * Ecosr Sociedad Anonima (TOSCANA)" es de ₡279.113 en Alegra, pero
 * venta_historico la sumaba en ₡316.566 porque tenía dos líneas de una
 * edición anterior (ids 241 y 2087) que ya no están en la factura, y una
 * tercera (id 906) con la cantidad y el precio de ANTES del último ajuste.
 * Eso inflaba tanto la tarjeta de "Volver a pedir" como el total recalculado
 * al tocar "Ver y repetir".
 *
 * CÓMO SE PRUEBA SIN BASE DE DATOS
 * Igual que sincronizacionBajas.test.js: se sustituye `query` por un doble
 * que solo anota qué se le pidió, cargado en require.cache ANTES de pedir el
 * servicio, porque esta base local ES producción.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const rutaDb = require.resolve('../config/database');
const rutaServicio = require.resolve('../src/modules/catalogo-agente/catalogo-agente.service');
const rutaAlegra = require.resolve('../src/integrations/alegra');
const rutaExcesos = require.resolve('../src/utils/descuentosExceso');

let sentencias;

function cargarServicioConDobles() {
  for (const r of [rutaDb, rutaServicio, rutaAlegra, rutaExcesos]) delete require.cache[r];

  sentencias = [];
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true, exports: {
      query: async (sql, params) => { sentencias.push({ sql, params }); return { rows: [] }; }
    }
  };
  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true, exports: { getClient: () => ({}) }
  };
  require.cache[rutaExcesos] = {
    id: rutaExcesos, filename: rutaExcesos, loaded: true, exports: { listarVigentes: async () => [] }
  };

  return require(rutaServicio);
}

describe('eliminarLineasObsoletas — reconciliar venta_historico contra la factura actual', () => {
  beforeEach(() => { });

  test('no hace nada si el mapa de facturas está vacío', async () => {
    const svc = cargarServicioConDobles();
    const borradas = await svc.eliminarLineasObsoletas(new Map());
    assert.equal(borradas, 0);
    assert.equal(sentencias.length, 0);
  });

  test('borra por anti-join los pares que ya no están, sin tocar los vigentes', async () => {
    const svc = cargarServicioConDobles();
    const pares = new Map([[5263, new Set(['1024', '2090'])]]);

    await svc.eliminarLineasObsoletas(pares);

    assert.equal(sentencias.length, 1);
    const { sql, params } = sentencias[0];
    assert.match(sql, /DELETE FROM venta_historico/);
    assert.match(sql, /NOT EXISTS/);
    // Los pares válidos van primero, la lista de facturas al final.
    assert.deepEqual(params, [5263, '1024', 5263, '2090', [5263]]);
  });

  test('una factura sin ningún ítem borra TODO lo que tuviera esa factura', async () => {
    const svc = cargarServicioConDobles();
    const pares = new Map([[5263, new Set()]]);

    await svc.eliminarLineasObsoletas(pares);

    assert.equal(sentencias.length, 1);
    assert.match(sentencias[0].sql, /DELETE FROM venta_historico WHERE alegra_invoice_id = ANY/);
    assert.doesNotMatch(sentencias[0].sql, /NOT EXISTS/);
    assert.deepEqual(sentencias[0].params, [[5263]]);
  });

  test('varias facturas en la misma página, cada una con su propio set de pares', async () => {
    const svc = cargarServicioConDobles();
    const pares = new Map([
      [100, new Set(['a', 'b'])],
      [200, new Set()],
      [300, new Set(['c'])]
    ]);

    await svc.eliminarLineasObsoletas(pares);

    assert.equal(sentencias.length, 1);
    const { params } = sentencias[0];
    const facturaIds = params[params.length - 1];
    assert.deepEqual(facturaIds.sort(), [100, 200, 300]);
  });
});
