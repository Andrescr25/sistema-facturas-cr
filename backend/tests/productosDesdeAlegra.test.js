const test = require('node:test');
const assert = require('node:assert');
const { productoDesdeAlegra, categoriaDesdeAlegra, unidadDesdeAlegra } = require('../src/modules/productos/desdeAlegra');

/**
 * Traducción de los productos de Alegra a las tablas propias.
 *
 * El caso base es la respuesta real de GET /items/1183 (11 de setiembre de
 * 2026), recortada. Lo que importa: precio SIN IVA y costo CON IVA en
 * columnas con ese nombre, el impuesto como referencia a la tabla propia, y
 * que nada se invente cuando falta.
 */

const TORNILLO = {
  id: '1183',
  name: 'TORNILLO FRIJOLILLO 3/4 PTA BROCA',
  reference: { type: 'CODE_OF_INTERNAL_USE', reference: 'TOR02' },
  description: null,
  status: 'inactive',
  type: 'product',
  productKey: '4294401030100',
  itemCategory: { id: 8, name: 'Ferretería', status: 'active' },
  price: [{ idPriceList: '1', name: 'General', price: 800, main: true }],
  inventory: { unit: 'unit', unitCost: 900, availableQuantity: 6 },
  tax: [],
  images: [{ id: 2536, favorite: true, url: 'https://cdn3.alegra.com/tornillo.jpg?firma=x' }]
};

const contexto = (extra = {}) => ({
  impuestos: new Map([['1', 11], ['4', 14], ['2', 12]]),
  categorias: new Map([['8', 3], ['22', 9]]),
  ocultos: new Set(),
  ...extra
});

test('el caso real: precio sin IVA, costo con IVA, CABYS, categoría y unidad', () => {
  const { fila } = productoDesdeAlegra(TORNILLO, contexto());
  assert.equal(fila.nombre, 'TORNILLO FRIJOLILLO 3/4 PTA BROCA');
  assert.equal(fila.referencia, 'TOR02');
  assert.equal(fila.precio_sin_iva, 800);
  assert.equal(fila.costo_con_iva, 900);
  assert.equal(fila.cabys, '4294401030100');
  assert.equal(fila.categoria_id, 3);
  assert.equal(fila.unidad, 'Unid');
  assert.equal(fila.activo, false);
  assert.equal(fila.alegra_id, '1183');
  assert.equal(fila.imagen_url, 'https://cdn3.alegra.com/tornillo.jpg?firma=x');
});

test('sin impuesto en Alegra queda sin impuesto, no se le pone 13 %', () => {
  const { fila, avisos } = productoDesdeAlegra(TORNILLO, contexto());
  assert.equal(fila.impuesto_id, null);
  assert.ok(avisos.includes('sin_impuesto'));
});

test('el impuesto se resuelve contra la tabla propia por el id de Alegra', () => {
  const { fila, avisos } = productoDesdeAlegra({ ...TORNILLO, tax: [{ id: '4', percentage: '1.00', type: 'IVA' }] }, contexto());
  assert.equal(fila.impuesto_id, 14);
  assert.equal(avisos.includes('sin_impuesto'), false);
});

test('un impuesto que no está en la tabla propia se avisa, no se adivina', () => {
  const { fila, avisos } = productoDesdeAlegra({ ...TORNILLO, tax: [{ id: '99', percentage: '3.00' }] }, contexto());
  assert.equal(fila.impuesto_id, null);
  assert.ok(avisos.includes('impuesto_desconocido'));
});

test('con varios impuestos se toma el de tipo IVA', () => {
  const { fila } = productoDesdeAlegra({ ...TORNILLO, tax: [{ id: '50', type: 'OTRO' }, { id: '1', type: 'IVA' }] }, contexto());
  assert.equal(fila.impuesto_id, 11);
});

test('un CABYS que no tiene 13 dígitos queda vacío y se avisa', () => {
  for (const [productKey, aviso] of [['12345', 'cabys_invalido'], ['', 'sin_cabys'], [null, 'sin_cabys']]) {
    const { fila, avisos } = productoDesdeAlegra({ ...TORNILLO, productKey }, contexto());
    assert.equal(fila.cabys, null, String(productKey));
    assert.ok(avisos.includes(aviso), `${productKey} → ${aviso}`);
  }
});

test('categoría ausente o desconocida queda vacía con aviso', () => {
  assert.ok(productoDesdeAlegra({ ...TORNILLO, itemCategory: null }, contexto()).avisos.includes('sin_categoria'));
  assert.ok(productoDesdeAlegra({ ...TORNILLO, itemCategory: { id: 77, name: 'X' } }, contexto()).avisos.includes('sin_categoria'));
});

test('medicamentos: por categoría o por sus datos, y se avisa si falta el registro', () => {
  const med = { ...TORNILLO, itemCategory: { id: 22, name: 'Medicamentos' } };
  const r = productoDesdeAlegra(med, contexto());
  assert.equal(r.fila.es_medicamento, true);
  assert.ok(r.avisos.includes('medicamento_sin_registro'));

  const conDatos = productoDesdeAlegra({ ...TORNILLO, pharmaceuticalForm: '12', sanitaryRegistry: 'RS-1234' }, contexto());
  assert.equal(conDatos.fila.es_medicamento, true);
  assert.equal(conDatos.fila.forma_farmaceutica, '12');
  assert.equal(conDatos.avisos.includes('medicamento_sin_registro'), false);
});

test('la foto favorita gana y el oculto local se respeta', () => {
  const dos = { ...TORNILLO, images: [{ url: 'vieja', favorite: false }, { url: 'buena', favorite: true }] };
  assert.equal(productoDesdeAlegra(dos, contexto()).fila.imagen_url, 'buena');
  assert.equal(productoDesdeAlegra(TORNILLO, contexto({ ocultos: new Set(['1183']) })).fila.oculto, true);
});

test('el precio es el de la lista principal', () => {
  const precios = { ...TORNILLO, price: [{ price: 700, main: false }, { price: 800, main: true }] };
  assert.equal(productoDesdeAlegra(precios, contexto()).fila.precio_sin_iva, 800);
});

test('servicios: no inventariables y con unidad de servicio', () => {
  const s = productoDesdeAlegra({ ...TORNILLO, type: 'service', inventory: { unit: 'anotherTypeOfService' } }, contexto());
  assert.equal(s.fila.inventariable, false);
  assert.equal(s.fila.unidad, 'Os');
  assert.equal(unidadDesdeAlegra('kg'), 'kg');
});

test('la referencia vacía queda nula, venga como objeto o como texto', () => {
  assert.equal(productoDesdeAlegra({ ...TORNILLO, reference: { reference: '  ' } }, contexto()).fila.referencia, null);
  assert.equal(productoDesdeAlegra({ ...TORNILLO, reference: 'A-1' }, contexto()).fila.referencia, 'A-1');
});

test('sin id o nombre no se carga a medias', () => {
  assert.throws(() => productoDesdeAlegra({ name: 'x' }, contexto()), /sin id o nombre/);
  assert.throws(() => productoDesdeAlegra({ id: 1 }, contexto()), /sin id o nombre/);
  assert.throws(() => categoriaDesdeAlegra({ id: 1 }), /sin id o nombre/);
  assert.deepEqual(categoriaDesdeAlegra({ id: 7, name: 'r.Venenos' }), { nombre: 'r.Venenos', activo: true, alegra_id: '7' });
});
