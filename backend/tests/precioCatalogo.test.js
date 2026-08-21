const test = require('node:test');
const assert = require('node:assert');
const { precioConImpuesto, precioSinImpuesto } = require('../src/modules/catalogo-clientes/precio');

// Valores reales de la caché de productos. Alegra guarda el precio SIN
// impuesto y con muchos decimales porque el precio de góndola es el que lo
// incluye: alguien fijó ₡37.800 y Alegra calculó la base hacia atrás.
const ABANICO_TECHO = { base: 33451.32743, tasa: 13, gondola: 37800 };
const ABANICO_HURACAN = { base: 19911.5, tasa: 13, gondola: 22500 };

test('devuelve el precio de góndola redondo', () => {
  assert.strictEqual(precioConImpuesto(ABANICO_TECHO.base, ABANICO_TECHO.tasa), 37800);
  assert.strictEqual(precioConImpuesto(ABANICO_HURACAN.base, ABANICO_HURACAN.tasa), 22500);
});

test('no arrastra decimales sueltos al multiplicar', () => {
  // Con 4 decimales daba 37800.0029 y el total del pedido salía en
  // ₡211.500,01 mientras el catálogo mostraba ₡211.500. Dos redondeos
  // distintos para el mismo número.
  const p = precioConImpuesto(ABANICO_TECHO.base, ABANICO_TECHO.tasa);
  assert.strictEqual(p * 5, 189000);
  assert.ok(Number.isInteger(p * 100), 'no debe tener más de 2 decimales');
});

test('respeta tasas que no son 13%', () => {
  // Hay productos al 0, 1, 2, 4 y 8% — por eso no se multiplica por 1,13 fijo.
  assert.strictEqual(precioConImpuesto(1000, 0), 1000);
  assert.strictEqual(precioConImpuesto(1000, 1), 1010);
  assert.strictEqual(precioConImpuesto(1000, 8), 1080);
});

test('tasa NULL deja el precio intacto en vez de inventar impuesto', () => {
  assert.strictEqual(precioConImpuesto(1000, null), 1000);
  assert.strictEqual(precioConImpuesto(1000, undefined), 1000);
});

test('el camino inverso recupera la base para mandarla a Alegra', () => {
  // Alegra le suma el impuesto al facturar: si se le mandara el precio CON
  // IVA, lo sumaría dos veces y la factura saldría 13% más cara.
  const base = precioSinImpuesto(ABANICO_TECHO.gondola, 13);
  assert.ok(Math.abs(base - ABANICO_TECHO.base) < 0.001, `${base} debería acercarse a ${ABANICO_TECHO.base}`);
  // Y al volver a aplicar el impuesto se llega al mismo precio de góndola.
  assert.strictEqual(precioConImpuesto(base, 13), ABANICO_TECHO.gondola);
});

test('ida y vuelta sin impuesto no altera el precio', () => {
  assert.strictEqual(precioSinImpuesto(5000, 0), 5000);
  assert.strictEqual(precioSinImpuesto(5000, null), 5000);
});

test('valores basura no revientan el cálculo', () => {
  assert.strictEqual(precioConImpuesto(null, 13), 0);
  assert.strictEqual(precioConImpuesto('no es número', 13), 0);
  assert.strictEqual(precioConImpuesto(1000, 'raro'), 1000);
});
