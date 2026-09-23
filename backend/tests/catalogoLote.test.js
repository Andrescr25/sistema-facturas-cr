const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * Cambiar la categoría de un producto (uno solo o en lote) desde Gestión de
 * Catálogo.
 *
 * La subcategoría es DE una categoría (ver subcategorias.service.js): si el
 * producto se muda de categoría, la subcategoría vieja ya no aplica. Antes se
 * quedaba pegada — un producto podía terminar en "Ferretería" apuntando
 * todavía a una subcategoría de "Línea de Ciclo" sin que nada lo avisara, ni
 * en la pantalla ni en la base.
 *
 * El cambio en lote no espera a que Alegra responda por cada producto (~3 s
 * c/u): crea un trabajo en memoria y lo corre en segundo plano, para que la
 * pantalla no se congele con 80 productos seleccionados.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaPrisma = path.join(__dirname, '..', 'lib', 'prisma.js');
const rutaAlegra = path.join(__dirname, '..', 'src', 'integrations', 'alegra', 'index.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'catalogo', 'catalogo.service.js');
const rutaCategorias = path.join(__dirname, '..', 'src', 'modules', 'catalogo', 'categorias.service.js');
const rutaSubcategorias = path.join(__dirname, '..', 'src', 'modules', 'catalogo', 'subcategorias.service.js');

function montar({ categoriaActual = 'Productos de PVC', categoriaDevuelta = categoriaActual } = {}) {
  for (const r of [rutaDb, rutaPrisma, rutaAlegra, rutaServicio, rutaCategorias, rutaSubcategorias]) {
    delete require.cache[r];
  }

  const visto = { consultas: [], puts: [] };

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        visto.consultas.push({ sql, params });
        return { rows: [] };
      }
    }
  };

  require.cache[rutaPrisma] = {
    id: rutaPrisma, filename: rutaPrisma, loaded: true,
    exports: {
      alegraProduct: {
        findUnique: async ({ where }) => (where.alegraId === '1031' ? { category: categoriaActual } : null),
        findMany: async () => [{ alegraId: '1031', name: 'CODO 1/2 PVC', reference: 'REF-1031', price: 100, cost: 80 }],
        update: async ({ where, data }) => ({ alegraId: where.alegraId, ...data })
      }
    }
  };

  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: {
      getProductService: () => ({}),
      getClient: () => ({
        api: {
          get: async () => ({
            data: { reference: { type: 'CODE_OF_INTERNAL_USE' }, price: [{ main: true, price: '100' }] }
          }),
          put: async (url, data) => {
            visto.puts.push({ url, data });
            return {
              data: {
                name: data.name,
                reference: data.reference,
                itemCategory: { name: categoriaDevuelta }
              }
            };
          }
        }
      })
    }
  };

  return { servicio: require(rutaServicio), visto };
}

describe('editar un producto: cambiar de categoría limpia la subcategoría', () => {
  test('si la categoría cambia, subcategoria_id se limpia', async () => {
    const { servicio, visto } = montar({ categoriaActual: 'Productos de PVC', categoriaDevuelta: 'Ferretería' });
    await servicio.editarProducto('1031', { name: 'CODO 1/2 PVC', reference: 'REF-1031', price: 100, cost: 80, category: '8' });

    assert.ok(visto.consultas.some(c => /SET subcategoria_id = NULL WHERE alegra_id = \$1/.test(c.sql)));
  });

  test('si la categoría no cambia (aunque se mande el mismo id), no toca subcategoria_id', async () => {
    const { servicio, visto } = montar({ categoriaActual: 'Productos de PVC', categoriaDevuelta: 'Productos de PVC' });
    await servicio.editarProducto('1031', { name: 'CODO 1/2 PVC', reference: 'REF-1031', price: 100, cost: 80, category: '1' });

    assert.ok(!visto.consultas.some(c => /subcategoria_id/.test(c.sql)));
  });

  test('sin mandar category, ni se pregunta la categoría anterior ni se toca la subcategoría', async () => {
    const { servicio, visto } = montar({ categoriaActual: 'Productos de PVC' });
    await servicio.editarProducto('1031', { name: 'CODO 1/2 PVC', reference: 'REF-1031', price: 100, cost: 80 });

    assert.ok(!visto.consultas.some(c => /subcategoria_id/.test(c.sql)));
  });
});

