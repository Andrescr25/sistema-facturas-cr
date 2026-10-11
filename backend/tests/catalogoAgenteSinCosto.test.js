const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * El catálogo del agente NO entrega el costo.
 *
 * `/catalogo-agente/productos` es una ruta PÚBLICA: está abierta sin sesión
 * para que el agente pueda trabajar en zonas sin señal. En `main`, hasta el
 * 2026-10-03, devolvía el producto de Alegra entero —con `inventory.unitCost`,
 * el costo de compra—: cualquiera con la dirección podía bajarse la lista de
 * costos del negocio.
 *
 * EN ESTA RAMA el catálogo sale del maestro propio y esa fuga nunca existió:
 * `aFormaDeTablet` arma cada producto con los campos que la tablet lee, uno
 * por uno. Esta prueba vino de `main` con el arreglo y se reescribió para lo
 * que hay acá, porque lo que cuida vale igual: se prueba como LISTA DE LO QUE
 * SÍ SALE, no de lo que se quita. Si mañana alguien agrega el costo a la
 * consulta compartida de los catálogos, no sale solo.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'catalogo-agente', 'catalogo-agente.service.js');

/** Una fila de `producto` como si la consulta trajera TODO, también lo que no debe salir. */
const FILA = {
  producto_id: 621,
  nombre: 'LLAVE DE PASO CTE PLASTICA',
  referencia: '216',
  categoria: 'Productos de PVC',
  precio_sin_iva: '270.00000',
  tarifa: '13.00',
  imagen_url: '/archivos/productos/621-a.jpg',
  // Lo interno: nada de esto es para quien tenga el enlace.
  costo_con_iva: '197.99000',
  descripcion: 'texto interno',
  alegra_id: '621',
  cabys: '3162100000000',
  impuesto_id: 1,
  categoria_id: 5,
  inventariable: true
};

function montar(filas) {
  for (const r of [rutaDb, rutaServicio]) delete require.cache[r];
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql) => (/JOIN subcategoria/.test(sql)
        ? { rows: [{ producto_id: 621, sub_id: 9, sub_nombre: 'PVC 1/2' }] }
        : { rows: filas })
    }
  };
  return require(rutaServicio);
}

/** Todos los nombres de campo de un objeto, a cualquier profundidad. */
function campos(valor, fuera = new Set()) {
  if (valor === null || typeof valor !== 'object') return fuera;
  if (Array.isArray(valor)) { valor.forEach(v => campos(v, fuera)); return fuera; }
  for (const k of Object.keys(valor)) { fuera.add(k); campos(valor[k], fuera); }
  return fuera;
}

describe('lo que el catálogo del agente entrega por su ruta pública', () => {
  test('ni el costo, ni existencias, ni datos internos, a ninguna profundidad', async () => {
    const servicio = montar([FILA]);
    const { products } = await servicio.listarProductos({});

    const salen = [...campos(products)];
    const internos = salen.filter(k => /cost|inventory|quantity|warehouse|descrip|cabys|alegra|impuesto_id|categoria_id/i.test(k));
    assert.deepEqual(internos, [], `salen campos internos: ${internos.join(', ')}`);
    assert.equal(JSON.stringify(products).includes('197.99'), false, 'el costo viaja en la respuesta');
  });

  test('sale exactamente lo que la tablet lee, y nada más', async () => {
    const servicio = montar([FILA]);
    const { products: [p] } = await servicio.listarProductos({});

    assert.deepEqual(Object.keys(p).sort(),
      ['id', 'images', 'itemCategory', 'name', 'price', 'productoId', 'reference', 'status', 'subcategoria', 'tax']);
    assert.deepEqual(p, {
      id: '621',
      productoId: 621,
      name: 'LLAVE DE PASO CTE PLASTICA',
      reference: '216',
      status: 'active',
      price: [{ price: 270 }],
      tax: [{ percentage: 13 }],
      images: [{ url: '/archivos/productos/621-a.jpg', favorite: true }],
      itemCategory: { name: 'Productos de PVC' },
      subcategoria: { id: 9, nombre: 'PVC 1/2' }
    });
  });

  test('un producto sin foto, sin impuesto o sin categoría no se rompe', async () => {
    const servicio = montar([{ producto_id: 7, nombre: 'SUELTO', referencia: null, categoria: null, precio_sin_iva: '100', tarifa: null, imagen_url: null }]);
    const { products: [p] } = await servicio.listarProductos({});

    assert.equal(p.reference, '');
    assert.deepEqual(p.tax, []);
    assert.deepEqual(p.images, []);
    assert.equal(p.itemCategory, null);
  });

  test('la consulta que comparten los dos catálogos públicos no trae el costo', () => {
    // `COLUMNAS` la usan el catálogo del agente y el de clientes, los dos sin sesión.
    const { COLUMNAS } = require('../src/modules/catalogo-clientes/consultaProducto');
    assert.doesNotMatch(COLUMNAS, /costo|margen/i);
    // Y el servicio no manda la fila tal cual: la pasa por `aFormaDeTablet`.
    const servicio = fs.readFileSync(rutaServicio, 'utf8');
    assert.match(servicio, /products: await conSubcategoria\(rows\.map\(aFormaDeTablet\)\)/);
    assert.equal((servicio.match(/^function aFormaDeTablet\(/gm) || []).length, 1, 'tiene que haber UNA sola aFormaDeTablet');
  });
});
