const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapProducto } = require('../src/modules/catalogo-clientes/consultaProducto');

test('la clasificación pública limita también los campos anidados de la foto', () => {
  const producto = mapProducto({ producto_id: 15, nombre: 'Candado 32', precio_sin_iva: 100,
    tarifa: 13, categoria: 'Ferretería', categoria_visible: 'Herramientas', sub_id: 9, sub_nombre: 'Candados',
    marca_id: 7, marca_nombre: 'Tricicle', marca_imagen: { url: '/archivos/marcas/7.webp', ancho: 600, alto: 900, secreto: 'ZZ', costo: 99 },
    costo_con_iva: 70, margen: 40 });
  assert.equal(producto.precio, 113);
  assert.equal(producto.categoriaVisible, 'Herramientas');
  assert.deepEqual(producto.subcategoria, { id: 9, nombre: 'Candados' });
  assert.deepEqual(producto.marca, { id: 7, nombre: 'Tricicle', imagen: { url: '/archivos/marcas/7.webp', ancho: 600, alto: 900 } });
  assert.doesNotMatch(JSON.stringify(producto), /secreto|costo|margen/);
  const { marcaPublica } = require('../src/utils/marcaPublica');
  assert.equal(marcaPublica(7, 'Tricicle', { url: { secreto: 'ZZ' } }).imagen, null);
  assert.doesNotMatch(JSON.stringify(marcaPublica(7, 'Tricicle', { url: '/foto.webp', ancho: { costo: 10 }, alto: 900 })), /costo/);
});

test('una marca repartida entre páginas conserva una portada y todas sus presentaciones', async () => {
  const { gruposCatalogoClientes } = await import('../../frontend/src/utils/gruposCatalogoClientes.js');
  const producto = (id, nombre) => ({ id, nombre, categoria: 'Ferretería',
    subcategoria: { id: 1, nombre: 'Candados' }, marca: { id: 8, nombre: 'Tricicle' } });
  const primera = [producto(1, 'Candado 100 mm'), producto(2, 'Candado 25 mm')];
  const segunda = [producto(3, 'Candado 32 mm'), { id: 4, nombre: 'Suelto', categoria: 'Ferretería' }];
  const anteriores = JSON.stringify(primera);
  const grupos = gruposCatalogoClientes([...primera, ...segunda]);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].subcategorias.length, 2);
  const marca = grupos[0].subcategorias[0].items[0];
  assert.deepEqual(marca.presentaciones.map(p => p.id), [2, 3, 1]);
  assert.equal(grupos[0].subcategorias[1].nombre, 'Otros');
  assert.equal(JSON.stringify(primera), anteriores);
});

test('el mismo nombre de marca en dos familias no mezcla sus productos ni revive filtrados', async () => {
  const { gruposCatalogoClientes } = await import('../../frontend/src/utils/gruposCatalogoClientes.js');
  const productos = [1, 2].map(id => ({ id, nombre: 'Candado', categoria: 'Ferretería',
    subcategoria: { id, nombre: `Familia ${id}` }, marca: { id, nombre: 'Tricicle' } }));
  const grupos = gruposCatalogoClientes(productos);
  assert.deepEqual(grupos[0].subcategorias.map(s => s.items[0].presentaciones.map(p => p.id)), [[1], [2]]);
  assert.equal(gruposCatalogoClientes(productos.slice(1))[0].subcategorias[0].items[0].presentaciones.length, 1);
  assert.equal(gruposCatalogoClientes([{ id: 9, nombre: 'Sin clasificar' }])[0].subcategorias[0].nombre, '');
});
