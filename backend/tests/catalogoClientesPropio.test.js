const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * El catálogo que ve el cliente, leyendo del maestro propio.
 *
 * POR QUÉ IMPORTA
 * Antes salía de `alegra_products_cache`, que refrescaba una sincronización
 * cada 6 horas: un precio corregido en Gestión de Catálogo podía tardar horas
 * en verse. Ahora sale de `producto`.
 *
 * Lo que esta prueba cuida es que ese cambio no rompa tres cosas que no se ven
 * mirando la pantalla: que el costo NUNCA se publique, que la identidad sea
 * producto.id (aunque su correspondencia histórica sea distinta) y que un
 * producto sin impuesto no desaparezca del catálogo.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'catalogo-clientes', 'catalogo-clientes.service.js');
const rutaDescuentos = path.join(__dirname, '..', 'src', 'utils', 'descuentosExceso.js');

function montar({ filas = [], total = 0, descuentos = new Map() } = {}) {
  const consultas = [];
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        const texto = String(sql).replace(/\s+/g, ' ').trim();
        consultas.push({ sql: texto, params });
        if (/COUNT\(\*\)::int/.test(texto)) return { rows: [{ n: total }] };
        return { rows: filas.map(f => ({ ...f })) };
      }
    }
  };
  require.cache[rutaDescuentos] = {
    id: rutaDescuentos, filename: rutaDescuentos, loaded: true,
    exports: {
      mapaVigentesPropios: async () => descuentos,
      aplicarDescuento: (precio, p) => (p > 0 ? Math.round(precio * (1 - p / 100) * 100) / 100 : precio)
    }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), consultas };
}

beforeEach(() => {
  for (const r of [rutaDb, rutaServicio, rutaDescuentos]) delete require.cache[r];
});

// Una fila como la devuelve la consulta nueva.
const ABANICO = {
  alegra_id: '1183', producto_id: 12, nombre: 'ABANICO DE TECHO', referencia: 'ABTECHO',
  categoria: 'Línea eléctrica', precio_sin_iva: '33451.32743', tarifa: '13.00',
  imagen_url: '/archivos/productos/12-abc.jpg'
};

describe('de dónde salen los productos', () => {
  test('lee el maestro propio y nunca la caché de Alegra', async () => {
    const { servicio, consultas } = montar({ filas: [ABANICO], total: 1 });
    await servicio.listarProductos({});
    for (const c of consultas) {
      assert.equal(/alegra_products_cache/.test(c.sql), false, c.sql);
      assert.match(c.sql, /FROM producto p/);
    }
  });

  test('el costo NO se publica, en ninguna de las consultas', async () => {
    // Es el dato que no puede salir de este módulo bajo ninguna circunstancia.
    const { servicio, consultas } = montar({ filas: [ABANICO], total: 1, descuentos: new Map([['12', 25]]) });
    await servicio.listarProductos({});
    await servicio.listarOfertas();
    await servicio.listarCategorias();
    assert.ok(consultas.length >= 3);
    for (const c of consultas) {
      assert.equal(/costo/.test(c.sql), false, `esta consulta menciona el costo: ${c.sql}`);
      assert.equal(/SELECT \*/.test(c.sql), false, 'nada de SELECT *: una columna nueva no puede publicarse sola');
    }
  });

  test('el impuesto va con LEFT JOIN: un producto sin impuesto no desaparece', async () => {
    // Hay uno así entre los 2.012 visibles. Con un JOIN estricto se caía del
    // catálogo sin que nadie se diera cuenta.
    const { servicio, consultas } = montar({ filas: [], total: 0 });
    await servicio.listarProductos({});
    assert.match(consultas[0].sql, /LEFT JOIN impuesto imp/);
  });

  test('solo lo activo, visible y con precio', async () => {
    const { servicio, consultas } = montar({ filas: [], total: 0 });
    await servicio.listarProductos({});
    assert.match(consultas[0].sql, /p\.activo = TRUE AND p\.oculto = FALSE AND p\.precio_sin_iva > 0/);
  });
});

describe('lo que se le entrega al cliente', () => {
  test('el id es propio, incluso con una correspondencia histórica distinta', async () => {
    // Los dos ids pueden ser números iguales que apuntan a otro producto.
    const { servicio } = montar({ filas: [ABANICO], total: 1 });
    const { productos } = await servicio.listarProductos({});
    assert.equal(productos[0].id, 12);
    assert.equal(productos[0].productoId, 12);
  });

  test('el precio llega con impuesto y redondeado a dos decimales', async () => {
    const { servicio } = montar({ filas: [ABANICO], total: 1 });
    const { productos } = await servicio.listarProductos({});
    assert.equal(productos[0].precio, 37800);
    assert.equal(productos[0].precioLista, null, 'sin descuento no se manda precio tachado');
  });

  test('con descuento vigente se mandan los dos precios', async () => {
    const { servicio } = montar({ filas: [ABANICO], total: 1, descuentos: new Map([['12', 25]]) });
    const { productos } = await servicio.listarProductos({});
    assert.equal(productos[0].precioLista, 37800);
    assert.equal(productos[0].precio, 28350);
    assert.equal(productos[0].descuento, 25);
  });

  test('un producto sin tarifa no inventa impuesto', async () => {
    const { servicio } = montar({ filas: [{ ...ABANICO, tarifa: null, precio_sin_iva: '1000' }], total: 1 });
    const { productos } = await servicio.listarProductos({});
    assert.equal(productos[0].precio, 1000);
  });

  test('sin categoría se dice "Sin categoría", no se deja vacío', async () => {
    const { servicio } = montar({ filas: [{ ...ABANICO, categoria: null }], total: 1 });
    const { productos } = await servicio.listarProductos({});
    assert.equal(productos[0].categoria, 'Sin categoría');
  });
});

describe('la búsqueda', () => {
  test('busca sin acentos en nombre y referencia, ya no en una columna que alguien tenía que refrescar', async () => {
    const { servicio, consultas } = montar({ filas: [], total: 0 });
    await servicio.listarProductos({ busqueda: 'Línea Eléctrica' });
    assert.equal(/search_text/.test(consultas[0].sql), false);
    assert.match(consultas[0].sql, /translate\(lower\(p\.nombre/);
    assert.equal(consultas[0].params[0], '%linea electrica%');
  });

  test('nadie puede pedir más de 120 productos de un golpe', async () => {
    const { servicio, consultas } = montar({ filas: [], total: 0 });
    await servicio.listarProductos({ porPagina: 5000 });
    const consulta = consultas.find(c => /LIMIT/.test(c.sql));
    assert.ok(consulta.params.includes(120));
  });
});
