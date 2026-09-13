const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/**
 * Cada línea de la factura se cobra con la tarifa de SU producto.
 *
 * La pantalla armaba toda línea con el impuesto principal de la factura
 * (13 %), y ese id es el que viajaba a Alegra. Medido sobre lo ya emitido:
 * 213 líneas en 147 facturas de productos al 1 % salieron al 13 %, 13 líneas
 * al 2 % y 6 exentas. No fue un cambio de tarifas — el mismo producto aparece
 * a las dos en el mismo período, así que dependía del camino.
 *
 * Es la misma familia del IVA 13 % fijo y de los ids de impuesto equivocados:
 * un valor "principal" usado como si fuera el de cada línea.
 */

const HOOK = path.join(__dirname, '..', '..', 'frontend', 'src', 'hooks', 'useFacturacion.js');
const PANEL = path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'facturacion', 'PanelCobro.jsx');

test('el impuesto se suma con la tarifa de cada línea', async () => {
  const { calcularImpuestos } = await import('../../frontend/src/utils/facturacionUtils.js');
  const items = [
    { quantity: 2, price: 305, discount: 0, tax: [{ id: 1, percentage: 1 }] },
    { quantity: 1, price: 1078.40, discount: 0, tax: [{ id: 2, percentage: 2 }] }
  ];
  // 610 × 1 % = 6,10  +  1.078,40 × 2 % = 21,568. Con el impuesto principal
  // habría dado ₡219,49, que es lo que se le cobraba de más al cliente.
  assert.equal(Math.round(calcularImpuestos(items, { id: 3, percentage: 13 }, []) * 100) / 100, 27.67);
});

test('sin tarifa propia, la línea todavía cae en la principal', async () => {
  const { calcularImpuestos } = await import('../../frontend/src/utils/facturacionUtils.js');
  const items = [{ quantity: 1, price: 1000, discount: 0, tax: [] }];
  assert.equal(calcularImpuestos(items, { id: 3, percentage: 13 }, []), 130);
});

test('la línea nace con la tarifa del PRODUCTO', () => {
  const fuente = fs.readFileSync(HOOK, 'utf8');
  assert.match(fuente, /const impuestoDelProducto = Array\.isArray\(producto\.tax\)/);
  assert.match(fuente, /tax: impuestoDelProducto/);
  assert.equal(/tax: impuestoDefault,/.test(fuente), false,
    'volvió a nacer la línea con el impuesto principal de la factura');
});

test('la etiqueta dice las tarifas que de verdad hay', () => {
  // Decir "IVA 13 %" al lado de un monto que es 1 % + 2 % es peor que no
  // decir nada: el cajero no sabe a cuál creerle.
  const fuente = fs.readFileSync(PANEL, 'utf8');
  assert.match(fuente, /const tarifas = \[\.\.\.new Set\(/);
  assert.equal(/impuestoPrincipal\.name \|\| 'Impuesto'/.test(fuente), false);
});
