const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { filaDeCache } = require('../src/integrations/alegra/productoCache');

/**
 * Gestión de Catálogo lee de alegra_products_cache, no de Alegra.
 *
 * Cuando alguien creaba un producto desde Revisión de Precios, la fila se
 * guardaba con cinco campos: id, nombre, referencia, precio y texto de
 * búsqueda. Sin categoría y sin foto, que es justo lo que se acababa de
 * llenar en el formulario. El producto aparecía pelado hasta que corriera la
 * sincronización completa; y si se desactivaba antes de eso se quedaba así
 * para siempre, porque el sincronizador no reescribe campo por campo los
 * productos inactivos (BOTA BELLOTA PVC 27, alegra_id 2132, lleva así desde
 * el 3 de setiembre).
 */

// Respuesta real de Alegra para el ítem 2133, recortada a lo que se usa.
const PRODUCTO_ALEGRA = {
  id: 2133,
  name: 'BOTA BELLOTA PVC 27 ( 42 )',
  description: 'BOTA BELLOTA PVC  27  ( 42 )',
  reference: { type: 'CODE_OF_INTERNAL_USE', reference: '7000432' },
  price: [{ idPriceList: 1, name: 'General', price: 5625, main: true }],
  inventory: { unit: 'unit', availableQuantity: 3, unitCost: 4764.64 },
  itemCategory: { id: 8, name: 'Ferretería', status: 'active' },
  images: [{ id: '9', url: 'https://cdn3.alegra.com/foto.jpg?firma=abc', favorite: true }],
  tax: [{ id: '1', name: 'IVA', percentage: '13.00' }],
  status: 'active',
  type: 'product'
};

test('la fila de caché sale completa, no con cinco campos', () => {
  const fila = filaDeCache(PRODUCTO_ALEGRA);
  assert.equal(fila.category, 'Ferretería');
  assert.equal(fila.imageUrl, 'https://cdn3.alegra.com/foto.jpg?firma=abc');
  assert.equal(fila.cost, 4764.64);
  assert.equal(fila.taxPercentage, 13);
  assert.equal(fila.description, 'BOTA BELLOTA PVC  27  ( 42 )');
  assert.equal(fila.status, 'active');
  assert.equal(fila.type, 'product');
});

test('la referencia se desenvuelve venga como objeto o como texto', () => {
  assert.equal(filaDeCache(PRODUCTO_ALEGRA).reference, '7000432');
  assert.equal(filaDeCache({ ...PRODUCTO_ALEGRA, reference: '7000432' }).reference, '7000432');
  assert.equal(filaDeCache({ ...PRODUCTO_ALEGRA, reference: null }).reference, '');
});

test('el precio es el de la lista principal', () => {
  const varias = {
    ...PRODUCTO_ALEGRA,
    price: [
      { name: 'Mayoreo', price: 4900, main: false },
      { name: 'General', price: 5625, main: true }
    ]
  };
  assert.equal(filaDeCache(varias).price, 5625);
});

test('la foto favorita gana; si no hay favorita, la primera', () => {
  const dos = {
    ...PRODUCTO_ALEGRA,
    images: [
      { url: 'https://cdn3.alegra.com/vieja.jpg', favorite: false },
      { url: 'https://cdn3.alegra.com/buena.jpg', favorite: true }
    ]
  };
  assert.equal(filaDeCache(dos).imageUrl, 'https://cdn3.alegra.com/buena.jpg');

  const sinFavorita = { ...PRODUCTO_ALEGRA, images: [{ url: 'https://cdn3.alegra.com/unica.jpg' }] };
  assert.equal(filaDeCache(sinFavorita).imageUrl, 'https://cdn3.alegra.com/unica.jpg');

  assert.equal(filaDeCache({ ...PRODUCTO_ALEGRA, images: [] }).imageUrl, '');
});

test('sin impuestos el IVA queda en 0, no en NULL', () => {
  // 0 es "exento"; NULL es "nunca se sincronizó". La caché los distingue.
  const exento = filaDeCache({ ...PRODUCTO_ALEGRA, tax: [] });
  assert.equal(exento.taxPercentage, 0);
  assert.notEqual(exento.taxPercentage, null);
});

test('se suman las tasas cuando el producto trae más de un impuesto', () => {
  const dos = { ...PRODUCTO_ALEGRA, tax: [{ percentage: '13.00' }, { percentage: '2.00' }] };
  assert.equal(filaDeCache(dos).taxPercentage, 15);
});

test('el texto de búsqueda incluye nombre, referencia y descripción', () => {
  const t = filaDeCache(PRODUCTO_ALEGRA).searchText;
  assert.ok(t.includes('bota bellota'), t);
  assert.ok(t.includes('7000432'), t);
  assert.equal(t, t.toLowerCase());
});

test('el alta de un producto desde una línea del proveedor ya no pasa por esta caché', () => {
  // En esta rama el producto nace en el maestro propio (productoDesdeLinea.js)
  // y Gestión de Catálogo lee de ahí: no hay fila de caché que armar ni nada
  // que releer de Alegra. El problema que cuidaba esta prueba —el producto
  // recién creado aparecía sin foto ni categoría— ya no puede pasar: la
  // categoría va en el mismo INSERT y la foto se guarda sobre `producto`.
  for (const archivo of ['productoDesdeLinea.js', 'productos-revision.service.js']) {
    const fuente = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'modules', 'productos-revision', archivo), 'utf8');
    assert.doesNotMatch(fuente, /filaDeCache|alegraProduct\.create|createProduct\(/, `${archivo} todavía escribe la caché o crea en Alegra`);
  }
});

test('el sincronizador arma la fila con el mismo mapeo', () => {
  const sync = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'integrations', 'alegra', 'services', 'alegra-sync.service.js'),
    'utf8');
  assert.match(sync, /filaDeCache\(product\)/,
    'si el sincronizador vuelve a tener su propia copia, los dos caminos se separan otra vez');
});