describe('cambiar la categoría de varios productos (trabajo en segundo plano)', () => {
  test('devuelve el jobId al toque, sin esperar a que Alegra responda', async () => {
    const { servicio } = montar({ categoriaActual: 'Productos de PVC', categoriaDevuelta: 'Ferretería' });
    const r = await servicio.cambiarCategoriaLote(['1031'], '8');

    assert.ok(r.jobId, 'debería devolver un jobId');
    assert.equal(r.total, 1);
  });

  test('el trabajo termina solo y se puede sondear', async () => {
    const { servicio } = montar({ categoriaActual: 'Productos de PVC', categoriaDevuelta: 'Ferretería' });
    const { jobId } = await servicio.cambiarCategoriaLote(['1031'], '8');

    let estado;
    for (let i = 0; i < 50 && !(estado?.terminado); i++) {
      estado = servicio.estadoTrabajo(jobId);
      if (!estado.terminado) await new Promise((r) => setTimeout(r, 10));
    }

    assert.equal(estado.terminado, true);
    assert.equal(estado.hechos, 1);
    assert.deepEqual(estado.errores, []);
  });

  test('sin lista, se dice de una vez (no crea un trabajo vacío)', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.cambiarCategoriaLote([], '8'), /Falta la lista/);
  });

  test('sin categoría destino, también', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.cambiarCategoriaLote(['1031'], ''), /Falta la categoría destino/);
  });

  test('un jobId que no existe (o ya se limpió) se dice con 404', () => {
    const { servicio } = montar();
    assert.throws(() => servicio.estadoTrabajo('no-existe'), (e) => e.status === 404);
  });
});

/**
 * Mover una subcategoría completa a otra categoría. La base va con un doble
 * que responde según el SQL; Alegra con uno que puede rechazar productos.
 */
function montarMover({ yaExisteEnDestino = null, rechazar = [], productos = ['1031', '1032'] } = {}) {
  for (const r of [rutaDb, rutaPrisma, rutaAlegra, rutaServicio, rutaCategorias, rutaSubcategorias]) {
    delete require.cache[r];
  }
  const visto = { consultas: [] };

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        visto.consultas.push({ sql, params });
        if (/SELECT id, categoria, nombre FROM subcategoria WHERE id/.test(sql)) {
          return { rows: [{ id: 9, categoria: 'Productos de PVC', nombre: 'Conduit' }] };
        }
        if (/FROM alegra_products_cache WHERE subcategoria_id = \$1/.test(sql) && /SELECT alegra_id/.test(sql)) {
          return { rows: productos.map((id) => ({ alegraId: id, name: `P${id}`, reference: `R${id}`, price: 100, cost: 80 })) };
        }
        if (/WHERE categoria = \$1 AND lower\(nombre\)/.test(sql)) {
          return { rows: yaExisteEnDestino ? [{ id: yaExisteEnDestino }] : [] };
        }
        if (/INSERT INTO subcategoria/.test(sql)) return { rows: [{ id: 77 }] };
        return { rows: [] };
      }
    }
  };

  require.cache[rutaPrisma] = {
    id: rutaPrisma, filename: rutaPrisma, loaded: true,
    exports: {
      alegraProduct: {
        findUnique: async () => ({ category: 'Productos de PVC' }),
        update: async ({ where, data }) => ({ alegraId: where.alegraId, ...data })
      }
    }
  };

  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: {
      getProductService: () => ({
        getItemCategories: async () => [{ id: '16', name: 'Productos de PVC' }, { id: '10', name: 'Línea Eléctrica' }]
      }),
      getClient: () => ({
        api: {
          get: async () => ({ data: { reference: { type: 'CODE_OF_INTERNAL_USE' }, price: [{ main: true, price: '100' }] } }),
          put: async (url, data) => {
            const id = url.split('/').pop();
            if (rechazar.includes(id)) throw Object.assign(new Error('rechazado'), { response: { status: 400, data: { message: 'Alegra dijo que no' } } });
            return { data: { name: data.name, reference: data.reference, itemCategory: { name: 'Línea Eléctrica' } } };
          }
        }
      })
    }
  };

  return { servicio: require(rutaServicio), visto };
}

