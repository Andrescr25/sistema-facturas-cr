const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const cargar = () => import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/filasCatalogo.js')));

for (const columnas of [2, 3, 4]) test(`subcategorías visibles sin huecos ni cambios de orden, ${columnas} columnas`, async () => {
  const { filasDelCatalogo, nombreDeFamilia } = await cargar();
  const familias = [
    { nombre: 'PVC 10', productos: [{ id: 1 }] },
    { nombre: 'PVC 2', productos: [{ id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] },
    { nombre: 'Otros', sinClasificar: true, productos: [{ id: 6 }, { id: 7 }] },
  ];
  const { filas, grupos, inicioPorFamilia } = filasDelCatalogo([], familias, columnas);
  assert.deepEqual(filas.flatMap(f => f.productos).map(p => p.id), [1,2,3,4,5,6,7]);
  assert.ok(filas.slice(0,-1).every(f => f.productos.length === columnas));
  for (let i = 0; i < grupos.length; i++) {
    const inicio = inicioPorFamilia.get(i);
    assert.ok(filas[inicio].familias.includes(i), 'el destino tiene un título de la familia');
    assert.ok(filas[inicio].productos.includes(grupos[i].productos[0]));
  }
  assert.equal(nombreDeFamilia(grupos[2]), 'Sin subcategoría');
});

// Pedido del usuario (2026-10-22): la foto de marca es una portada que
// presenta sus productos y ocupa dos casillas (la fila entera en tablet).
// Si no cabe, la siguiente ficha suelta de su subcategoría se adelanta para
// no dejar hueco («llenar las filas», 2026-10-07).
const marca = id => ({ id: `M${id}`, esMarca: true });
const ESPERADO = {
  2: [1, 2, 'M1', 3, 4, 'M2', 'M3', 5, 6, 7],
  3: [1, 'M1', 2, 3, 4, 'M2', 5, 'M3', 6, 7],
  4: [1, 'M1', 2, 3, 4, 'M2', 'M3', 5, 6, 7],
};
for (const columnas of [2, 3, 4]) test(`la portada de una marca ocupa dos casillas y las filas siguen llenas, ${columnas} columnas`, async () => {
  const { filasDelCatalogo, anchoEnFila } = await cargar();
  const familias = [
    { nombre: 'Llantas', productos: [{ id: 1 }, marca(1), { id: 2 }, { id: 3 }, { id: 4 }, marca(2), marca(3), { id: 5 }] },
    { nombre: 'Neumáticos', productos: [{ id: 6 }, { id: 7 }] },
  ];
  const { filas, grupos, inicioPorFamilia } = filasDelCatalogo([], familias, columnas);
  assert.deepEqual(filas.flatMap(f => f.productos).map(p => p.id), ESPERADO[columnas]);
  const ocupadas = f => f.productos.reduce((n, p) => n + anchoEnFila(p, columnas), 0);
  assert.ok(filas.slice(0, -1).every(f => ocupadas(f) === columnas), 'sin huecos');
  assert.equal(anchoEnFila(marca(9), 2), 2, 'en la tablet ocupa la fila entera');
  for (let i = 0; i < grupos.length; i++) assert.ok(filas[inicioPorFamilia.get(i)].productos.includes(grupos[i].productos[0]));
});

test('la portada no trae productos de otra subcategoría para tapar un hueco', async () => {
  const { filasDelCatalogo } = await cargar();
  const { filas } = filasDelCatalogo([], [
    { nombre: 'Candados', productos: [{ id: 1 }, marca(1)] },
    { nombre: 'Cadenas', productos: [{ id: 2 }] },
  ], 2);
  assert.deepEqual(filas.map(f => f.productos.map(p => p.id)), [[1], ['M1'], [2]], 'queda la casilla libre');
});

test('buscar conserva el orden de relevancia y no inventa familias', async () => {
  const { filasDelCatalogo } = await cargar();
  const productos = [{ id: 8 }, { id: 2 }, { id: 5 }];
  const { filas, grupos, inicioPorFamilia } = filasDelCatalogo(productos, null, 2);
  assert.deepEqual(filas.flatMap(f => f.productos), productos);
  assert.equal(grupos.length, 0);
  assert.equal(inicioPorFamilia.size, 0);
  assert.ok(filas.every(f => !f.familias.length));
});

test('una familia vacía no crea un salto a una fila inexistente', async () => {
  const { filasDelCatalogo } = await cargar();
  const { filas, grupos, inicioPorFamilia } = filasDelCatalogo([], [
    { nombre: 'Vacía', productos: [] }, { nombre: 'Real', productos: [{ id: 1 }] }
  ], 2);
  assert.equal(grupos.length, 1);
  assert.equal(inicioPorFamilia.get(0), 0);
  assert.equal(filas.length, 1);
});
