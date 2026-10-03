/**
 * El modal "Agregar producto" del Reporte de Proveedores ofrecía productos
 * desactivados (reportado por el usuario, 2026-09-29): la búsqueda le pregunta
 * a Alegra en vivo y no filtraba por estado.
 *
 * Con `soloActivos` se le pide a Alegra `status: 'active'` y además se filtra
 * en el servidor. Sin la opción, la búsqueda queda como estaba: la usa
 * también la edición de facturas para impresión, que no se tocó.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const AlegraProductService = require('../src/integrations/alegra/services/alegra-product.service');

function buscar(respuesta, opciones) {
  const pedidos = [];
  const cliente = { get: async (ruta, params) => { pedidos.push({ ruta, params }); return { success: true, data: respuesta }; } };
  return AlegraProductService.prototype.searchProducts.call({ client: cliente }, 'tubo', opciones)
    .then((r) => ({ r, pedidos }));
}

const PRODUCTOS = [
  { id: '1', name: 'TUBO PVC 1/2', status: 'active' },
  { id: '2', name: 'TUBO PVC 3/4 VIEJO', status: 'inactive' },
  { id: '3', name: 'TUBO CONDUIT', status: 'active' }
];

describe('buscar productos para agregar al pedido', () => {
  test('con soloActivos se le pide a Alegra solo los activos', async () => {
    const { pedidos } = await buscar([], { soloActivos: true });
    assert.deepEqual(pedidos[0], { ruta: '/items', params: { query: 'tubo', type: 'product', status: 'active' } });
  });

  test('y si Alegra igual manda un desactivado, no llega a la pantalla', async () => {
    const { r } = await buscar(PRODUCTOS, { soloActivos: true });
    assert.deepEqual(r.data.map((p) => p.id), ['1', '3']);
  });

  test('sin la opción, la búsqueda sigue como estaba (la usa también impresión)', async () => {
    const { r, pedidos } = await buscar(PRODUCTOS);
    assert.deepEqual(pedidos[0].params, { query: 'tubo', type: 'product' });
    assert.equal(r.data.length, 3);
  });

  test('el Reporte de Proveedores busca en el maestro propio, que solo entrega activos', () => {
    // Desde el 2026-10-03 (rama independencia-alegra) el pedido se arma con
    // los productos propios: `/catalogos/productos` es la lectura compartida
    // de lo ACTIVO, así que no hace falta pedir `soloActivos`.
    const hook = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'hooks', 'useReporteProveedores.js'), 'utf8');
    assert.match(hook, /api\.get\('\/catalogos\/productos', \{ params: \{ buscar: query, limite: 30 \} \}\)/);
    assert.doesNotMatch(hook, /\/alegra\/productos\/buscar/);
    const servicio = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'productos', 'productos.service.js'), 'utf8');
    assert.match(servicio, /async function productosParaOperar[\s\S]{0,200}estado: 'activos'/);
  });
});
