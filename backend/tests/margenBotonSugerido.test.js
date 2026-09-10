const test = require('node:test');
const assert = require('node:assert');

/**
 * El botón "Sugerido" ahora dice cuánto margen deja ese precio.
 *
 * El número se calcula contra el costo de ESTA factura, no contra el
 * `margenObjetivo` del motor (que es la meta) ni contra su `margenResultante`
 * (que va contra el costo unitario histórico). La razón es que el botón tiene
 * que anticipar exactamente la insignia que aparece al lado del precio apenas
 * se aplique: si dijera 25% y al presionarlo saliera 22%, sería peor que no
 * decir nada.
 */

let utils;
test.before(async () => {
  utils = await import('../../frontend/src/utils/revisionPreciosUtils.js');
});

// Caso real: FACTURERO C/ COPIA PEQ de la factura de CADENA COMERCIAL
// RAMONENSE. 12 unidades, ₡4.902,60 de línea con IVA → ₡408,55 por unidad
// con IVA, ₡361,55 sin IVA. El motor sugiere ₡490 sin IVA.
const CASO = {
  producto: { id: 1, alegraItemId: 'A1', cantidad: 12, totalLinea: 4902.6, mapeo: { factorConversion: 1 } },
  entorno: {
    productosAlegra: { A1: { price: 536.75, taxPercentage: 13, cost: 408.55 } },
    preciosAjustados: {},
    sugerenciasPrecio: { 1: { precioSugerido: 490, margenObjetivo: 30, categoria: 'Librería', claseRotacion: 'B' } }
  }
};

const analizar = (extra = {}) =>
  utils.analizarProducto(CASO.producto, { ...CASO.entorno, ...extra });

test('el botón anuncia el margen que deja el precio sugerido', () => {
  const a = analizar();
  assert.equal(Number(a.margenSugerido.toFixed(1)), 26.2);
});

test('ese número es el mismo que sale al aplicarlo', () => {
  // Aplicar el sugerido es escribir ese precio en el campo. El margen que se
  // muestra entonces es `margenNuevo`, y tiene que dar igual.
  const antes = analizar();
  const despues = analizar({ preciosAjustados: { 1: antes.precioSugeridoSinIva } });
  assert.equal(
    antes.margenSugerido.toFixed(1),
    despues.margenNuevo.toFixed(1),
    'el botón estaría prometiendo un margen distinto del que aplica'
  );
});

test('no es la meta del motor, que va contra otro costo', () => {
  // La meta de la categoría es 30% y el margen real de este precio es 26,2%:
  // el costo de esta factura subió respecto al que usó el motor. Mostrar la
  // meta sería mostrar un número que no se va a cumplir.
  const a = analizar();
  assert.equal(a.margenObjetivo, 30);
  assert.notEqual(Number(a.margenSugerido.toFixed(1)), 30);
});

test('sin sugerencia del motor no se inventa un margen', () => {
  const a = analizar({ sugerenciasPrecio: {} });
  assert.equal(a.precioSugeridoSinIva, null);
  assert.equal(a.margenSugerido, null);
});

test('el factor de conversión entra en el costo, y por lo tanto en el margen', () => {
  // Mismo total de línea pero el proveedor factura fardos de 12: el costo por
  // unidad baja 12 veces y el margen sugerido sube.
  const conFactor = utils.analizarProducto(
    { ...CASO.producto, cantidad: 1, mapeo: { factorConversion: 12 } },
    CASO.entorno
  );
  const sinFactor = analizar();
  assert.equal(conFactor.cantidadReal, 12);
  assert.equal(Number(conFactor.margenSugerido.toFixed(1)), Number(sinFactor.margenSugerido.toFixed(1)));
});