async function esperarFin(servicio, jobId) {
  let estado;
  for (let i = 0; i < 100 && !(estado?.terminado); i++) {
    estado = servicio.estadoTrabajo(jobId);
    if (!estado.terminado) await new Promise((r) => setTimeout(r, 10));
  }
  return estado;
}

describe('mover una subcategoría completa a otra categoría', () => {
  test('si pasan todos, la subcategoría misma se muda y sus productos la conservan', async () => {
    const { servicio, visto } = montarMover();
    const { jobId } = await servicio.moverSubcategoriaACategoria(9, '10');
    const estado = await esperarFin(servicio, jobId);

    assert.equal(estado.hechos, 2);
    const mudanza = visto.consultas.find((c) => /UPDATE subcategoria SET categoria = \$2/.test(c.sql));
    assert.ok(mudanza, 'la subcategoría no se mudó');
    assert.deepEqual(mudanza.params, [9, 'Línea Eléctrica']);

    const devuelta = visto.consultas.find((c) => /SET subcategoria_id = \$2 WHERE alegra_id = ANY/.test(c.sql));
    assert.deepEqual(devuelta.params, [['1031', '1032'], 9]);
    assert.equal(estado.resultado.subcategoriaId, 9);
  });

  test('si el destino ya tiene una del mismo nombre, se juntan ahí y la original se borra', async () => {
    const { servicio, visto } = montarMover({ yaExisteEnDestino: 44 });
    const { jobId } = await servicio.moverSubcategoriaACategoria(9, '10');
    const estado = await esperarFin(servicio, jobId);

    assert.ok(!visto.consultas.some((c) => /UPDATE subcategoria SET categoria/.test(c.sql)),
      'no puede mudarla: chocaría con el índice único (categoría + nombre)');
    const devuelta = visto.consultas.find((c) => /SET subcategoria_id = \$2 WHERE alegra_id = ANY/.test(c.sql));
    assert.equal(devuelta.params[1], 44);
    assert.ok(visto.consultas.some((c) => /DELETE FROM subcategoria WHERE id = \$1/.test(c.sql)));
    assert.equal(estado.resultado.juntada, true);
  });

  test('si Alegra rechaza algunos, la original se queda con esos y los demás van a una nueva en el destino', async () => {
    const { servicio, visto } = montarMover({ rechazar: ['1032'] });
    const { jobId } = await servicio.moverSubcategoriaACategoria(9, '10');
    const estado = await esperarFin(servicio, jobId);

    assert.equal(estado.errores.length, 1);
    assert.ok(!visto.consultas.some((c) => /UPDATE subcategoria SET categoria/.test(c.sql)),
      'la original no se puede mudar: todavía tiene un producto en la categoría vieja');
    assert.ok(visto.consultas.some((c) => /INSERT INTO subcategoria/.test(c.sql)));
    const devuelta = visto.consultas.find((c) => /SET subcategoria_id = \$2 WHERE alegra_id = ANY/.test(c.sql));
    assert.deepEqual(devuelta.params, [['1031'], 77]);
  });

  test('si Alegra rechaza todos, no se toca ninguna subcategoría', async () => {
    const { servicio, visto } = montarMover({ rechazar: ['1031', '1032'] });
    const { jobId } = await servicio.moverSubcategoriaACategoria(9, '10');
    await esperarFin(servicio, jobId);

    assert.ok(!visto.consultas.some((c) => /UPDATE subcategoria|INSERT INTO subcategoria|DELETE FROM subcategoria/.test(c.sql)));
  });

  test('a la misma categoría en la que ya está, se dice de una vez', async () => {
    const { servicio } = montarMover();
    await assert.rejects(servicio.moverSubcategoriaACategoria(9, '16'), (e) => e.status === 400 && /ya está en/.test(e.message));
  });

  test('a una categoría que no existe en Alegra, 404', async () => {
    const { servicio } = montarMover();
    await assert.rejects(servicio.moverSubcategoriaACategoria(9, '999'), (e) => e.status === 404);
  });
});
