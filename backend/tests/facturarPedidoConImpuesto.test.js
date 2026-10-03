/** El pedido conserva el precio con IVA y pide separarlo al emitir la factura propia. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const rutaDb = require.resolve('../config/database');
const rutaAuth = require.resolve('../src/modules/portal-clientes/portal-clientes.auth');
const rutaFactura = require.resolve('../src/modules/facturacion/facturaPropia.service');
const rutaServicio = require.resolve('../src/modules/portal-clientes/portal-clientes.pedidos.service');

function montar({ tarifa = 13, precio = 1130, estado = 'pendiente' } = {}) {
  for (const ruta of [rutaDb, rutaAuth, rutaFactura, rutaServicio]) delete require.cache[ruta];
  const visto = { consultas: [], factura: null };
  const query = async (sql, params) => {
    visto.consultas.push({ sql, params });
    if (/FROM pedido_cliente p/.test(sql)) return { rows: [{ id: 1, estado,
      cliente_id: 8, alegra_contact_id: '999', factura_id: estado === 'facturado' ? 72 : null, total: precio }] };
    if (/FROM pedido_cliente_linea/.test(sql)) return { rows: [{ producto_id: 12, alegra_item_id: '9999',
      cantidad: '1', precio_unitario: String(precio), nombre_producto: 'Producto', tax_percentage: String(tarifa),
      descuento_porcentaje: '25', precio_lista: '1500' }] };
    if (/FROM producto p/.test(sql)) return { rows: [{ id: 12, tarifa }] };
    if (/FROM factura WHERE/.test(sql)) return { rows: [{ id: 72, numero: '001000014999', total: precio }] };
    return { rows: [] };
  };
  require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true,
    exports: { query, pool: { query, connect: async () => ({ query, release() {} }) } } };
  require.cache[rutaFactura] = { id: rutaFactura, filename: rutaFactura, loaded: true,
    exports: { crearFacturaEnTransaccion: async (db, datos, usuarioId, opciones) => {
      visto.factura = datos;
      visto.opciones = opciones;
      return { id: 72, numero: '001000014999', total: precio };
    } } };
  return { servicio: require(rutaServicio), visto };
}

for (const [tarifa, precio] of [[13,1130], [4,1040], [2,1020], [1,1010], [0,1000]]) {
  test(`pedido al ${tarifa}%: conserva el precio final y usa el producto propio`, async () => {
    const { servicio, visto } = montar({ tarifa, precio });
    const r = await servicio.facturar(1, null);
    assert.equal(visto.factura.clienteId, 8);
    assert.equal(visto.factura.items[0].productoId, 12);
    assert.equal(visto.factura.items[0].price, precio);
    assert.equal(visto.opciones.preciosConImpuesto, true);
    assert.equal(visto.factura.items[0].discount, 0, 'el precio ya incluía la rebaja; no se cobra dos veces');
    assert.equal(r.facturaId, 72);
    assert.equal('alegraInvoiceId' in r, false);
    assert.ok(visto.consultas.some(q => /FOR UPDATE OF p/.test(q.sql)));
    assert.ok(visto.consultas.some(q => /factura_id = \$1/.test(q.sql) && /UPDATE pedido_cliente/.test(q.sql)));
  });
}
test('un pedido facturado devuelve la misma factura sin volver a crearla', async () => {
  const { servicio, visto } = montar({ estado: 'facturado' });
  const r = await servicio.facturar(1, null);
  assert.equal(r.facturaId, 72);
  assert.equal(r.yaExistia, true);
  assert.equal(visto.factura, null);
});
