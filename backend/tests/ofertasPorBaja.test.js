/**
 * Qué producto entra en "Bajamos el precio".
 *
 * LA REGLA NO ES "EL PRECIO BAJÓ"
 * Cuenta el precio que bajó **resignando margen**: un producto que tenía 40%
 * y quedó en 20% es una decisión de promoverlo, y eso es lo que hay que
 * mostrarle al cliente. Si el precio bajó porque bajó el costo y el margen se
 * mantuvo, no hay nada que anunciar — se gana lo mismo de siempre y ponerlo
 * como oferta sería vender humo.
 *
 * Por eso se exigen las dos cosas: precio más bajo Y margen más bajo.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const rutaDb = require.resolve('../config/database');
const rutaServicio = require.resolve('../src/modules/precios/ofertasPorBaja');

/** Carga el módulo con una base falsa que devuelve las filas indicadas. */
function montar(filas) {
  const registro = { consultas: [] };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        registro.consultas.push({ sql: String(sql), params });
        return { rows: filas };
      }
    }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), registro };
}

/** Una fila como la devuelve la consulta. */
const fila = (o = {}) => ({
  alegraItemId: '621',
  nombre: 'LLAVE DE PASO CTE PLASTICA',
  referencia: '216',
  categoria: 'Productos de PVC',
  imagen: null,
  taxPercentage: 13,
  precioAntes: 370,
  precioAhora: 270,
  margenAntes: 46.5,
  margenAhora: 26.67,
  cuando: new Date('2026-09-03'),
  ...o
});

beforeEach(() => {
  for (const r of [rutaDb, rutaServicio]) delete require.cache[r];
});

describe('la consulta que define la oferta', () => {
  test('exige que el precio haya bajado Y que el margen haya bajado', async () => {
    // Las dos condiciones juntas son el corazón de la regla; si alguien quita
    // una, este test lo dice.
    const { servicio, registro } = montar([]);
    await servicio.ofertasPorBajaDePrecio();
    const sql = registro.consultas[0].sql;

    assert.match(sql, /precio_nuevo\s*<\s*c\.precio_antes/,
      'falta exigir que el precio haya bajado');
    assert.match(sql, /margen_resultante\)\s*>=\s*\$2/,
      'falta exigir que el margen haya bajado los puntos pedidos');
  });

  test('solo mira el cambio MÁS RECIENTE de cada producto', async () => {
    // Si un producto bajó y después volvió a subir, no es oferta.
    const { servicio, registro } = montar([]);
    await servicio.ofertasPorBajaDePrecio();
    assert.match(registro.consultas[0].sql, /c\.reciente = 1/);
  });

  test('no muestra productos inactivos ni escondidos del catálogo', async () => {
    const { servicio, registro } = montar([]);
    await servicio.ofertasPorBajaDePrecio();
    const sql = registro.consultas[0].sql;
    assert.match(sql, /p\.activo = TRUE/);
    assert.match(sql, /p\.oculto = FALSE/);
  });

  test('la ficha sale del maestro propio, no de la caché de Alegra', async () => {
    // El catálogo dejó de depender de que la sincronización de cada 6 horas
    // haya corrido: lo que se edita en Gestión de Catálogo se ve de una.
    const { servicio, registro } = montar([]);
    await servicio.ofertasPorBajaDePrecio();
    const sql = registro.consultas[0].sql;
    assert.match(sql, /JOIN producto p ON p\.id = c\.producto_id/);
    assert.equal(/alegra_products_cache/.test(sql), false);
  });

  test('los umbrales se pueden ajustar sin tocar la consulta', async () => {
    const { servicio, registro } = montar([]);
    await servicio.ofertasPorBajaDePrecio({ puntos: 12, dias: 7, limite: 3 });
    assert.deepEqual(registro.consultas[0].params, ['7', 12, 3]);
  });

  test('el límite tiene tope: nadie pide 10.000 ofertas', async () => {
    const { servicio, registro } = montar([]);
    await servicio.ofertasPorBajaDePrecio({ limite: 10000 });
    assert.equal(registro.consultas[0].params[2], 100);
  });
});

describe('lo que se le entrega a los catálogos', () => {
  test('los dos precios llevan impuesto, para que sean comparables', async () => {
    // El catálogo muestra precios con IVA; la bitácora los guarda sin él. Si
    // se convirtiera solo uno, el "antes" y el "ahora" no serían del mismo
    // tipo y el descuento se vería mal.
    const { servicio } = montar([fila()]);
    const [o] = await servicio.ofertasPorBajaDePrecio();

    assert.equal(o.precioAntes, 418.1);   // 370 × 1,13
    assert.equal(o.precioAhora, 305.1);   // 270 × 1,13
  });

  test('el descuento se calcula sobre el precio, que es lo que ve el cliente', async () => {
    // Al cliente no le importan los puntos de margen: le importa cuánto menos
    // paga. 370 -> 270 es un 27%.
    const { servicio } = montar([fila()]);
    const [o] = await servicio.ofertasPorBajaDePrecio();
    assert.equal(o.descuentoPorcentaje, 27);
    assert.equal(Math.round(o.ahorro), 113);
  });

  test('un producto exento no se rompe ni inventa impuesto', async () => {
    const { servicio } = montar([fila({ taxPercentage: 0, precioAntes: 100, precioAhora: 80 })]);
    const [o] = await servicio.ofertasPorBajaDePrecio();
    assert.equal(o.precioAntes, 100);
    assert.equal(o.precioAhora, 80);
    assert.equal(o.descuentoPorcentaje, 20);
  });

  test('los márgenes NO se entregan: las dos rutas que lo llaman son públicas', async () => {
    // Estuvieron saliendo hasta el 2026-10-03. Con el margen y el precio al
    // lado se saca el costo, y `/catalogo-clientes/ofertas-baja` y
    // `/catalogo-agente/ofertas-baja` se abren sin sesión. Aunque la fila los
    // traiga, no pasan.
    const { servicio, registro } = montar([fila()]);
    const [o] = await servicio.ofertasPorBajaDePrecio();

    const prohibidas = Object.keys(o).filter(k => /margen|costo|cost|utilidad/i.test(k));
    assert.deepEqual(prohibidas, [], `salen campos internos: ${prohibidas.join(', ')}`);

    // Y la consulta tampoco los pide como columna de salida: el margen queda
    // solo en la condición que decide qué es una oferta.
    const columnas = registro.consultas[0].sql.match(/AS\s+"?\w+"?/gi) || [];
    const internas = columnas.filter(c => /margen|costo/i.test(c));
    assert.deepEqual(internas, []);
  });

  test('las dos rutas públicas entregan exactamente lo que hace falta para pintar la oferta', async () => {
    const { servicio } = montar([fila()]);
    const [o] = await servicio.ofertasPorBajaDePrecio();
    // En esta rama va además `productoId`, el id del maestro propio: es con el
    // que el catálogo pide el producto, y no dice nada del negocio.
    assert.deepEqual(Object.keys(o).sort(), [
      'ahorro', 'alegraItemId', 'categoria', 'descuentoPorcentaje', 'desde',
      'imagen', 'nombre', 'precioAhora', 'precioAntes', 'productoId', 'referencia'
    ]);
  });

  test('sin cambios que califiquen, la lista viene vacía y no falla', async () => {
    const { servicio } = montar([]);
    assert.deepEqual(await servicio.ofertasPorBajaDePrecio(), []);
  });
});
