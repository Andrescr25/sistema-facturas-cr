const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * Subcategorías dentro de cada categoría.
 *
 * Las categorías vienen de Alegra y son PLANAS: 18 bolsas grandes donde no se
 * encuentra nada. "Productos de PVC" son 118 piezas con sanitario, potable,
 * conduit —que ni siquiera es plomería—, pegamentos y accesorios de baño
 * revueltos. En Eléctrica pasa con los bombillos y en Pesca con casi todo.
 *
 * La subcategoría es NUESTRA: no se manda a Alegra ni se lee de allá.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'catalogo', 'subcategorias.service.js');

/**
 * @param respuestas  qué devuelve la base según lo que se le pregunte
 */
function montar(respuestas = {}) {
  for (const r of [rutaDb, rutaServicio]) delete require.cache[r];

  const visto = { consultas: [] };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        visto.consultas.push({ sql, params });
        for (const [patron, valor] of Object.entries(respuestas)) {
          if (new RegExp(patron).test(sql)) {
            if (valor instanceof Error) throw valor;
            return { rows: valor };
          }
        }
        return { rows: [] };
      }
    }
  };
  return { servicio: require(rutaServicio), visto };
}

const PVC = [{ alegra_id: '1031', category: 'Productos de PVC' }];

describe('crear una subcategoría', () => {
  test('guarda el nombre limpio', async () => {
    const { servicio, visto } = montar({ 'INSERT INTO subcategoria': [{ id: 1, categoria: 'Productos de PVC', nombre: 'Sanitario', activo: true }] });
    await servicio.crear({ categoria: 'Productos de PVC', nombre: '  Sanitario  ' });

    const q = visto.consultas.find(c => /INSERT INTO subcategoria/.test(c.sql));
    assert.deepEqual(q.params, ['Productos de PVC', 'Sanitario']);
  });

  test('sin nombre no se crea', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.crear({ categoria: 'Productos de PVC', nombre: '   ' }), /necesita un nombre/);
  });

  test('sin categoría tampoco: quedaría colgando de ninguna', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.crear({ categoria: '', nombre: 'Sanitario' }), /a qué categoría/);
  });

  test('una repetida se dice con nombre y apellido', async () => {
    // Dos iguales en la misma categoría no se distinguen en un desplegable.
    const duplicada = new Error('duplicate key');
    duplicada.code = '23505';
    const { servicio } = montar({ 'INSERT INTO subcategoria': duplicada });

    await assert.rejects(
      servicio.crear({ categoria: 'Productos de PVC', nombre: 'Sanitario' }),
      (e) => e.status === 409 && /"Sanitario" ya existe en Productos de PVC/.test(e.message)
    );
  });
});

describe('asignarle la subcategoría a un producto', () => {
  test('la pone cuando es de la misma categoría', async () => {
    const { servicio, visto } = montar({
      'FROM alegra_products_cache WHERE alegra_id': PVC,
      'FROM subcategoria WHERE id': [{ id: 4, categoria: 'Productos de PVC', nombre: 'Sanitario' }]
    });

    const r = await servicio.asignarAProducto('1031', 4);

    assert.equal(r.subcategoriaId, 4);
    assert.ok(visto.consultas.some(c => /UPDATE alegra_products_cache SET subcategoria_id = \$2/.test(c.sql)));
  });

  test('NO deja marcar un bombillo como "Sanitario"', async () => {
    // Mandando el id a mano se podía cruzar categorías, y el catálogo quedaba
    // peor ordenado que antes.
    const { servicio } = montar({
      'FROM alegra_products_cache WHERE alegra_id': PVC,
      'FROM subcategoria WHERE id': [{ id: 9, categoria: 'Línea Eléctrica', nombre: 'Bombillos' }]
    });

    await assert.rejects(
      servicio.asignarAProducto('1031', 9),
      (e) => e.status === 400 && /es de Línea Eléctrica/.test(e.message)
    );
  });

  test('mandar vacío la quita', async () => {
    const { servicio, visto } = montar({ 'FROM alegra_products_cache WHERE alegra_id': PVC });
    const r = await servicio.asignarAProducto('1031', null);

    assert.equal(r.subcategoriaId, null);
    assert.ok(visto.consultas.some(c => /SET subcategoria_id = NULL/.test(c.sql)));
  });

  test('un producto que no existe se dice', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.asignarAProducto('99999', 4), (e) => e.status === 404);
  });

  test('una subcategoría que no existe se dice', async () => {
    const { servicio } = montar({ 'FROM alegra_products_cache WHERE alegra_id': PVC });
    await assert.rejects(servicio.asignarAProducto('1031', 777), (e) => e.status === 404);
  });
});

describe('listar', () => {
  test('cuenta cuántos productos tiene cada una', async () => {
    // Es el número que dice cuánto falta por ordenar.
    const { servicio, visto } = montar({ 'FROM subcategoria s': [] });
    await servicio.listar({});

    const q = visto.consultas.find(c => /FROM subcategoria s/.test(c.sql));
    assert.match(q.sql, /COUNT\(\*\)::int FROM alegra_products_cache/);
    assert.match(q.sql, /p\.status = 'active'/);
  });

  test('por defecto no trae las desactivadas', async () => {
    const { servicio, visto } = montar({ 'FROM subcategoria s': [] });
    await servicio.listar({});
    assert.match(visto.consultas[0].sql, /s\.activo/);
  });

  test('se puede pedir las de una sola categoría', async () => {
    const { servicio, visto } = montar({ 'FROM subcategoria s': [] });
    await servicio.listar({ categoria: 'Productos de PVC' });

    assert.match(visto.consultas[0].sql, /s\.categoria = \$1/);
    assert.deepEqual(visto.consultas[0].params, ['Productos de PVC']);
  });
});

describe('reordenar', () => {
  test('cada una recibe su posición como orden', async () => {
    const { servicio, visto } = montar({
      'FROM subcategoria WHERE id': [
        { id: 5, categoria: 'Productos de PVC' },
        { id: 9, categoria: 'Productos de PVC' }
      ]
    });
    await servicio.reordenar('Productos de PVC', [9, 5]);

    const updates = visto.consultas.filter(c => /UPDATE subcategoria SET orden/.test(c.sql));
    assert.deepEqual(updates.map(u => u.params), [[9, 0], [5, 1]]);
  });

  test('NO deja reordenar una subcategoría de otra categoría', async () => {
    const { servicio } = montar({
      'FROM subcategoria WHERE id': [
        { id: 5, categoria: 'Productos de PVC' },
        { id: 9, categoria: 'Línea Eléctrica' }
      ]
    });
    await assert.rejects(
      servicio.reordenar('Productos de PVC', [5, 9]),
      (e) => e.status === 400 && /no es de Productos de PVC/.test(e.message)
    );
  });

  test('sin lista, se dice', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.reordenar('Productos de PVC', []), /Falta la lista/);
  });
});

describe('desactivar', () => {
  test('NO desclasifica los productos que ya tiene', async () => {
    // Es lo que permite dejar de ofrecerla sin perder el trabajo de
    // clasificar, y volver atrás si se desactivó por error.
    const { servicio, visto } = montar({ 'UPDATE subcategoria SET activo': [{ id: 3, categoria: 'X', nombre: 'Y', activo: false }] });
    await servicio.cambiarEstado(3, false);

    assert.ok(
      !visto.consultas.some(c => /alegra_products_cache/.test(c.sql)),
      'tocó los productos al desactivar la subcategoría'
    );
  });
});
