/**
 * Las familias dentro de una categoría, en el catálogo del agente.
 *
 * POR QUÉ IMPORTA
 * "Productos de PVC" son 118 piezas revueltas: el de 1/2 al lado del de 3/4 y
 * del sanitario. Con el cliente parado en el mostrador no se encuentra nada.
 * Partido en familias, se le enseña "PVC 1/2" y ahí está todo lo de 1/2.
 *
 * LO QUE HAY QUE CUIDAR es que NO se parta lo que no hay que partir: hoy hay
 * una sola subcategoría en todo el catálogo, y si esto devolviera bloques
 * para todas las categorías, las otras cuarenta se llenarían de encabezados
 * que no dicen nada.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// El módulo es ESM y estas pruebas son CommonJS; mismo camino que
// busquedaCatalogoAgente.test.js.
const FUENTE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'catalogoAgentePersonalizacion.js'), 'utf8');

const { partirPorSubcategoria, ordenarCatalogoParaCliente } = new Function(
  `${FUENTE.replace(/^export /gm, '')}
   return { partirPorSubcategoria, ordenarCatalogoParaCliente };`
)();

const pvc = (id, nombre, sub) => ({
  id, name: nombre,
  itemCategory: { name: 'Productos de PVC' },
  ...(sub ? { subcategoria: { id: sub.length, nombre: sub } } : {})
});

describe('las familias dentro de una categoría', () => {
  test('parte la categoría en un bloque por subcategoría', () => {
    const bloques = partirPorSubcategoria({
      'Productos de PVC': [
        pvc(1, 'CODO 1/2 PVC', 'PVC 1/2'),
        pvc(2, 'UNION 3/4 PVC', 'PVC 3/4'),
        pvc(3, 'ADAPTADOR 1/2 PVC', 'PVC 1/2')
      ]
    })['Productos de PVC'];

    assert.deepEqual(bloques.map(b => b.nombre), ['PVC 1/2', 'PVC 3/4']);
    assert.deepEqual(bloques[0].productos.map(p => p.id), [1, 3]);
    assert.deepEqual(bloques[1].productos.map(p => p.id), [2]);
  });

  test('la categoría SIN subcategorías no se parte', () => {
    // Es el caso de las otras cuarenta categorías. `undefined` es la señal de
    // "dibujala de una tirada, como siempre".
    const partido = partirPorSubcategoria({
      'Abarrotes': [pvc(1, 'ARROZ'), pvc(2, 'FRIJOL')]
    });

    assert.equal(partido['Abarrotes'], undefined);
  });

  test('lo que no tiene subcategoría va al final, bajo "Otros"', () => {
    // No se esconde: es la lista que hay que ir vaciando. Si desapareciera,
    // un producto sin clasificar dejaría de verse sin que nadie se enterara.
    const bloques = partirPorSubcategoria({
      'Productos de PVC': [
        pvc(1, 'TUBO SIN CLASIFICAR'),
        pvc(2, 'CODO 1/2 PVC', 'PVC 1/2')
      ]
    })['Productos de PVC'];

    assert.deepEqual(bloques.map(b => b.nombre), ['PVC 1/2', 'Otros']);
    assert.equal(bloques[1].sinClasificar, true);
    assert.deepEqual(bloques[1].productos.map(p => p.id), [1]);
  });

  test('las medidas se ordenan por número, no como texto', () => {
    // Comparadas como texto, "PVC 10" queda antes que "PVC 2" y las medidas
    // salen desordenadas — justo lo que se viene a arreglar.
    const bloques = partirPorSubcategoria({
      'Productos de PVC': [
        pvc(1, 'a', 'PVC 10'), pvc(2, 'b', 'PVC 2'), pvc(3, 'c', 'PVC 1')
      ]
    })['Productos de PVC'];

    assert.deepEqual(bloques.map(b => b.nombre), ['PVC 1', 'PVC 2', 'PVC 10']);
  });

  test('sale junto con el agrupado por categoría, sin pedirlo aparte', () => {
    const { grouped, sortedKeys, subgrupos } = ordenarCatalogoParaCliente(
      [pvc(1, 'CODO 1/2 PVC', 'PVC 1/2'), pvc(2, 'UNION 3/4 PVC', 'PVC 3/4')],
      new Map()
    );

    assert.deepEqual(sortedKeys, ['Productos de PVC']);
    assert.equal(grouped['Productos de PVC'].length, 2);
    assert.deepEqual(subgrupos['Productos de PVC'].map(b => b.nombre), ['PVC 1/2', 'PVC 3/4']);
  });
});
