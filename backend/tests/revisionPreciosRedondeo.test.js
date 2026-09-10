const test = require('node:test');
const assert = require('node:assert');

/**
 * Quitarle el IVA a un precio es una división, y una división deja cola.
 *
 * En la pantalla de revisión el campo de "nuevo precio" mostraba
 * ₡ 475,0000000000000 para un producto de ₡536,75 con IVA: 536,75/1,13 da
 * 475,00000000000006 en punto flotante y ese número entraba tal cual al
 * input. No era un precio malo, era un precio ilegible.
 *
 * Se redondea a dos decimales y no a múltiplos de 5: el redondeo comercial
 * es para el precio SUGERIDO. Aplicarlo acá cambiaría el precio actual del
 * producto solo por abrir la factura, y parecería que alguien propuso un
 * cambio que nadie hizo.
 */

let utils;
test.before(async () => {
  utils = await import('../../frontend/src/utils/revisionPreciosUtils.js');
});

// Producto real de la factura que destapó esto: precio de góndola ₡536,75.
function analizar(overrides = {}) {
  const {
    price = 536.75,
    taxPercentage = 13,
    cost = 400,
    cantidad = 1,
    totalLinea = 452,
    factorConversion = 1,
    preciosAjustados = {}
  } = overrides;

  return utils.analizarProducto(
    {
      id: 1,
      alegraItemId: 'A1',
      cantidad,
      totalLinea,
      precioUnitario: totalLinea / cantidad,
      mapeo: { factorConversion }
    },
    {
      productosAlegra: { A1: { price, taxPercentage, cost } },
      preciosAjustados,
      sugerenciasPrecio: {}
    }
  );
}

// Cuántos decimales tiene de verdad el número que va al input.
function decimales(n) {
  const s = String(n);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

test('el precio de venta sin IVA no arrastra la cola de la división', () => {
  const a = analizar();
  assert.strictEqual(a.precioVentaSinIva, 475);
  assert.strictEqual(475, 536.75 / 1.13 - 0.00000000000006, 'el caso real, por si cambia el dato');
});

test('ningún número que llega al input pasa de dos decimales', () => {
  // Precios que en punto flotante dejan cola al dividir entre 1,13.
  for (const price of [536.75, 1000, 2345.67, 99.99, 12500, 37800]) {
    const a = analizar({ price, totalLinea: price * 0.8 });
    for (const [campo, valor] of Object.entries({
      precioVentaSinIva: a.precioVentaSinIva,
      costoNuevoSinIva: a.costoNuevoSinIva,
      precioAjustadoConIva: a.precioAjustadoConIva
    })) {
      assert.ok(
        decimales(valor) <= 2,
        `${campo} de ₡${price} salió ${valor}, con ${decimales(valor)} decimales`
      );
    }
  }
});

test('no redondea a múltiplos de 5: el precio actual se muestra tal cual es', () => {
  // ₡1.234,56 con IVA son ₡1.092,53 sin IVA. Si acá se aplicara el redondeo
  // comercial saldría ₡1.090 y el usuario vería una rebaja que nadie pidió.
  const a = analizar({ price: 1234.56 });
  assert.strictEqual(a.precioVentaSinIva, 1092.53);
  assert.notStrictEqual(a.precioVentaSinIva % 5, 0);
});

test('el redondeo comercial sigue siendo para el precio sugerido', () => {
  assert.strictEqual(utils.redondearPrecio(1092.53), 1095);
  assert.strictEqual(utils.redondearPrecio(475.00000000000006), 475);
});

test('el costo nuevo usa el total de la línea sobre la cantidad ya convertida', () => {
  // Proveedor factura 1 fardo de 100 unidades: el costo por unidad es el
  // total entre 100, no entre 1.
  const a = analizar({ cantidad: 1, factorConversion: 100, totalLinea: 45200 });
  assert.strictEqual(a.cantidadReal, 100);
  assert.strictEqual(a.costoNuevoConIva, 452);
  assert.strictEqual(a.costoNuevoSinIva, 400);
});

test('un precio ajustado a mano vuelve a con-IVA sin cola', () => {
  const a = analizar({ preciosAjustados: { 1: 475 } });
  assert.strictEqual(a.precioAjustadoConIva, 536.75);
});

test('el IVA del producto manda cuando viene', () => {
  // 44 productos del catálogo van al 1% (canasta básica) y 27 más al 2, 4 u 8.
  const a = analizar({ price: 1010, taxPercentage: 1 });
  assert.strictEqual(a.precioVentaSinIva, 1000);
});

test('sin IVA declarado se asume 13% (comportamiento actual, ver nota)', () => {
  // OJO: 12 productos tienen `tax: []` en Alegra y acá se les asume 13%,
  // mientras el catálogo público les aplica 0% y muestra otro precio para
  // el mismo producto. Entre esos 12 hay unos que sí son exentos (gasa,
  // curitas, esparadrapo) y otros a los que simplemente nunca se les puso
  // el impuesto en Alegra (un tornillo, un desodorante). Cuál de los dos
  // números es el bueno es una decisión de la empresa, no del código, así
  // que esta prueba fija lo que hoy hace y no lo que debería hacer.
  const a = analizar({ price: 1130, taxPercentage: 0 });
  assert.strictEqual(a.precioVentaSinIva, 1000);
});
