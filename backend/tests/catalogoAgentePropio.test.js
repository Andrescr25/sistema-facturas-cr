const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * El catálogo del agente sale del maestro propio.
 *
 * Era un proxy a Alegra: la tablet paginaba de a 30 CONTRA ALEGRA, así que
 * sincronizar el catálogo en el campo dependía de que Alegra contestara. Era la
 * última pantalla que lo hacía.
 *
 * SE CONSERVAN LOS NOMBRES DE ALEGRA en la respuesta (`name`, `price`, `tax`,
 * `images`) porque la tablet los lee así y guarda el catálogo sin conexión.
 * Cambiarlos obligaría a resincronizar todas las tablets el mismo día.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaAlegra = path.join(__dirname, '..', 'src', 'integrations', 'alegra', 'index.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'catalogo-agente', 'catalogo-agente.service.js');

const FILA = {
  alegra_id: '1031', producto_id: 77, nombre: 'EXTENSION CTE BLANCA 3 MTS VOLTECK',
  referencia: '111', categoria: 'Ferretería', precio_sin_iva: '5465', tarifa: '13',
  imagen_url: '/archivos/productos/3-abc.jpg'
};

function montar(filas = [FILA]) {
  for (const r of [rutaDb, rutaAlegra, rutaServicio]) delete require.cache[r];

  const visto = { sql: null, params: null, alegraLlamado: false };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        // La subcategoría de cada producto se pega aparte (conSubcategoria,
        // que vino de developer). No es "la" consulta del catálogo.
        if (/FROM alegra_products_cache c/.test(sql)) {
          visto.subcategorias = params;
          return { rows: [{ alegra_id: '1031', sub_id: 5, sub_nombre: 'Extensiones' }] };
        }
        visto.sql = sql; visto.params = params;
        if (/FROM categoria_producto/.test(sql)) return { rows: [{ id: 3, nombre: 'Ferretería' }] };
        return { rows: filas };
      }
    }
  };
  // Si el catálogo vuelve a llamar a Alegra, la prueba lo grita.
  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: {
      getClient: () => {
        visto.alegraLlamado = true;
        throw new Error('el catálogo del agente NO puede depender de Alegra');
      }
    }
  };
  return { servicio: require(rutaServicio), visto };
}

describe('de dónde salen los productos', () => {
  test('de `producto`, sin tocar Alegra', async () => {
    const { servicio, visto } = montar();
    const r = await servicio.listarProductos({ start: 0, limit: 30 });

    assert.equal(visto.alegraLlamado, false);
    assert.match(visto.sql, /FROM producto p/);
    assert.equal(r.products.length, 1);
  });

  test('solo los visibles, con la misma regla que el resto del sistema', async () => {
    // Si cada pantalla decidiera qué mostrar por su lado, el agente podría
    // ofrecer algo que el cliente no ve.
    const { servicio, visto } = montar();
    await servicio.listarProductos({});

    assert.match(visto.sql, /p\.activo = TRUE/);
    assert.match(visto.sql, /p\.oculto = FALSE/);
    assert.match(visto.sql, /p\.precio_sin_iva > 0/);
  });

  test('las categorías también salen de la base propia', async () => {
    const { servicio, visto } = montar();
    const cats = await servicio.listarCategorias();

    assert.equal(visto.alegraLlamado, false);
    assert.deepEqual(cats, [{ id: '3', name: 'Ferretería' }]);
  });
});

describe('la forma que espera la tablet', () => {
  test('mantiene los nombres de Alegra', async () => {
    const { servicio } = montar();
    const [p] = (await servicio.listarProductos({})).products;

    assert.equal(p.id, '1031');
    assert.equal(p.name, 'EXTENSION CTE BLANCA 3 MTS VOLTECK');
    assert.equal(p.reference, '111');
    assert.equal(p.price[0].price, 5465);
    assert.equal(p.tax[0].percentage, 13);
    assert.equal(p.images[0].url, '/archivos/productos/3-abc.jpg');
  });

  test('cada producto lleva su subcategoría, para partir la categoría en familias', async () => {
    // Viaja con el catálogo que la tablet guarda sin conexión: pedirla aparte
    // obligaría a una segunda descarga en el campo.
    const { servicio, visto } = montar();
    const [p] = (await servicio.listarProductos({})).products;

    assert.deepEqual(p.subcategoria, { id: 5, nombre: 'Extensiones' });
    assert.deepEqual(visto.subcategorias, [['1031']]);
  });

  test('NO se manda inventario, y eso es a propósito', async () => {
    // El maestro propio todavía no lleva existencias. Mandar un inventario
    // vacío haría que la tarjeta contara cero disponibles y marcara TODO el
    // catálogo como "Agotado", que es peor que no decir nada.
    const { servicio } = montar();
    const [p] = (await servicio.listarProductos({})).products;

    assert.equal('inventory' in p, false);
  });

  test('un producto sin impuesto no inventa una tarifa', async () => {
    const { servicio } = montar([{ ...FILA, tarifa: null }]);
    const [p] = (await servicio.listarProductos({})).products;

    assert.deepEqual(p.tax, []);
  });

  test('un producto sin foto manda la lista vacía, no una rota', async () => {
    const { servicio } = montar([{ ...FILA, imagen_url: null }]);
    const [p] = (await servicio.listarProductos({})).products;

    assert.deepEqual(p.images, []);
  });
});

describe('la paginación que usa la tablet', () => {
  test('respeta el tamaño de página y el arranque', async () => {
    const { servicio, visto } = montar();
    await servicio.listarProductos({ start: 60, limit: 30 });

    assert.deepEqual(visto.params, [30, 60]);
  });

  test('un límite disparatado se acota', async () => {
    const { servicio, visto } = montar();
    await servicio.listarProductos({ start: 0, limit: 5000 });

    assert.equal(visto.params[0], 30);
  });

  test('avisa si hay más páginas', async () => {
    const treinta = Array.from({ length: 30 }, () => FILA);
    const { servicio } = montar(treinta);
    const r = await servicio.listarProductos({ start: 0, limit: 30 });

    assert.equal(r.debug.has_more, true);
  });

  test('la última página dice que no hay más', async () => {
    const { servicio } = montar([FILA]);
    const r = await servicio.listarProductos({ start: 0, limit: 30 });

    assert.equal(r.debug.has_more, false);
  });
});
