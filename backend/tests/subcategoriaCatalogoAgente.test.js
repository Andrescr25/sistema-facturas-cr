const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * La subcategoría viajando con el catálogo del agente.
 *
 * La subcategoría es NUESTRA: vive en `alegra_products_cache`, no en Alegra,
 * así que los productos que bajan por `/items` no la traen y hay que
 * pegársela acá.
 *
 * SE PRUEBA PORQUE FALLA EN SILENCIO. Si la consulta se rompe, no hay error
 * en pantalla: las subcategorías simplemente dejan de aparecer y el catálogo
 * se ve igual que siempre. Eso puede pasar semanas sin que nadie lo note, así
 * que el fallo suave tiene que estar probado, no solo escrito.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'catalogo-agente', 'catalogo-agente.service.js');

function montar(responder) {
  for (const r of [rutaDb, rutaServicio]) delete require.cache[r];

  const real = require(rutaDb);
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { ...real, query: responder }
  };

  return require(rutaServicio).conSubcategoria;
}

const FILAS = [
  { alegra_id: '1004', sub_id: 9, sub_nombre: 'PVC 1/2' }
];

describe('la subcategoría viaja con el catálogo del agente', () => {
  test('se la pega al producto que la tiene', async () => {
    const conSubcategoria = montar(async () => ({ rows: FILAS }));
    const [a, b] = await conSubcategoria([{ id: 1004, name: 'UNION' }, { id: 77, name: 'OTRO' }]);

    assert.deepEqual(a.subcategoria, { id: 9, nombre: 'PVC 1/2' });
    // Al que no la tiene no se le inventa un campo vacío: la tarjeta pregunta
    // por `subcategoria?.nombre` y un objeto sin nombre dibujaría un "·" suelto.
    assert.equal('subcategoria' in b, false);
  });

  test('el id de Alegra puede venir como número o como texto', async () => {
    // Alegra manda `id` numérico y nuestra columna es texto. Comparar sin
    // convertir no calza nunca, y la subcategoría no aparecería jamás.
    const conSubcategoria = montar(async () => ({ rows: FILAS }));
    const [n] = await conSubcategoria([{ id: 1004 }]);
    const [t] = await conSubcategoria([{ id: '1004' }]);

    assert.ok(n.subcategoria, 'con id numérico');
    assert.ok(t.subcategoria, 'con id de texto');
  });

  test('si la consulta falla el catálogo sale igual, sin subcategorías', async () => {
    // Es un dato para ordenar la vista, no para vender: que no se pueda leer
    // no puede dejar al agente sin catálogo en la calle.
    const conSubcategoria = montar(async () => { throw new Error('la base dijo que no'); });
    const productos = await conSubcategoria([{ id: 1004, name: 'UNION' }]);

    assert.equal(productos.length, 1);
    assert.equal(productos[0].name, 'UNION');
  });

  test('sin productos no se consulta la base', async () => {
    let llamadas = 0;
    const conSubcategoria = montar(async () => { llamadas++; return { rows: [] }; });
    assert.deepEqual(await conSubcategoria([]), []);
    assert.equal(llamadas, 0);
  });
});
