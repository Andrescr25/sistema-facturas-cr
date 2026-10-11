const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * Buscar una relación por el nombre con que la pantalla la llama.
 *
 * EL PROBLEMA. `supplier_product_mapping.alegra_name` es una FOTO del nombre
 * del producto de cuando se creó la relación, y nadie la refresca. La lista ya
 * mostraba el nombre ACTUAL del catálogo, pero la búsqueda seguía mirando solo
 * la foto: se podía leer "EXTENSION CTE BLANCA 3 MTS VOLTECK" en pantalla,
 * copiarlo tal cual al buscador y no encontrar nada, porque la relación lo
 * tenía guardado como "...3 MTS CTE", de antes de que lo renombraran.
 *
 * Son 98 de 2.056 relaciones con el nombre desfasado, y los renombres suelen
 * agregar justo lo que uno teclearía: "NACIONAL", "C/ PUNTOS", "SALVADORENA".
 *
 * No poder encontrar algo por el nombre con que la propia pantalla lo llama es
 * de las cosas que hacen desconfiar del buscador entero.
 *
 * DESDE EL 2026-10-03 el nombre de hoy es el del maestro propio (`producto`),
 * y la relación se cruza con él por `producto_id`, no por el id de Alegra.
 */

const rutaPrisma = path.join(__dirname, '..', 'lib', 'prisma.js');
const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'productos-revision', 'productos-revision.service.js');

// La relación guarda el nombre viejo; el catálogo ya tiene el nuevo.
const MAPEO = {
  id: 'm1',
  supplierName: 'F & G Ferreteros Sociedad Anonima',
  supplierCedula: '3101129878',
  supplierCode: '100357',
  supplierDesc: 'EXTENSION ELECT. 2 X 16  3M VOLTECK',
  alegraItemId: '1031',
  alegraReference: '111',
  alegraName: 'EXTENSION CTE BLANCA 3 MTS CTE',
  confidence: 100,
  timesUsed: 4,
  origen: 'manual',
  createdDate: new Date('2026-01-10'),
  lastUsedDate: new Date('2026-09-01')
};

// El maestro propio, visto desde el mapeo: `m.producto_id → producto`.
const CATALOGO = [
  { mapeo_id: 'm1', id: 501, nombre: 'EXTENSION CTE BLANCA 3 MTS VOLTECK', referencia: '111' }
];

function montar() {
  for (const r of [rutaPrisma, rutaDb, rutaServicio]) delete require.cache[r];

  const visto = { where: null, consultas: [] };

  require.cache[rutaPrisma] = {
    id: rutaPrisma, filename: rutaPrisma, loaded: true,
    exports: {
      supplierProductMapping: {
        findMany: async ({ where }) => {
          visto.where = where;
          // Se imita lo que haría la base: calza si alguna de las condiciones
          // del OR se cumple.
          if (!where?.OR) return [MAPEO];
          const calza = where.OR.some((cond) => {
            if (cond.id?.in) return cond.id.in.includes(MAPEO.id);
            const [campo, regla] = Object.entries(cond)[0];
            return String(MAPEO[campo] || '').toLowerCase().includes(String(regla.contains).toLowerCase());
          });
          return calza ? [MAPEO] : [];
        }
      }
    }
  };

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        visto.consultas.push({ sql, params });
        if (/WHERE p\.nombre ILIKE/.test(sql)) {
          const termino = String(params[0]).replace(/%/g, '').toLowerCase();
          return {
            rows: CATALOGO
              .filter(p => p.nombre.toLowerCase().includes(termino) || String(p.referencia).toLowerCase().includes(termino))
              .map(p => ({ id: p.mapeo_id }))
          };
        }
        if (/WHERE m\.id = ANY/.test(sql)) return { rows: CATALOGO.filter(p => params[0].includes(p.mapeo_id)) };
        return { rows: [] };
      }
    }
  };

  return { servicio: require(rutaServicio), visto };
}

const cuantas = (r) => (r.productos || r.data || []).length;

