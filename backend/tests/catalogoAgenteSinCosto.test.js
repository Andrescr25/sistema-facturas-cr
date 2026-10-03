const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * El catálogo del agente NO entrega el costo.
 *
 * `/catalogo-agente/productos` es una ruta PÚBLICA: está abierta sin sesión
 * para que el agente pueda trabajar en zonas sin señal. Hasta el 2026-10-03
 * devolvía el producto de Alegra entero, y el producto de Alegra trae
 * `inventory.unitCost` — el costo de compra. Cualquiera con la dirección podía
 * bajarse la lista de costos del negocio.
 *
 * Se prueba como LISTA DE LO QUE SÍ SALE, no de lo que se quita: si Alegra
 * agrega un campo mañana, esta prueba lo frena hasta que alguien decida que la
 * tablet lo necesita.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaAlegra = path.join(__dirname, '..', 'src', 'integrations', 'alegra', 'index.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'catalogo-agente', 'catalogo-agente.service.js');

/** Un producto como lo devuelve `/items` de Alegra, con todo lo que no debe salir. */
const DE_ALEGRA = {
  id: 621,
  name: 'LLAVE DE PASO CTE PLASTICA',
  description: 'texto interno',
  reference: { reference: '216', type: '04' },
  status: 'active',
  type: 'product',
  price: [
    { idPriceList: 1, name: 'General', price: 270 },
    { idPriceList: 2, name: 'Mayorista', price: 240 }
  ],
  tax: [{ id: 1, name: 'IVA', percentage: '13.00', type: 'IVA', status: 'active' }],
  images: [
    { id: 9, name: 'a.jpg', url: 'https://cdn.alegra.com/a.jpg', favorite: false },
    { id: 10, name: 'b.jpg', url: 'https://cdn.alegra.com/b.jpg', favorite: true }
  ],
  itemCategory: { id: 5, name: 'Productos de PVC', status: 'active' },
  inventory: {
    unit: 'unit', unitCost: 197.99, availableQuantity: 14, initialQuantity: 0,
    warehouses: [{ id: 1, name: 'Principal', availableQuantity: 14 }]
  },
  accounting: { accountReceivable: { id: 5001 }, inventory: { id: 5002 } },
  customFields: [{ id: 1, name: 'Proveedor', value: 'F&G' }],
  productKey: '3162100000000'
};

function montar(items) {
  for (const r of [rutaDb, rutaAlegra, rutaServicio]) delete require.cache[r];

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { query: async () => ({ rows: [{ alegra_id: '621', sub_id: 9, sub_nombre: 'PVC 1/2' }] }) }
  };
  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: { getClient: () => ({ get: async () => ({ success: true, data: items }) }) }
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
  test('ni el costo, ni existencias, ni cuentas contables, a ninguna profundidad', async () => {
    const servicio = montar([DE_ALEGRA]);
    const { products } = await servicio.listarProductos({});

    const salen = [...campos(products)];
    const internos = salen.filter(k => /cost|inventory|quantity|warehouse|accounting|customFields|description|productKey/i.test(k));
    assert.deepEqual(internos, [], `salen campos internos: ${internos.join(', ')}`);
    assert.equal(JSON.stringify(products).includes('197.99'), false, 'el costo viaja en la respuesta');
  });

  test('sale exactamente lo que la tablet lee, y nada más', async () => {
    const servicio = montar([DE_ALEGRA]);
    const { products: [p] } = await servicio.listarProductos({});

    assert.deepEqual(Object.keys(p).sort(),
      ['id', 'images', 'itemCategory', 'name', 'price', 'reference', 'status', 'subcategoria', 'tax']);
    assert.deepEqual(p, {
      id: 621,
      name: 'LLAVE DE PASO CTE PLASTICA',
      reference: '216',
      status: 'active',
      // Solo la primera lista: la de mayorista no es para el que tenga el enlace.
      price: [{ price: 270 }],
      tax: [{ percentage: '13.00' }],
      images: [
        { url: 'https://cdn.alegra.com/a.jpg', favorite: false },
        { url: 'https://cdn.alegra.com/b.jpg', favorite: true }
      ],
      itemCategory: { name: 'Productos de PVC' },
      subcategoria: { id: 9, nombre: 'PVC 1/2' }
    });
  });

  test('un producto sin foto, sin impuesto, sin categoría o sin precio no se rompe', async () => {
    const servicio = montar([{ id: 7, name: 'SUELTO', status: 'active', reference: 'A-1' }]);
    const { products: [p] } = await servicio.listarProductos({});

    assert.equal(p.reference, 'A-1');   // la referencia también llega como texto
    assert.deepEqual(p.price, []);
    assert.deepEqual(p.tax, []);
    assert.deepEqual(p.images, []);
    assert.equal(p.itemCategory, null);
  });

  test('los inactivos siguen sin salir', async () => {
    const servicio = montar([DE_ALEGRA, { ...DE_ALEGRA, id: 622, status: 'inactive' }]);
    const { products, debug } = await servicio.listarProductos({});
    assert.deepEqual(products.map(x => x.id), [621]);
    assert.equal(debug.active_filtered, 1);
  });
});
