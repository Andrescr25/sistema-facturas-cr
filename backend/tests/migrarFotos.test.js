const { test, describe } = require('node:test');
const assert = require('node:assert');

/**
 * Pasar las fotos de Alegra a almacenamiento propio: sin perder fotos, sin
 * dejar archivos huérfanos, sin pisar lo que ya es nuestro y sin que una foto
 * que falla detenga las otras dos mil.
 */

const { migrarFotos, migrarFotoDeProducto, esFotoPropia, enParalelo } = require('../src/modules/productos/migrarFotos');

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
const ALEGRA = 'https://cdn3.alegra.com/foto.jpg?Expires=1';

/** Dobles que registran lo que se les pidió. */
function montar({ descargas = {}, guardaFalla = null, filasCambiadas = 1, item = null } = {}) {
  const pedidas = [];
  const guardados = [];
  const borrados = [];
  const actualizaciones = [];
  const alegraLlamadas = [];
  return {
    pedidas, guardados, borrados, actualizaciones, alegraLlamadas,
    deps: {
      descargar: async (url) => {
        pedidas.push(url);
        if (descargas[url]) return descargas[url];
        throw new Error(`El sitio de la imagen no la entregó (respondió 403).`);
      },
      guardarImagen: async ({ carpeta, prefijo, buffer }) => {
        if (guardaFalla) throw new Error(guardaFalla);
        guardados.push({ carpeta, prefijo, bytes: buffer.length });
        return { ruta: `/archivos/${carpeta}/${prefijo}-nueva.jpg`, bytes: buffer.length };
      },
      borrar: async (ruta) => { borrados.push(ruta); return true; },
      actualizar: async (id, ruta, anterior) => {
        actualizaciones.push({ id, ruta, anterior });
        return filasCambiadas;
      },
      alegra: {
        get: async (ruta) => {
          alegraLlamadas.push(ruta);
          return item ? { success: true, data: item } : { success: false, status: 404 };
        }
      }
    }
  };
}

describe('una foto a la vez', () => {
  test('reconoce cuál foto ya es nuestra', () => {
    assert.equal(esFotoPropia('/archivos/productos/7-abc.jpg'), true);
    assert.equal(esFotoPropia(ALEGRA), false);
    assert.equal(esFotoPropia(null), false);
  });

  test('la que ya es nuestra no se vuelve a bajar', async () => {
    const m = montar();
    const r = await migrarFotoDeProducto({ id: 7, imagen_url: '/archivos/productos/7-abc.jpg' }, m.deps);
    assert.equal(r.estado, 'ya_propia');
    assert.deepEqual(m.pedidas, []);
    assert.deepEqual(m.actualizaciones, []);
  });

  test('el producto sin foto no inventa ninguna', async () => {
    const m = montar();
    assert.equal((await migrarFotoDeProducto({ id: 7, imagen_url: null }, m.deps)).estado, 'sin_foto');
    assert.deepEqual(m.pedidas, []);
  });

  test('baja, guarda y deja el producto apuntando a lo nuestro', async () => {
    const m = montar({ descargas: { [ALEGRA]: { buffer: JPG } } });
    const r = await migrarFotoDeProducto({ id: 7, alegra_id: '99', imagen_url: ALEGRA }, m.deps);
    assert.equal(r.estado, 'migrada');
    assert.equal(r.ruta, '/archivos/productos/7-nueva.jpg');
    assert.deepEqual(m.guardados, [{ carpeta: 'productos', prefijo: '7', bytes: JPG.length }]);
    // La actualización exige que la foto siga siendo la que se bajó.
    assert.deepEqual(m.actualizaciones, [{ id: 7, ruta: '/archivos/productos/7-nueva.jpg', anterior: ALEGRA }]);
    assert.deepEqual(m.borrados, []);
    assert.deepEqual(m.alegraLlamadas, [], 'no hacía falta molestar a Alegra');
  });

  test('si la firma venció, le pide a Alegra una dirección nueva y reintenta', async () => {
    const FRESCA = 'https://cdn3.alegra.com/foto.jpg?Expires=2';
    const m = montar({
      descargas: { [FRESCA]: { buffer: JPG } },
      item: { images: [{ url: 'https://cdn3.alegra.com/otra.jpg', favorite: false }, { url: FRESCA, favorite: true }] }
    });
    const r = await migrarFotoDeProducto({ id: 7, alegra_id: '99', imagen_url: ALEGRA }, m.deps);
    assert.equal(r.estado, 'migrada');
    assert.deepEqual(m.pedidas, [ALEGRA, FRESCA]);
    assert.deepEqual(m.alegraLlamadas, ['/items/99'], 'solo una lectura, por el producto que falló');
  });

  test('si Alegra tampoco la entrega, queda anotada y el producto no se toca', async () => {
    const m = montar();
    const r = await migrarFotoDeProducto({ id: 7, alegra_id: '99', imagen_url: ALEGRA }, m.deps);
    assert.equal(r.estado, 'fallo');
    assert.match(r.motivo, /403/);
    assert.deepEqual(m.actualizaciones, []);
    assert.deepEqual(m.guardados, []);
  });

  test('un producto sin alegra_id no reintenta contra Alegra', async () => {
    const m = montar();
    const r = await migrarFotoDeProducto({ id: 7, alegra_id: null, imagen_url: ALEGRA }, m.deps);
    assert.equal(r.estado, 'fallo');
    assert.deepEqual(m.alegraLlamadas, []);
  });

  test('lo que no es una imagen no llega a la base', async () => {
    const m = montar({ descargas: { [ALEGRA]: { buffer: Buffer.from('<html>') } }, guardaFalla: 'El archivo no es una imagen JPG, PNG, WEBP ni GIF.' });
    const r = await migrarFotoDeProducto({ id: 7, alegra_id: '99', imagen_url: ALEGRA }, m.deps);
    assert.equal(r.estado, 'fallo');
    assert.deepEqual(m.actualizaciones, []);
  });

  test('si alguien cambió la foto mientras se bajaba, se borra el archivo nuevo', async () => {
    const m = montar({ descargas: { [ALEGRA]: { buffer: JPG } }, filasCambiadas: 0 });
    const r = await migrarFotoDeProducto({ id: 7, alegra_id: '99', imagen_url: ALEGRA }, m.deps);
    assert.equal(r.estado, 'cambio_mientras_tanto');
    assert.deepEqual(m.borrados, ['/archivos/productos/7-nueva.jpg'], 'no puede quedar un archivo huérfano');
  });

  test('si la base falla al actualizar, tampoco queda el archivo', async () => {
    const m = montar({ descargas: { [ALEGRA]: { buffer: JPG } } });
    m.deps.actualizar = async () => { throw new Error('la base se cayó'); };
    const r = await migrarFotoDeProducto({ id: 7, alegra_id: '99', imagen_url: ALEGRA }, m.deps);
    assert.equal(r.estado, 'fallo');
    assert.deepEqual(m.borrados, ['/archivos/productos/7-nueva.jpg']);
  });
});