describe('buscar por el nombre que se ve en pantalla', () => {
  test('el nombre ACTUAL del producto encuentra la relación', async () => {
    // Este es el caso que fallaba: daba cero.
    const { servicio } = montar();
    const r = await servicio.getRelacionados({ busqueda: 'EXTENSION CTE BLANCA 3 MTS VOLTECK' });

    assert.equal(cuantas(r), 1, 'no se encuentra por el nombre que la propia pantalla muestra');
  });

  test('lo que se devuelve nombra al producto propio, no al de Alegra', async () => {
    const { servicio } = montar();
    const [relacion] = (await servicio.getRelacionados({})).productos;

    assert.equal(relacion.productoPropioId, 501);
    assert.equal(relacion.productoNombre, 'EXTENSION CTE BLANCA 3 MTS VOLTECK');
    assert.equal(relacion.productoReferencia, '111');
    // El nombre guardado en la relación es de antes del renombre: se avisa.
    assert.equal(relacion.nombreGuardado, 'EXTENSION CTE BLANCA 3 MTS CTE');
    assert.equal(relacion.nombreDesactualizado, true);
    assert.deepEqual(
      { id: relacion.mapeo.productoPropioId, nombre: relacion.mapeo.productoNombre },
      { id: 501, nombre: 'EXTENSION CTE BLANCA 3 MTS VOLTECK' });
    // Ni un id de Alegra sale por acá: la pantalla ya no tiene con qué pedirlo.
    assert.ok(!JSON.stringify(relacion).includes('alegra'), 'la respuesta todavía habla de Alegra');
  });

  test('el nombre VIEJO guardado también sigue encontrando', async () => {
    // Quien lo recuerde así lo va a teclear así.
    const { servicio } = montar();
    const r = await servicio.getRelacionados({ busqueda: 'EXTENSION CTE BLANCA 3 MTS CTE' });

    assert.equal(cuantas(r), 1);
  });

  test('la referencia del catálogo también encuentra', async () => {
    const { servicio } = montar();
    const r = await servicio.getRelacionados({ busqueda: '111' });
    assert.equal(cuantas(r), 1);
  });

  test('la descripción del proveedor sigue funcionando', async () => {
    const { servicio } = montar();
    const r = await servicio.getRelacionados({ busqueda: 'EXTENSION ELECT' });
    assert.equal(cuantas(r), 1);
  });

  test('algo que no existe no devuelve nada', async () => {
    const { servicio } = montar();
    const r = await servicio.getRelacionados({ busqueda: 'TORNILLO DE ORO' });
    assert.equal(cuantas(r), 0);
  });
});

describe('cómo se consulta', () => {
  test('sin término de búsqueda no se le pregunta al catálogo', async () => {
    // Abrir la pantalla no tiene por qué costar una consulta de más.
    const { servicio, visto } = montar();
    await servicio.getRelacionados({});

    assert.ok(
      !visto.consultas.some(c => /p\.nombre ILIKE/.test(c.sql)),
      'se consultó el catálogo sin que nadie buscara nada'
    );
  });

  test('la lista de productos va acotada', async () => {
    // Un término corto como "bolsa" calza con cientos: sin tope, el IN haría
    // la consulta más lenta que útil.
    const { servicio, visto } = montar();
    await servicio.getRelacionados({ busqueda: 'EXTENSION' });

    const consulta = visto.consultas.find(c => /p\.nombre ILIKE/.test(c.sql));
    assert.match(consulta.sql, /LIMIT \d+/);
  });

  test('el filtro por producto se suma a los de siempre, no los reemplaza', async () => {
    const { servicio, visto } = montar();
    await servicio.getRelacionados({ busqueda: 'EXTENSION CTE BLANCA 3 MTS VOLTECK' });

    const campos = visto.where.OR.map(c => Object.keys(c)[0]);
    assert.ok(campos.includes('supplierDesc'), 'se perdió la búsqueda por descripción del proveedor');
    assert.ok(campos.includes('alegraName'), 'se perdió la búsqueda por el nombre guardado');
    assert.ok(campos.includes('id'), 'no se agregó la búsqueda por el nombre actual');
  });
});
