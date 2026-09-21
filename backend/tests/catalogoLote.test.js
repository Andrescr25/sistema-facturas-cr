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
