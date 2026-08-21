const test = require('node:test');
const assert = require('node:assert');
const { aplicarDescuento } = require('../src/utils/descuentosExceso');
const { precioConImpuesto } = require('../src/modules/catalogo-clientes/precio');

// Los textos de la portada viven en el frontend pero no dependen de React.
let notas;
test.before(async () => {
  notas = await import('../../frontend/src/utils/notasCatalogo.js');
});

// ---- Descuento sobre el precio que ve el cliente ----

test('el descuento se aplica sobre el precio CON impuesto', () => {
  // Es una rebaja sobre lo que el cliente paga, no sobre la base gravable.
  const lista = precioConImpuesto(33451.32743, 13); // ₡37.800
  assert.strictEqual(lista, 37800);
  assert.strictEqual(aplicarDescuento(lista, 25), 28350);
  assert.strictEqual(aplicarDescuento(lista, 40), 22680);
});

test('sin descuento devuelve el mismo precio', () => {
  assert.strictEqual(aplicarDescuento(37800, 0), 37800);
  assert.strictEqual(aplicarDescuento(37800, null), 37800);
  assert.strictEqual(aplicarDescuento(37800, undefined), 37800);
});

test('el precio rebajado no arrastra decimales', () => {
  // Lo que se muestra y lo que se congela en el pedido tienen que ser el
  // mismo número, o el total del cliente no cuadra con el de la factura.
  const p = aplicarDescuento(precioConImpuesto(904, 20), 20);
  assert.ok(Number.isInteger(Math.round(p * 100)), 'máximo 2 decimales');
});

test('un descuento del 100% deja el precio en cero, no en negativo', () => {
  assert.strictEqual(aplicarDescuento(37800, 100), 0);
});

// ---- Textos de la portada ----

test('"hace cuánto" no dice unidades en cero ni en singular mal', () => {
  assert.strictEqual(notas.haceCuanto(0), 'hoy');
  assert.strictEqual(notas.haceCuanto(1), 'ayer');
  assert.strictEqual(notas.haceCuanto(5), 'hace 5 días');
  assert.strictEqual(notas.haceCuanto(7), 'hace 7 días');
  assert.strictEqual(notas.haceCuanto(14), 'hace 2 semanas');
  assert.strictEqual(notas.haceCuanto(65), 'hace 2 meses');
  assert.strictEqual(notas.haceCuanto(400), 'hace 1 año');
  assert.strictEqual(notas.haceCuanto(800), 'hace 2 años');
});

test('nunca aparece "hace 1 semanas" ni "hace 1 meses"', () => {
  for (let d = 0; d <= 900; d++) {
    const t = notas.haceCuanto(d);
    assert.ok(!/\b1 (días|semanas|meses|años)\b/.test(t), `día ${d} produjo "${t}"`);
  }
});

test('la nota de habitual concuerda en número', () => {
  assert.strictEqual(notas.notaHabitual({ veces: 1 }), 'Lo compró una vez');
  assert.strictEqual(notas.notaHabitual({ veces: 26 }), 'Lo compró 26 veces');
  assert.strictEqual(notas.notaHabitual({ veces: 0 }), null);
});

test('la nota de perdido explica cuánto hace', () => {
  assert.strictEqual(notas.notaPerdido({ dias: 107 }), 'Sin comprarlo hace 4 meses');
  assert.strictEqual(notas.notaPerdido({ dias: null }), null);
});
