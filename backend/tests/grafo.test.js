const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  RAIZ_REPO, TIPOS_VALIDOS, ARISTAS_VALIDAS, ESTADOS_VALIDOS, cargarGrafo
} = require('../src/utils/grafo');

/**
 * El grafo de conocimiento (`docs/grafo/`) se valida acá, corriendo con el
 * resto de `npm test`, a propósito: un grafo roto no puede quedar sin que
 * nadie se entere hasta que alguien lo abra a mano. Es exactamente el error
 * que ya pasó una vez —el checklist afirmó durante meses que el XML se
 * guardaba, y nada lo desmentía—, y esta prueba es la que existe para que no
 * se repita con el grafo.
 *
 * Las cinco comprobaciones son las del plan: id único y consistente con la
 * ruta, aristas que apuntan a algo que existe, vocabulario cerrado de tipos y
 * aristas, archivos citados que existen de verdad en el disco, y ningún nodo
 * sin ninguna arista.
 */

describe('el grafo de conocimiento', () => {
  test('cada nodo tiene un id, y ese id es único', () => {
    const { errores } = cargarGrafo();
    const deIds = errores.filter((e) => /id duplicado|sin campo "id"/.test(e));
    assert.deepEqual(deIds, [], deIds.join('\n'));
  });

  test('el id coincide con tipo/nombre-de-archivo', () => {
    // Que "tabla/compra" viva en docs/grafo/tabla/compra.md y no en
    // cualquier otro lado: es lo que hace que un enlace `id: x/y` se pueda
    // seguir sin tener que grepear el repositorio entero.
    const { nodos } = cargarGrafo();
    const descalzados = [];
    for (const nodo of nodos.values()) {
      const esperado = `${nodo._tipoCarpeta}/${nodo._nombreArchivo}`;
      if (nodo.id !== esperado) {
        descalzados.push(`${nodo._archivoNodo}: id "${nodo.id}" debería ser "${esperado}"`);
      }
    }
    assert.deepEqual(descalzados, [], descalzados.join('\n'));
  });

  test('todo el frontmatter se pudo leer', () => {
    const { errores } = cargarGrafo();
    const deParseo = errores.filter((e) => !/id duplicado|sin campo "id"/.test(e));
    assert.deepEqual(deParseo, [], deParseo.join('\n'));
  });

  test('cada arista apunta a un nodo que existe', () => {
    const { nodos } = cargarGrafo();
    const rotas = [];
    for (const nodo of nodos.values()) {
      for (const [tipoArista, destinos] of Object.entries(nodo.aristas || {})) {
        for (const destino of destinos) {
          if (!nodos.has(destino)) {
            rotas.push(`${nodo.id} --${tipoArista}--> "${destino}" (no existe)`);
          }
        }
      }
    }
    assert.deepEqual(rotas, [], rotas.join('\n'));
  });

  test('el tipo de cada nodo está en el vocabulario permitido', () => {
    const { nodos } = cargarGrafo();
    const invalidos = [...nodos.values()]
      .filter((n) => !TIPOS_VALIDOS.has(n.tipo))
      .map((n) => `${n.id}: tipo "${n.tipo}" no está en {${[...TIPOS_VALIDOS].join(', ')}}`);
    assert.deepEqual(invalidos, [], invalidos.join('\n'));
  });

  test('el nombre de cada arista está en el vocabulario permitido', () => {
    const { nodos } = cargarGrafo();
    const invalidas = [];
    for (const nodo of nodos.values()) {
      for (const nombre of Object.keys(nodo.aristas || {})) {
        if (!ARISTAS_VALIDAS.has(nombre)) {
          invalidas.push(`${nodo.id}: arista "${nombre}" no está en {${[...ARISTAS_VALIDAS].join(', ')}}`);
        }
      }
    }
    assert.deepEqual(invalidas, [], invalidas.join('\n'));
  });

  test('el estado, si viene, es uno de los tres válidos', () => {
    const { nodos } = cargarGrafo();
    const invalidos = [...nodos.values()]
      .filter((n) => n.estado && !ESTADOS_VALIDOS.has(n.estado))
      .map((n) => `${n.id}: estado "${n.estado}" no está en {${[...ESTADOS_VALIDOS].join(', ')}}`);
    assert.deepEqual(invalidos, [], invalidos.join('\n'));
  });

  test('cada archivo citado existe en el disco', () => {
    // La comprobación que de verdad importa: es la que hubiera avisado que
    // "el XML ya se guarda" citaba una columna que solo tiene el nombre del
    // archivo, no su contenido, si el nodo hubiera citado el archivo correcto
    // y este validador hubiera corrido.
    const { nodos } = cargarGrafo();
    const faltantes = [];
    for (const nodo of nodos.values()) {
      for (const archivo of nodo.archivos || []) {
        if (!fs.existsSync(path.join(RAIZ_REPO, archivo))) {
          faltantes.push(`${nodo.id}: "${archivo}" no existe`);
        }
      }
    }
    assert.deepEqual(faltantes, [], faltantes.join('\n'));
  });

  test('ningún nodo queda huérfano', () => {
    // Sin ninguna arista de entrada ni de salida, un nodo no se puede
    // encontrar desde ningún otro: es exactamente lo que pasaba con el 42 %
    // de la memoria de ~/.claude antes de este trabajo.
    const { nodos } = cargarGrafo();
    const entrantes = new Set();
    for (const nodo of nodos.values()) {
      for (const destinos of Object.values(nodo.aristas || {})) {
        destinos.forEach((d) => entrantes.add(d));
      }
    }
    const huerfanos = [...nodos.values()]
      .filter((n) => !entrantes.has(n.id) && Object.values(n.aristas || {}).every((d) => d.length === 0))
      .map((n) => n.id);
    assert.deepEqual(huerfanos, [], huerfanos.join('\n'));
  });

  test('hay al menos un nodo cargado', () => {
    // Un grafo vacío pasaría las ocho pruebas de arriba sin decir nada: esta
    // es la que impide que "no hay errores" se confunda con "está bien".
    const { nodos } = cargarGrafo();
    assert.ok(nodos.size > 0, 'docs/grafo/ no tiene ningún nodo cargado');
  });
});
