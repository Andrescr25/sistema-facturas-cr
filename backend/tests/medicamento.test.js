const test = require('node:test');
const assert = require('node:assert');

/**
 * La regla que decide si un producto "parece" medicamento.
 *
 * Estaba comparando contra el prefijo CABYS '35', que es la división entera
 * de otros productos químicos. Sobre el catálogo real 276 productos caían
 * ahí y ninguno era un medicamento: pinturas, jabones, cosméticos, aceites.
 * Peor: como la casilla iba con OR contra esta regla, el usuario no podía
 * desmarcarla.
 */
let utils;
test.before(async () => {
  utils = await import('../../frontend/src/utils/relacionarProductosUtils.js');
});

// CABYS reales de este catálogo
const REALES = [
  ['3543001999900', 'MUC-OFF AEROSOL SILICONE (línea de ciclo)'],
  ['3543001019900', 'ACEITE MULTIUSO TRUPER'],
  ['3532201999900', 'ACIDO MURIADICO'],
  ['3532303000400', 'ACONDICIONADOR DOVE'],
  ['3511002000400', 'AGUARRAS LITRO'],
  ['3511003000300', 'PINTURA AMARILLA'],
  ['3562301050202', 'ALCANFOR'],
  ['3542001010000', 'PEGAMENTO AMANCO'],
  ['3569199000200', 'APLICADORES DE MADERA']
];

test('ninguno de los CABYS reales del catálogo se marca como medicamento', () => {
  for (const [codigo, nombre] of REALES) {
    assert.strictEqual(
      utils.cabysPareceMedicamento(codigo), false,
      `${nombre} (${codigo}) no debería marcarse como medicamento`
    );
  }
});

test('un CABYS farmacéutico de verdad sí se detecta', () => {
  // 352 es el grupo de productos farmacéuticos en el catálogo CABYS.
  assert.strictEqual(utils.cabysPareceMedicamento('3521100000000'), true);
  assert.strictEqual(utils.cabysPareceMedicamento('352'), true);
});

test('valores vacíos no rompen ni marcan nada', () => {
  assert.strictEqual(utils.cabysPareceMedicamento(''), false);
  assert.strictEqual(utils.cabysPareceMedicamento(null), false);
  assert.strictEqual(utils.cabysPareceMedicamento(undefined), false);
});

test('la categoría también puede sugerirlo', () => {
  const categorias = [
    { id: 1, name: 'Línea de Ciclo', description: '' },
    { id: 2, name: 'Medicamentos', description: '' },
    { id: 3, name: 'Farmacia', description: 'productos farmaceuticos' }
  ];
  assert.strictEqual(utils.categoriaPareceMedicamento(1, categorias), false);
  assert.strictEqual(utils.categoriaPareceMedicamento(2, categorias), true);
  assert.strictEqual(utils.categoriaPareceMedicamento(3, categorias), true);
});

test('pareceMedicamento combina CABYS y categoría', () => {
  const categorias = [{ id: 1, name: 'Línea de Ciclo', description: '' }];
  // El caso exacto que reportó el usuario: producto de línea de ciclo con
  // CABYS 3543... Antes se marcaba solo y no se podía desmarcar.
  assert.strictEqual(utils.pareceMedicamento('3543001999900', 1, categorias), false);
  assert.strictEqual(utils.pareceMedicamento('3521100000000', 1, categorias), true);
});

test('sin categorías cargadas no revienta', () => {
  assert.strictEqual(utils.categoriaPareceMedicamento(1, undefined), false);
  assert.strictEqual(utils.pareceMedicamento('3543001999900', 1, undefined), false);
});

// ---- La regla del BACKEND ----
//
// Existe una copia en cada lado. Si divergen, el usuario desmarca la casilla
// en pantalla y el servidor se la vuelve a marcar — que es exactamente lo que
// pasaba: el frontend mandaba esMedicamento:'false' y el backend respondía
// 400 exigiendo forma farmacéutica.
const backend = require('../src/utils/medicamento');

test('backend y frontend usan el MISMO prefijo', () => {
  assert.strictEqual(backend.CABYS_MEDICAMENTOS, '352');
  for (const [codigo] of REALES) {
    assert.strictEqual(
      backend.cabysPareceMedicamento(codigo),
      utils.cabysPareceMedicamento(codigo),
      `backend y frontend difieren para ${codigo}`
    );
  }
});

test('el backend tampoco marca los CABYS reales del catálogo', () => {
  for (const [codigo, nombre] of REALES) {
    assert.strictEqual(backend.cabysPareceMedicamento(codigo), false, `${nombre} (${codigo})`);
  }
  assert.strictEqual(backend.cabysPareceMedicamento('3521100000000'), true);
});

test('la decisión de quien envía gana sobre la detección', () => {
  // Reproduce la lógica de crearProducto: si vino el campo, manda.
  const decidir = (esMedicamento, cabys) => {
    const sePronuncio = esMedicamento === 'true' || esMedicamento === 'false';
    return sePronuncio ? esMedicamento === 'true' : backend.cabysPareceMedicamento(cabys);
  };
  // El caso del usuario: casilla desmarcada, CABYS 3543 de línea de ciclo.
  assert.strictEqual(decidir('false', '3543001999900'), false);
  // Marcada a mano sobre un CABYS cualquiera: se respeta.
  assert.strictEqual(decidir('true', '1234567890123'), true);
  // Sin pronunciarse, decide la detección.
  assert.strictEqual(decidir(undefined, '3521100000000'), true);
  assert.strictEqual(decidir(undefined, '3543001999900'), false);
});
