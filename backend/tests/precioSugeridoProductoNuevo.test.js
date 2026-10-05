/**
 * Qué costo y qué precio se le proponen a quien crea un producto nuevo.
 *
 * EL BUG QUE MOTIVÓ ESTE ARCHIVO
 * El formulario de crear producto prellenaba los DOS campos —precio de venta
 * y costo unitario— con el mismo número: el `precioUnitario` de la factura
 * del proveedor. Quien aceptaba el prellenado creaba un producto que se vende
 * al costo. 21 productos del catálogo quedaron así, varios con el precio
 * exactamente igual al costo (CODO SANITARIO ₡792,04 contra ₡792,04; BATERÍA
 * MAXELL CR2025 ₡703,54 contra ₡703,54).
 *
 * Y ese número tampoco era el costo. `precioUnitario` viene SIN IVA, SIN el
 * descuento de la línea y SIN el factor de conversión. Caso real, BOTA
 * BELLOTA PVC 27 ( 42 ): el formulario proponía ₡4.685 cuando el costo real
 * por unidad propia es ₡4.764,65 — aceptarlo creaba un producto que se vende
 * POR DEBAJO del costo.
 *
 * Los números de las pruebas salen de esa línea real: 2 unidades a ₡4.685,
 * ₡937 de descuento (10%), ₡1.096,29 de impuesto, ₡9.529,29 de total.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const rutaPrisma = require.resolve('../lib/prisma');
const rutaDb = require.resolve('../config/database');
const rutaServicio = require.resolve('../src/modules/productos-revision/productos-revision.service');

/** La línea de la BOTA BELLOTA, tal como está en la base. */
const LINEA_BELLOTA = {
  id: 'linea-1',
  descripcion: 'BOTA BELLOTA PVC  27  ( 42 ) 72227',
  cantidad: 2,
  precioUnitario: 4685,
  descuento: 937,
  impuesto: 1096.29,
  totalLinea: 9529.29,
  mapeo: null
};

const CONFIG_PRECIOS = [
  { categoria: 'Ferretería', margen_meta: 25, margen_minimo: 15 },
  { categoria: '__default__', margen_meta: 25, margen_minimo: 12 }
];

function montar(linea = LINEA_BELLOTA, configPrecios = CONFIG_PRECIOS) {
  require.cache[rutaPrisma] = {
    id: rutaPrisma, filename: rutaPrisma, loaded: true,
    exports: {
      productoFactura: { findUnique: async () => linea },
      $disconnect: async () => {}
    }
  };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { query: async () => ({ rows: configPrecios }) }
  };
  delete require.cache[rutaServicio];
  delete require.cache[require.resolve('../src/modules/precios/config')];
  return require(rutaServicio);
}

beforeEach(() => {
  for (const r of [rutaPrisma, rutaDb, rutaServicio]) delete require.cache[r];
});

describe('el costo que se propone es el costo de verdad', () => {
  test('lleva IVA, descuento y factor — no es el precioUnitario del proveedor', async () => {
    const servicio = montar();
    const r = await servicio.precioSugerido('linea-1', 'Ferretería');

    // (4685 × 2 − 937) / 2 = 4216,50 sin IVA;  × 1,13 = 4764,645
    assert.equal(r.costoSinIva, 4216.5);
    assert.equal(r.costoUnitario, 4764.64);
    assert.notEqual(r.costoUnitario, 4685, 'ese era el número que proponía el formulario viejo');
  });

  test('dice de dónde sale: el IVA real de la línea y el descuento', async () => {
    // El IVA no se asume 13%: se deriva de impuesto/totalLinea, porque Costa
    // Rica tiene tarifas 0/1/2/4/8/13%.
    const servicio = montar();
    const r = await servicio.precioSugerido('linea-1', 'Ferretería');
    assert.equal(r.porcentajeIva, 13);
    assert.equal(r.descuentoPorcentaje, 10);
  });

  test('el factor de conversión divide el costo', async () => {
    // El proveedor factura la caja de 4; se vende por unidad suelta.
    const servicio = montar({ ...LINEA_BELLOTA, mapeo: { factorConversion: 4 } });
    const r = await servicio.precioSugerido('linea-1', 'Ferretería');
    assert.equal(r.factor, 4);
    assert.equal(r.costoUnitario, 1191.16);   // 4764,645 / 4
  });
});