describe('todas las fotos', () => {
  test('las descargas en paralelo no pierden ni repiten ninguna', async () => {
    const entradas = Array.from({ length: 23 }, (_, i) => i);
    const vistas = [];
    const r = await enParalelo(entradas, 5, async (n) => { vistas.push(n); return n * 2; });
    assert.deepEqual(r, entradas.map(n => n * 2), 'los resultados quedan en su lugar');
    assert.deepEqual(vistas.slice().sort((a, b) => a - b), entradas);
  });

  test('una foto que falla no detiene las demás, y el conteo cuadra', async () => {
    const filas = [
      { id: 1, alegra_id: '1', imagen_url: 'https://cdn3.alegra.com/1.jpg' },
      { id: 2, alegra_id: '2', imagen_url: 'https://cdn3.alegra.com/rota.jpg' },
      { id: 3, alegra_id: '3', imagen_url: 'https://cdn3.alegra.com/3.jpg' }
    ];
    const consultas = [];
    const pool = {
      query: async (sql, params) => {
        consultas.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
        return { rows: filas.map(f => ({ ...f })), rowCount: 1 };
      }
    };
    const m = montar({
      descargas: { 'https://cdn3.alegra.com/1.jpg': { buffer: JPG }, 'https://cdn3.alegra.com/3.jpg': { buffer: JPG } }
    });
    const r = await migrarFotos({ pool, alegra: m.deps.alegra, concurrencia: 3 }, {
      descargar: m.deps.descargar,
      almacenamiento: { guardarImagen: m.deps.guardarImagen, borrar: m.deps.borrar },
      actualizar: m.deps.actualizar
    });

    assert.equal(r.total, 3);
    assert.equal(r.migrada, 2);
    assert.equal(r.fallo, 1);
    assert.deepEqual(r.fallos.map(f => f.id), [2]);
    assert.equal(r.bytes, JPG.length * 2);
  });

  test('solo busca las que todavía no son nuestras', async () => {
    const consultas = [];
    const pool = { query: async (sql) => { consultas.push(String(sql).replace(/\s+/g, ' ').trim()); return { rows: [] }; } };
    await migrarFotos({ pool, alegra: null }, { descargar: async () => ({ buffer: JPG }), almacenamiento: {}, actualizar: async () => 1 });
    assert.match(consultas[0], /NOT LIKE '\/archivos\/%'/);
  });
});
