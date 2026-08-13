const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('reporteClientesUtils - Checklist de bodega', () => {
  let utils;

  test('cargar módulo de utilidades', async () => {
    utils = await import('../../frontend/src/utils/reporteClientesUtils.js');
    assert.ok(utils.productoEstaRevisado);
    assert.ok(utils.productoTieneRespuesta);
    assert.ok(utils.facturaListaParaImprimir);
  });

  test('productoEstaRevisado vs productoTieneRespuesta', async () => {
    if (!utils) utils = await import('../../frontend/src/utils/reporteClientesUtils.js');
    const factura = { alegra_id: 101, productos_faltantes: [] };
    const producto = { faltante_id: 1, cantidad_faltante: 5 };

    const entregasAjustadas = new Map();
    const key = utils.getProductKey(factura, producto);

    // Sin respuesta
    assert.equal(utils.productoTieneRespuesta(factura, producto, entregasAjustadas), false);
    assert.equal(utils.productoEstaRevisado(factura, producto, entregasAjustadas), false);

    // Respuesta seleccionada pero no confirmada (revisado: false)
    entregasAjustadas.set(key, { faltanteId: 1, cantidadEntregada: 5, estado: 'completo', revisado: false });
    assert.equal(utils.productoTieneRespuesta(factura, producto, entregasAjustadas), true);
    assert.equal(utils.productoEstaRevisado(factura, producto, entregasAjustadas), false);

    // Confirmado (revisado: true)
    entregasAjustadas.set(key, { faltanteId: 1, cantidadEntregada: 5, estado: 'completo', revisado: true });
    assert.equal(utils.productoTieneRespuesta(factura, producto, entregasAjustadas), true);
    assert.equal(utils.productoEstaRevisado(factura, producto, entregasAjustadas), true);
  });

  test('facturaListaParaImprimir con total === 0 y con respuestas sin confirmar', async () => {
    if (!utils) utils = await import('../../frontend/src/utils/reporteClientesUtils.js');

    // Factura sin productos faltantes (total === 0)
    const facturaVacia = { alegra_id: 102, productos_faltantes: [] };
    const mapVacio = new Map();
    assert.equal(utils.facturaListaParaImprimir(facturaVacia, mapVacio), true);

    // Factura con 2 productos faltantes
    const p1 = { faltante_id: 10, cantidad_faltante: 2 };
    const p2 = { faltante_id: 11, cantidad_faltante: 4 };
    const factura = { alegra_id: 103, productos_faltantes: [p1, p2] };

    const key1 = utils.getProductKey(factura, p1);
    const key2 = utils.getProductKey(factura, p2);
    const map = new Map();

    // 0 revisados
    assert.equal(utils.facturaListaParaImprimir(factura, map), false);

    // 1 respondido sin confirmar (revisado: false), 0 confirmados
    map.set(key1, { faltanteId: 10, cantidadEntregada: 2, estado: 'completo', revisado: false });
    assert.equal(utils.facturaListaParaImprimir(factura, map), false);

    // 1 confirmado (revisado: true), 1 pendiente
    map.set(key1, { faltanteId: 10, cantidadEntregada: 2, estado: 'completo', revisado: true });
    assert.equal(utils.facturaListaParaImprimir(factura, map), false);

    // Ambos confirmados (revisado: true)
    map.set(key2, { faltanteId: 11, cantidadEntregada: 0, estado: 'no_llego', revisado: true });
    assert.equal(utils.facturaListaParaImprimir(factura, map), true);
  });
});
