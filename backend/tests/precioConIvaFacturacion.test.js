/**
 * En Facturación, el producto que se busca sale con su IVA (2026-10-28).
 *
 * El usuario: «cuando uno busca un producto para facturar este sale con el
 * precio sin IVA, ocupo que salga con IVA». El precio guardado es SIN IVA
 * (precio_sin_iva) y la tarifa es la de cada producto: 0, 1, 2, 4, 8 o 13 %,
 * nunca un 1,13 fijo (docs/grafo/leccion/precio-sin-iva-costo-con-iva.md).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { sinComentarios } = require('./dobles/sinComentarios');

const FRONT = path.resolve(__dirname, '../../frontend/src');
const cargar = () => import(pathToFileURL(path.join(FRONT, 'utils/facturacionUtils.js')));
const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));

const IVA13 = { id: 1, percentage: 13 };
const conTarifa = (price, percentage) => ({ price, tax: [{ id: 99, percentage }] });

describe('el precio con IVA de un producto', () => {
  test('usa la tarifa del producto, no un 13 % fijo', async () => {
    const { precioConIva } = await cargar();
    assert.equal(precioConIva(conTarifa(234, 13)), 264.42);
    assert.equal(precioConIva(conTarifa(1215, 13)), 1372.95);
    assert.equal(precioConIva(conTarifa(100, 1)), 101);
    assert.equal(precioConIva(conTarifa(100, 2)), 102);
    assert.equal(precioConIva(conTarifa(250, 4)), 260);
    assert.equal(precioConIva(conTarifa(250, 8)), 270);
    assert.equal(precioConIva(conTarifa(250, 0)), 250, 'un producto exento no paga IVA');
  });

  test('sin tarifa propia se usa la principal de la factura; sin ninguna, 0 %', async () => {
    const { precioConIva, tarifaDeProducto } = await cargar();
    assert.equal(precioConIva({ price: 200 }, IVA13), 226);
    assert.equal(precioConIva({ price: 200, tax: [] }, IVA13), 226);
    assert.equal(precioConIva({ price: 200 }), 200, 'el buscador de editar facturas no tiene tarifa principal');
    assert.equal(tarifaDeProducto(conTarifa(200, 2), IVA13), 2, 'la del producto gana a la principal');
    assert.equal(tarifaDeProducto({ price: 200 }, { percentage: '13' }), 13);
  });

  test('una tarifa propia sin porcentaje cuenta 0 %, igual que al armar la línea', async () => {
    const { precioConIva } = await cargar();
    assert.equal(precioConIva({ price: 200, tax: [{ id: 5 }] }, IVA13), 200);
  });

  test('sin precio válido da 0 y no inventa un monto', async () => {
    const { precioConIva } = await cargar();
    for (const price of [0, null, undefined, 'x']) {
      assert.equal(precioConIva({ price, tax: [{ percentage: 13 }] }), 0, String(price));
    }
    assert.equal(precioConIva(null), 0);
    assert.equal(precioConIva(undefined, IVA13), 0);
  });

  test('coincide al céntimo con lo que cobra la línea de factura por UNA unidad', async () => {
    const { precioConIva, montosLineaFacturacion, calcularTotal } = await cargar();
    // Precios con céntimos y tarifas reales: donde el redondeo podría separarse.
    const precios = [0.01, 0.5, 1.15, 33.33, 99.99, 100, 234, 359.47, 1215, 4999.95, 12345.67];
    for (const percentage of [0, 1, 2, 4, 8, 13]) {
      for (const price of precios) {
        const producto = conTarifa(price, percentage);
        const linea = { quantity: 1, price, discount: 0, tax: producto.tax };
        const { base, impuesto } = montosLineaFacturacion(linea);
        const mostrado = precioConIva(producto);
        assert.equal(mostrado, Math.round((base + impuesto) * 100) / 100, `${price} al ${percentage} %`);
        assert.equal(mostrado, calcularTotal([linea], 0, null, []), `${price} al ${percentage} %: el total de la factura`);
      }
    }
  });
});

describe('los cuatro lugares donde se ve un producto antes de agregarlo', () => {
  const lugares = {
    'la lista y la ficha «Encontrado» del buscador': leer('components', 'facturacion', 'AgregarProductos.jsx'),
    'el modal de cantidad': leer('components', 'facturacion', 'ModalCantidad.jsx'),
    'el buscador de editar una factura': leer('components', 'facturacion', 'LineasFactura.jsx')
  };

  for (const [donde, fuente] of Object.entries(lugares)) {
    test(`${donde} usa el precio con IVA`, () => {
      assert.match(fuente, /import PrecioConIva from '\.\/PrecioConIva'/);
      assert.match(fuente, /<PrecioConIva producto=/);
      assert.doesNotMatch(fuente, /(producto|productoPreviewRapido|p)\.price\.toLocaleString/, 'quedó el precio base sin IVA');
      assert.doesNotMatch(fuente, /colones\((p|producto)\.price\)/, 'quedó el precio base sin IVA');
    });
  }

  test('el buscador y la ficha rápida usan la tarifa principal de la factura', () => {
    const f = lugares['la lista y la ficha «Encontrado» del buscador'];
    assert.equal((f.match(/<PrecioConIva producto=\{[A-Za-z]+\} impuestoPrincipal=\{impuestoPrincipal\}/g) || []).length, 2);
    const pagina = leer('pages', 'Facturacion.jsx');
    assert.equal((pagina.match(/impuestoPrincipal=\{impuestoPrincipal\}/g) || []).length >= 3, true, 'la página se la pasa al buscador y al modal');
  });

  test('el precio dice «con IVA» y no se dibuja sin precio', () => {
    const c = leer('components', 'facturacion', 'PrecioConIva.jsx');
    assert.match(c, /con IVA/);
    assert.match(c, /if \(!\(Number\(producto\?\.price\) > 0\)\) return null/);
    assert.match(c, /precioConIva\(producto, impuestoPrincipal\)/);
  });
});
