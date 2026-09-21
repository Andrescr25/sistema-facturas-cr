const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * El árbol de categorías y subcategorías con sus conteos (GET /catalog/arbol)
 * y la lista completa de una categoría (GET /catalog/productos-de-categoria)
 * — lo que pinta el riel del rediseño de Gestión de Catálogo.
 *
 * El conteo de "sin clasificar" tiene que salir del MISMO criterio de
 * "visible" que usa la lista de productos de al lado (activo y no oculto):
 * si no coincidieran, el riel diría un número y la lista de al lado otro.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaPrisma = path.join(__dirname, '..', 'lib', 'prisma.js');
const rutaAlegra = path.join(__dirname, '..', 'src', 'integrations', 'alegra', 'index.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'catalogo', 'catalogo.service.js');
const rutaCategorias = path.join(__dirname, '..', 'src', 'modules', 'catalogo', 'categorias.service.js');
const rutaSubcategorias = path.join(__dirname, '..', 'src', 'modules', 'catalogo', 'subcategorias.service.js');

function montar({ alegraCategorias = [], subcategoriasFilas = [], conteos = [], productosDeCategoria = [] } = {}) {
  for (const r of [rutaDb, rutaPrisma, rutaAlegra, rutaServicio, rutaCategorias, rutaSubcategorias]) {
    delete require.cache[r];
  }

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql) => {
        if (/SELECT categoria, nombre_visible, orden FROM categoria_config/.test(sql)) {
          return { rows: [] }; // sin config: categorias.service usa el orden de llegada de Alegra
        }
        if (/FROM subcategoria s/.test(sql)) return { rows: subcategoriasFilas };
        if (/GROUP BY category, subcategoria_id/.test(sql)) return { rows: conteos };
        if (/FROM alegra_products_cache p\s+LEFT JOIN subcategoria/.test(sql)) return { rows: productosDeCategoria };
        return { rows: [] };
      }
    }
  };

  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: {
      getProductService: () => ({ getItemCategories: async () => alegraCategorias }),
      getClient: () => ({})
    }
  };

  require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: {} };

  return { servicio: require(rutaServicio) };
}

describe('el árbol de categorías (riel)', () => {
  test('total y sin clasificar salen del mismo criterio que la lista de productos', async () => {
    const { servicio } = montar({
      alegraCategorias: [{ id: 1, name: 'Productos de PVC' }],
      subcategoriasFilas: [{ id: 4, categoria: 'Productos de PVC', nombre: 'PVC 1/2', activo: true, orden: 0, productos: 2 }],
      conteos: [
        { category: 'Productos de PVC', subcategoria_id: 4, n: 2 },
        { category: 'Productos de PVC', subcategoria_id: null, n: 3 }
      ]
    });

    const r = await servicio.arbolCatalogo();
    const pvc = r.categorias.find((c) => c.name === 'Productos de PVC');

    assert.equal(pvc.id, 1); // el id de Alegra viaja: la ficha y el lote lo necesitan para el PUT
    assert.equal(pvc.total, 5);
    assert.equal(pvc.sinClasificar, 3);
    assert.deepEqual(pvc.subcategorias, [{ id: 4, nombre: 'PVC 1/2', orden: 0, activo: true, productos: 2 }]);
  });

  test('una categoría sin ningún producto queda en 0, no explota', async () => {
    const { servicio } = montar({ alegraCategorias: [{ id: 1, name: 'Medicamentos' }] });
    const r = await servicio.arbolCatalogo();

    assert.equal(r.categorias[0].total, 0);
    assert.equal(r.categorias[0].sinClasificar, 0);
    assert.deepEqual(r.categorias[0].subcategorias, []);
  });

  test('las categorías llegan en el orden canónico (el que devuelve categorias.service.listar)', async () => {
    const { servicio } = montar({
      alegraCategorias: [{ id: 1, name: 'Zapatos' }, { id: 2, name: 'Aceites' }]
    });
    const r = await servicio.arbolCatalogo();
    // Sin configurar orden, categorias.service cae al que trajo Alegra —
    // acá solo se comprueba que arbolCatalogo no lo reordena por su cuenta.
    assert.deepEqual(r.categorias.map((c) => c.name), ['Zapatos', 'Aceites']);
  });
});

describe('todos los productos de una categoría (panel derecho del riel)', () => {
  test('sin categoría, se dice', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.productosDeCategoria(''), (e) => e.status === 400);
  });

  test('trae subcategoría, rotación y proveedor en un solo viaje, y el margen sale del motor de precios', async () => {
    const { servicio } = montar({
      productosDeCategoria: [{
        alegra_id: '1031', name: 'CODO 1/2 PVC', reference: 'REF-1031',
        price: 100, cost: 90.4, tax_percentage: 13, image_url: null, category: 'Productos de PVC',
        sub_id: 4, sub_nombre: 'PVC 1/2',
        unidades_mes: '12.50',
        supplier_name: 'F & G Ferreteros', supplier_cedula: '3101129878'
      }]
    });

    const [p] = await servicio.productosDeCategoria('Productos de PVC');

    assert.equal(p.alegraId, '1031');
    assert.deepEqual(p.subcategoria, { id: 4, nombre: 'PVC 1/2' });
    assert.equal(p.unidadesMes, 12.5);
    assert.deepEqual(p.proveedor, { nombre: 'F & G Ferreteros', cedula: '3101129878' });
    // costo 90.4 con IVA -> ~80 sin IVA sobre un precio de 100: margen ~20%,
    // calculado por clasificarProducto (precios/auditoria.js), no a mano acá.
    assert.ok(p.margenReal > 15 && p.margenReal < 25, `margen fuera de rango: ${p.margenReal}`);
  });

  test('un producto sin subcategoría ni proveedor no revienta, solo queda null', async () => {
    const { servicio } = montar({
      productosDeCategoria: [{
        alegra_id: '2001', name: 'TUERCA SUELTA', reference: 'REF-2001',
        price: 50, cost: 0, tax_percentage: null, image_url: null, category: 'Ferretería',
        sub_id: null, sub_nombre: null, unidades_mes: null, supplier_name: null, supplier_cedula: null
      }]
    });

    const [p] = await servicio.productosDeCategoria('Ferretería');
    assert.equal(p.subcategoria, null);
    assert.equal(p.proveedor, null);
    assert.equal(p.unidadesMes, null);
    assert.equal(p.precioConIva, null); // sin tax_percentage todavía no se sincronizó
  });
});
