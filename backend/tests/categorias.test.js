const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * Orden y nombre visible de las categorías de Alegra.
 *
 * Las categorías son de Alegra, planas y de solo lectura: lo único que se
 * guarda acá es dónde mostrarlas y cómo llamarlas EN PANTALLA. El nombre real
 * de Alegra nunca cambia, porque es el que usa todo lo demás (productos,
 * subcategorías) para cruzar.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaAlegra = path.join(__dirname, '..', 'src', 'integrations', 'alegra', 'index.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'catalogo', 'categorias.service.js');

const ALEGRA_CATEGORIAS = [
  { id: 1, name: 'Productos de PVC' },
  { id: 2, name: 'Línea Eléctrica' },
  { id: 3, name: 'Productos de Pesca' }
];

function montar({ config = [] } = {}) {
  for (const r of [rutaDb, rutaAlegra, rutaServicio]) delete require.cache[r];

  const visto = { consultas: [], llamadasAlegra: 0 };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        visto.consultas.push({ sql, params });
        if (/SELECT categoria, nombre_visible, orden FROM categoria_config/.test(sql)) {
          return { rows: config };
        }
        if (/SELECT categoria, nombre_visible FROM categoria_config/.test(sql)) {
          return { rows: config.map(({ categoria, nombre_visible }) => ({ categoria, nombre_visible })) };
        }
        return { rows: [] };
      }
    }
  };
  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: {
      getProductService: () => ({
        getItemCategories: async () => { visto.llamadasAlegra++; return ALEGRA_CATEGORIAS; }
      })
    }
  };
  return { servicio: require(rutaServicio), visto };
}

describe('listar categorías', () => {
  test('sin configurar nada, quedan en el orden en que las trae Alegra', async () => {
    const { servicio } = montar();
    const r = await servicio.listar();
    assert.deepEqual(r.map((c) => c.name), ['Productos de PVC', 'Línea Eléctrica', 'Productos de Pesca']);
  });

  test('una categoría configurada se antepone a las que no', async () => {
    const { servicio } = montar({ config: [{ categoria: 'Productos de Pesca', nombre_visible: null, orden: 0 }] });
    const r = await servicio.listar();
    assert.equal(r[0].name, 'Productos de Pesca');
  });

  test('el nombre visible no reemplaza el nombre real', async () => {
    const { servicio } = montar({ config: [{ categoria: 'Productos de PVC', nombre_visible: 'PVC', orden: 0 }] });
    const r = await servicio.listar();
    const pvc = r.find((c) => c.name === 'Productos de PVC');
    assert.equal(pvc.nombreVisible, 'PVC');
    assert.equal(pvc.name, 'Productos de PVC');
  });

  test('renombrar sin haber ordenado nunca no la manda al principio', async () => {
    // `orden` en NULL es lo que deja una fila creada solo por un renombre
    // (ver `renombrar`): antes, sin esto, un renombre saltaba al principio de
    // todas porque la columna tenía DEFAULT 0.
    const { servicio } = montar({ config: [{ categoria: 'Línea Eléctrica', nombre_visible: 'Eléctrica', orden: null }] });
    const r = await servicio.listar();
    assert.deepEqual(r.map((c) => c.name), ['Productos de PVC', 'Línea Eléctrica', 'Productos de Pesca']);
  });
});

describe('renombrar categoría', () => {
  test('sin categoría no se guarda nada', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.renombrar('', 'PVC'), /Falta la categoría/);
  });

  test('guarda el nombre visible con upsert', async () => {
    const { servicio, visto } = montar();
    await servicio.renombrar('Productos de PVC', 'PVC');
    const q = visto.consultas.find((c) => /INSERT INTO categoria_config/.test(c.sql));
    assert.ok(q, 'no hizo el upsert');
    assert.deepEqual(q.params, ['Productos de PVC', 'PVC']);
    assert.match(q.sql, /ON CONFLICT \(categoria\) DO UPDATE/);
  });
});

describe('reordenar categorías', () => {
  test('sin lista, se dice', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.reordenar([]), /Falta la lista/);
  });

  test('cada una recibe su posición como orden, en un solo upsert', async () => {
    // No una consulta por categoría: eso era lo que tardaba ~3 s con 17.
    const { servicio, visto } = montar();
    const r = await servicio.reordenar(['Productos de Pesca', 'Productos de PVC']);

    const inserts = visto.consultas.filter((c) => /INSERT INTO categoria_config/.test(c.sql));
    assert.equal(inserts.length, 1, 'debería ser un solo INSERT, no uno por categoría');
    assert.deepEqual(inserts[0].params, [['Productos de Pesca', 'Productos de PVC'], [0, 1]]);
    assert.deepEqual(r.map((c) => c.orden), [0, 1]);
  });

  test('no le vuelve a preguntar a Alegra', async () => {
    const { servicio, visto } = montar();
    await servicio.reordenar(['Productos de Pesca']);
    assert.equal(visto.llamadasAlegra, 0);
  });
});
