const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * Orden y nombre visible de las categorías de Alegra.
 *
 * Las categorías son de Alegra: para mostrarlas y ordenarlas, este módulo
 * solo guarda dónde y cómo llamarlas EN PANTALLA, y el nombre real de Alegra
 * nunca cambia acá, porque es el que usa todo lo demás (productos,
 * subcategorías) para cruzar. La única excepción es `crear`: categorías
 * nuevas SÍ se crean en Alegra desde acá (2026-09-21, partir "Línea de
 * Ciclo" en bici/moto y consolidar "Bolsas y Desechables").
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
  const creadas = [];
  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: {
      getProductService: () => ({
        getItemCategories: async () => { visto.llamadasAlegra++; return ALEGRA_CATEGORIAS; },
        createItemCategory: async (name) => {
          const categoria = { id: 100 + creadas.length, name };
          creadas.push(categoria);
          return categoria;
        }
      })
    }
  };
  return { servicio: require(rutaServicio), visto, creadas };
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

describe('crear categoría', () => {
  test('sin nombre no se crea nada', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.crear(''), /Falta el nombre/);
  });

  test('si ya existe en Alegra (sin importar mayúsculas), rechaza sin crear', async () => {
    const { servicio, creadas } = montar();
    await assert.rejects(servicio.crear('línea eléctrica'), /ya existe en Alegra/);
    assert.equal(creadas.length, 0);
  });

  test('crea la categoría en Alegra y devuelve su id', async () => {
    const { servicio, creadas } = montar();
    const r = await servicio.crear('Línea de Moto');
    assert.equal(r.name, 'Línea de Moto');
    assert.equal(creadas.length, 1);
    assert.equal(creadas[0].name, 'Línea de Moto');
  });
});
