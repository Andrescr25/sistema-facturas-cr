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