describe('el precio que se propone deja margen', () => {
  test('nunca es el costo', async () => {
    // La regla de una línea que resume todo este archivo.
    const servicio = montar();
    const r = await servicio.precioSugerido('linea-1', 'Ferretería');
    assert.ok(r.precioSugerido > r.costoSinIva,
      `sugirió ₡${r.precioSugerido} con un costo de ₡${r.costoSinIva}`);
  });

  test('da el margen meta de la categoría', async () => {
    // Es el mismo ₡5.625 que Revisión de Precios recomienda para este
    // producto, y el que hubo que poner a mano cuando el bug lo dejó en 4.685.
    const servicio = montar();
    const r = await servicio.precioSugerido('linea-1', 'Ferretería');
    assert.equal(r.precioSugerido, 5625);
    assert.equal(r.margenObjetivo, 25);
    assert.equal(r.margenResultante, 25);
  });

  test('el margen sale del NOMBRE de la categoría: con su id cae al de por defecto', async () => {
    // El formulario mandaba el id del desplegable ("9") y no el nombre. La
    // configuración está llaveada por nombre, así que nunca calzaba y TODA
    // sugerencia salía al 25 % por defecto. La prueba de arriba no lo veía
    // porque Ferretería también es 25 %: hace falta una categoría distinta.
    const config = [
      { categoria: 'Librería', margen_meta: 29.2, margen_minimo: 17 },
      { categoria: 'Productos para perro', margen_meta: 20, margen_minimo: 12 },
      { categoria: '__default__', margen_meta: 25, margen_minimo: 12 }
    ];
    const servicio = montar(LINEA_BELLOTA, config);

    const libreria = await servicio.precioSugerido('linea-1', 'Librería');
    const perro = await servicio.precioSugerido('linea-1', 'Productos para perro');
    const porId = await servicio.precioSugerido('linea-1', '9');

    assert.deepEqual([libreria.margenObjetivo, perro.margenObjetivo, porId.margenObjetivo], [29.2, 20, 25]);
    assert.ok(libreria.precioSugerido > porId.precioSugerido && porId.precioSugerido > perro.precioSugerido,
      'el precio sugerido tiene que seguir al margen de la categoría');
  });

  test('el formulario le manda al motor el nombre de la categoría elegida, no su id', () => {
    const fs = require('fs');
    const path = require('path');
    const modal = fs.readFileSync(path.join(
      __dirname, '..', '..', 'frontend', 'src', 'components', 'relacionar-productos', 'ModalCrearProducto.jsx'), 'utf8');
    assert.match(modal, /params: \{ categoria: nombreDeCategoria \}/);
    // En esta rama las categorías son las propias y traen `nombre` (en `main`, las de Alegra traen `name`).
    assert.match(modal, /const nombreDeCategoria = categorias\.find\(c => String\(c\.id\) === String\(categoriaSeleccionada\)\)\?\.nombre \|\| ''/);
    // Y se recalcula cuando cambia ese nombre.
    assert.match(modal, /\}, \[productoSeleccionado\.id, nombreDeCategoria\]\)/);
  });

  test('una categoría sin config usa el margen por defecto, no falla', async () => {
    const servicio = montar();
    const r = await servicio.precioSugerido('linea-1', 'Categoría Que No Existe');
    assert.equal(r.margenObjetivo, 25);
    assert.ok(r.precioSugerido > r.costoSinIva);
  });

  test('sin costo calculable no se inventa un precio', async () => {
    // Devolver algo acá sería peor que no devolver nada: el formulario lo
    // pondría en el campo y alguien lo aceptaría.
    const servicio = montar({ ...LINEA_BELLOTA, precioUnitario: 0, descuento: 0, totalLinea: 0, impuesto: 0 });
    const r = await servicio.precioSugerido('linea-1', 'Ferretería');
    assert.equal(r.precioSugerido, null);
    assert.equal(r.costoUnitario, 0);
  });

  test('un producto que no existe da 404, no un precio en blanco', async () => {
    const servicio = montar(null);
    await assert.rejects(() => servicio.precioSugerido('no-existe', 'Ferretería'),
      (e) => e.status === 404);
  });
});
