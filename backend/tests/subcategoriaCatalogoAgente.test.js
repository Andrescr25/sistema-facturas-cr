const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * La subcategoría viajando con el catálogo del agente.
 *
 * La subcategoría es NUESTRA. En esta rama vive en `producto.subcategoria_id`
 * (migración 030) y se cruza por el id PROPIO (`productoId`), no por el `id`
 * de Alegra que la tablet sigue usando: los dos son números y pasar uno por
 * el otro no da error, le pega la subcategoría de OTRO producto (ver
 * leccion/ids-propios-y-de-alegra-no-se-mezclan).
 *
 * Esta prueba seguía con la versión de main (cruce por id de Alegra) y
 * fallaba desde que la rama pasó al id propio; se puso al día el 2026-09-29.
 *
 * La clasificación incluye marcas desde el2026-10-22. Si falla su lectura,
 * la sincronización falla y conserva la última copia completa de la tablet;
 * no se sustituye por productos que perdieron silenciosamente su agrupación.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'catalogo-agente', 'catalogo-agente.service.js');

function montar(responder) {
  for (const r of [rutaDb, rutaServicio]) delete require.cache[r];

  const real = require(rutaDb);
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { ...real, query: responder }
  };

  return require(rutaServicio).conSubcategoria;
}

// El producto propio 5004 (id de Alegra 1004) está en "PVC 1/2".
const FILAS = [
  { producto_id: 5004, sub_id: 9, sub_nombre: 'PVC 1/2' }
];

describe('la subcategoría viaja con el catálogo del agente', () => {
  test('se la pega al producto que la tiene', async () => {
    const conSubcategoria = montar(async () => ({ rows: FILAS }));
    const [a, b] = await conSubcategoria([{ id: '1004', productoId: 5004, name: 'UNION' }, { id: '77', productoId: 77, name: 'OTRO' }]);

    assert.deepEqual(a.subcategoria, { id: 9, nombre: 'PVC 1/2' });
    // Al que no la tiene no se le inventa un campo vacío: la tarjeta pregunta
    // por `subcategoria?.nombre` y un objeto sin nombre dibujaría un "·" suelto.
    assert.equal('subcategoria' in b, false);
  });

  test('cruza por el id propio, nunca por el de Alegra', async () => {
    // Un producto cuyo id de ALEGRA es 5004 no es el producto propio 5004.
    let pedidos;
    const conSubcategoria = montar(async (_sql, params) => { pedidos = params[0]; return { rows: FILAS }; });
    const [otro] = await conSubcategoria([{ id: '5004', productoId: 12, name: 'OTRO' }]);

    assert.deepEqual(pedidos, [12], 'a la base se le pregunta por el id propio');
    assert.equal('subcategoria' in otro, false);
  });

  test('si falla la clasificación, se rechaza la página para conservar la copia anterior', async () => {
    const conSubcategoria = montar(async () => { throw new Error('la base dijo que no'); });
    await assert.rejects(conSubcategoria([{ id: '1004', productoId: 5004, name: 'UNION' }]), /la base dijo que no/);
  });

  test('marca e imagen salen por campos explícitos, en la misma consulta por página', async () => {
    let llamadas=0;
    const conSubcategoria=montar(async()=>{
      llamadas++;
      return { rows:[{...FILAS[0],marca_id:7,marca_nombre:'Tricicle',marca_imagen:{url:'/archivos/marcas/7.webp',ancho:800,alto:600,costo:99,interno:'ZZ'}}] };
    });
    const [p]=await conSubcategoria([{id:'5004',productoId:5004,name:'UNION'}]);
    assert.equal(llamadas,1);
    assert.deepEqual(p.marca,{id:7,nombre:'Tricicle',imagen:{url:'/archivos/marcas/7.webp',ancho:800,alto:600}});
  });

  test('sin productos no se consulta la base', async () => {
    let llamadas = 0;
    const conSubcategoria = montar(async () => { llamadas++; return { rows: [] }; });
    assert.deepEqual(await conSubcategoria([]), []);
    assert.equal(llamadas, 0);
  });
});
