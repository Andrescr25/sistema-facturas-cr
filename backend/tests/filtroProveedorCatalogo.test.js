const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * Filtro por proveedor en Gestión de Catálogo.
 *
 * La caché de productos no sabe quién vende qué: eso vive en
 * supplier_product_mapping. Se filtra por cédula y no por nombre, porque el
 * mismo proveedor aparece con dos grafías. La base local ES producción, así
 * que todo va con dobles.
 */

const rutaPrisma = path.join(__dirname, '..', 'lib', 'prisma.js');
const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaAlegra = path.join(__dirname, '..', 'src', 'integrations', 'alegra', 'index.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'catalogo', 'catalogo.service.js');

// Mapeos reales recortados: F&G con sus dos grafías, un producto (500) que
// lo venden dos proveedores, y la caché con uno que nadie vende (900).
const MAPEOS = [
  { supplierCedula: '3101129878', supplierName: 'F & G Ferreteros Sociedad Anonima', alegraItemId: '100' },
  { supplierCedula: '3101129878', supplierName: 'F Y G FERRETEROS SOCIEDAD ANONIMA', alegraItemId: '200' },
  { supplierCedula: '3101129878', supplierName: 'F Y G FERRETEROS SOCIEDAD ANONIMA', alegraItemId: '500' },
  { supplierCedula: '3101013155', supplierName: 'CADENA COMERCIAL RAMONENSE S.A.', alegraItemId: '500' },
  { supplierCedula: '3101013155', supplierName: 'CADENA COMERCIAL RAMONENSE S.A.', alegraItemId: '' }
];

function montar() {
  const pedidos = { findMany: [], mapeo: [] };
  const aplicarWhere = (w) => (p) => {
    if (w.alegraId?.in && !w.alegraId.in.includes(p.alegraId)) return false;
    if (w.alegraId?.notIn && w.alegraId.notIn.includes(p.alegraId)) return false;
    return true;
  };
  const CACHE = ['100', '200', '500', '900'].map(id => ({ alegraId: id, name: `P${id}`, price: 1, taxPercentage: 13 }));

  // listarProductos también lee los datos complementarios por pg. Sustituir
  // solo Prisma dejaba esa consulta conectarse a la base configurada.
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { query: async sql => {
      assert.match(sql.trim(), /^SELECT\b/);
      return { rows: [] };
    } }
  };

  require.cache[rutaPrisma] = {
    id: rutaPrisma, filename: rutaPrisma, loaded: true,
    exports: {
      supplierProductMapping: {
        findMany: async ({ where }) => {
          // Igual que Prisma: alegraItemId es String obligatorio y no admite
          // `{ not: null }`. La primera versión del filtro lo mandaba, este
          // doble lo dejaba pasar y la prueba salía verde mientras en la base
          // real reventaba.
          if (where.alegraItemId && where.alegraItemId.not === null) {
            throw new Error('PrismaClientValidationError: Argument `not` must not be null.');
          }
          pedidos.mapeo.push(where);
          const filas = MAPEOS.filter(m =>
            where.supplierCedula === undefined || m.supplierCedula === where.supplierCedula);
          const vistos = new Set();
          return filas.filter(m => !vistos.has(m.alegraItemId) && vistos.add(m.alegraItemId))
            .map(m => ({ alegraItemId: m.alegraItemId }));
        }
      },
      alegraProduct: {
        findMany: async ({ where }) => { pedidos.findMany.push(where); return CACHE.filter(aplicarWhere(where)); },
        count: async ({ where }) => CACHE.filter(aplicarWhere(where)).length
      }
    }
  };
  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: { getProductService: () => ({}), getClient: () => ({}) }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), pedidos };
}

beforeEach(() => {
  for (const r of [rutaPrisma, rutaDb, rutaAlegra, rutaServicio]) delete require.cache[r];
});

describe('listarProductos con proveedor', () => {
  test('sin proveedor no se consulta el mapeo ni se toca el filtro', async () => {
    const { servicio, pedidos } = montar();
    const r = await servicio.listarProductos({});
    assert.equal(pedidos.mapeo.length, 0);
    assert.equal(pedidos.findMany[0].alegraId, undefined);
    assert.equal(r.pagination.total, 4);
  });

  test('filtra por cédula y junta las dos grafías del mismo proveedor', async () => {
    const { servicio, pedidos } = montar();
    const r = await servicio.listarProductos({ proveedor: '3101129878' });
    assert.equal(pedidos.mapeo[0].supplierCedula, '3101129878');
    assert.deepEqual(r.data.map(p => p.alegraId).sort(), ['100', '200', '500']);
  });

  test('un producto con dos proveedores aparece bajo cada uno', async () => {
    const { servicio } = montar();
    const fyg = await servicio.listarProductos({ proveedor: '3101129878' });
    const ccr = await servicio.listarProductos({ proveedor: '3101013155' });
    assert.ok(fyg.data.some(p => p.alegraId === '500'));
    assert.ok(ccr.data.some(p => p.alegraId === '500'));
  });

  test('un mapeo con el id vacío no cuela un "" en el filtro', async () => {
    const { servicio, pedidos } = montar();
    await servicio.listarProductos({ proveedor: '3101013155' });
    assert.deepEqual(pedidos.findMany[0].alegraId.in, ['500']);
  });

  test('no le manda a Prisma un filtro que Prisma rechaza', async () => {
    // alegraItemId no es nullable: `{ not: null }` es un error de validación.
    const { servicio, pedidos } = montar();
    await servicio.listarProductos({ proveedor: '3101129878' });
    await servicio.listarProductos({ proveedor: servicio.SIN_PROVEEDOR });
    for (const w of pedidos.mapeo) assert.equal(w.alegraItemId, undefined);
  });

  test('"sin proveedor" trae solo los que nadie vende', async () => {
    const { servicio } = montar();
    const r = await servicio.listarProductos({ proveedor: servicio.SIN_PROVEEDOR });
    assert.deepEqual(r.data.map(p => p.alegraId), ['900']);
  });

  test('una cédula sin productos devuelve vacío, no el catálogo entero', async () => {
    // Si el filtro se saltara con una lista vacía, elegir un proveedor sin
    // productos mostraría TODO y parecería que el filtro no hace nada.
    const { servicio } = montar();
    const r = await servicio.listarProductos({ proveedor: '999999999' });
    assert.equal(r.pagination.total, 0);
    assert.deepEqual(r.data, []);
  });

  test('se combina con "solo sin imagen" en vez de pisarlo', async () => {
    const { servicio, pedidos } = montar();
    await servicio.listarProductos({ proveedor: '3101129878', missingImageOnly: 'true' });
    const w = pedidos.findMany[0];
    assert.ok(Array.isArray(w.OR), 'el filtro de imagen desapareció');
    assert.ok(w.alegraId?.in, 'el filtro de proveedor desapareció');
  });

  test('los espacios de más no rompen la cédula', async () => {
    const { servicio, pedidos } = montar();
    await servicio.listarProductos({ proveedor: '  3101129878 ' });
    assert.equal(pedidos.mapeo[0].supplierCedula, '3101129878');
  });
});
