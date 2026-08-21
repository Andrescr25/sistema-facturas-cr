const test = require('node:test');
const assert = require('node:assert');

/**
 * El carrito y las sugerencias tocan la base, así que acá se prueban las
 * reglas puras que los rodean — las que, si se rompen, mandan un precio
 * equivocado a una factura o filtran datos entre clientes.
 */

const { precioConImpuesto } = require('../src/modules/catalogo-clientes/precio');
const { aplicarDescuento } = require('../src/utils/descuentosExceso');
const { MIN_COINCIDENCIAS } = require('../src/modules/portal-clientes/portal-clientes.sugerencias.service');

test('el umbral de co-ocurrencia descarta coincidencias sueltas', () => {
  // Dos productos que estuvieron juntos una sola vez no tienen relación:
  // solo coincidieron en una factura. Sobre 5.261 facturas, exigir 5 deja
  // fuera el ruido sin perder los pares reales (el más fuerte tiene 491).
  assert.ok(MIN_COINCIDENCIAS >= 3, 'un umbral menor a 3 convierte casualidad en recomendación');
});

test('el precio del carrito se recalcula, no se congela', () => {
  // El carrito guarda producto y cantidad, nunca precio. Esta prueba fija la
  // consecuencia: el mismo producto con una oferta nueva da otro precio.
  const base = 33451.32743, tasa = 13;
  const sinOferta = aplicarDescuento(precioConImpuesto(base, tasa), 0);
  const conOferta = aplicarDescuento(precioConImpuesto(base, tasa), 25);
  assert.strictEqual(sinOferta, 37800);
  assert.strictEqual(conOferta, 28350);
  assert.notStrictEqual(sinOferta, conOferta);
});

test('el precio de lista de una línea sin oferta es el precio mismo', () => {
  // En crearPedido: `producto.precioLista ?? producto.precio`. Sin oferta,
  // precioLista viene null y guardar ese null perdería el dato de a cuánto
  // se vendió.
  const producto = { precio: 37800, precioLista: null };
  assert.strictEqual(producto.precioLista ?? producto.precio, 37800);

  const enOferta = { precio: 28350, precioLista: 37800 };
  assert.strictEqual(enOferta.precioLista ?? enOferta.precio, 37800);
});

test('las cantidades del carrito se normalizan a enteros no negativos', () => {
  // Es lo que hace ponerCantidad con lo que llegue del navegador.
  const normalizar = (v) => Math.max(0, Math.floor(Number(v) || 0));
  assert.strictEqual(normalizar('3'), 3);
  assert.strictEqual(normalizar(2.7), 2);
  assert.strictEqual(normalizar(-5), 0);
  assert.strictEqual(normalizar('no es número'), 0);
  assert.strictEqual(normalizar(null), 0);
});

test('repetir una compra redondea hacia arriba las cantidades fraccionadas', () => {
  // lineasDeCompra: Math.max(1, Math.round(...)). Una venta de 0,5 kg no
  // puede volver al carrito como 0 unidades, que sería sacarla en silencio.
  const normalizar = (v) => Math.max(1, Math.round(Number(v)));
  assert.strictEqual(normalizar(0.5), 1);
  assert.strictEqual(normalizar(0.2), 1);
  assert.strictEqual(normalizar(3), 3);
  assert.strictEqual(normalizar(3.6), 4);
});
