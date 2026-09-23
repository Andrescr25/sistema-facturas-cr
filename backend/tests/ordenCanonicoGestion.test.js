const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * El orden canónico compartido entre el catálogo del agente y el riel de
 * Gestión de Catálogo.
 *
 * NO HAY UNA SEGUNDA IMPLEMENTACIÓN: el riel usa las mismas
 * `ordenDeCategorias` y `partirPorSubcategoria` de
 * frontend/src/utils/catalogoAgentePersonalizacion.js que ya arma el
 * catálogo del agente — antes esa función era privada y Gestión tenía su
 * propio criterio (`indexOf` en FiltrosCatalogo.jsx), que podía desacomodarse
 * con categorías huérfanas de config.
 *
 * `sinClasificarSiempre` es la única diferencia real de comportamiento entre
 * las dos pantallas: el agente NUNCA parte una categoría sin ninguna
 * subcategoría (la dibuja de una tirada); Gestión SIEMPRE la parte, para
 * poder mostrar "Sin clasificar" como punto de entrada — es justo el caso
 * más común al empezar a clasificar una categoría nueva.
 */

const FUENTE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'catalogoAgentePersonalizacion.js'), 'utf8');

const { partirPorSubcategoria, ordenDeCategorias, compararSubcategorias } = new Function(
  `${FUENTE.replace(/^export /gm, '')}
   return { partirPorSubcategoria, ordenDeCategorias, compararSubcategorias };`
)();

describe('compararSubcategorias: el orden de las secciones, igual en las dos pantallas', () => {
  test('el orden manual manda', () => {
    const lista = [{ nombre: 'PVC 3/4', orden: 1 }, { nombre: 'PVC 1/2', orden: 0 }].sort(compararSubcategorias);
    assert.deepEqual(lista.map((s) => s.nombre), ['PVC 1/2', 'PVC 3/4']);
  });

  test('empatadas, los números van en su lugar ("PVC 2" antes que "PVC 10")', () => {
    const lista = [{ nombre: 'PVC 10', orden: 0 }, { nombre: 'PVC 2', orden: 0 }].sort(compararSubcategorias);
    assert.deepEqual(lista.map((s) => s.nombre), ['PVC 2', 'PVC 10']);
  });

  test('lo que no tiene orden va después de lo que sí', () => {
    const lista = [{ nombre: 'A', orden: null }, { nombre: 'Z', orden: 5 }].sort(compararSubcategorias);
    assert.deepEqual(lista.map((s) => s.nombre), ['Z', 'A']);
  });
});

const pvc = (id, nombre, sub) => ({
  id, name: nombre,
  ...(sub ? { subcategoria: { id: sub.length, nombre: sub } } : {})
});

describe('ordenDeCategorias sigue exportada y con el mismo contrato', () => {
  test('el nombre real de Alegra -> su orden manual', () => {
    const ordenDe = ordenDeCategorias({ categorias: [{ name: 'Ferretería', orden: 3 }] });
    assert.equal(ordenDe('Ferretería'), 3);
  });

  test('sin config, todo empata en el mismo valor', () => {
    const ordenDe = ordenDeCategorias(null);
    assert.equal(ordenDe('Ferretería'), ordenDe('Cocina'));
  });
});

describe('sinClasificarSiempre: el modo que usa Gestión de Catálogo', () => {
  test('sin la bandera (comportamiento del agente): una categoría sin subcategorías no se parte', () => {
    const bloques = partirPorSubcategoria({
      'Medicamentos': [pvc(1, 'ASPIRINA'), pvc(2, 'ACETAMINOFEN')]
    });
    assert.equal(bloques['Medicamentos'], undefined);
  });

  test('con la bandera: la misma categoría sale partida, todo bajo "Sin clasificar"', () => {
    const bloques = partirPorSubcategoria(
      { 'Medicamentos': [pvc(1, 'ASPIRINA'), pvc(2, 'ACETAMINOFEN')] },
      null,
      { sinClasificarSiempre: true }
    );
    assert.equal(bloques['Medicamentos'].length, 1);
    assert.equal(bloques['Medicamentos'][0].nombre, 'Otros');
    assert.equal(bloques['Medicamentos'][0].sinClasificar, true);
    assert.equal(bloques['Medicamentos'][0].productos.length, 2);
  });

  test('con la bandera, una categoría ya clasificada al 100% no muestra un "Sin clasificar" vacío', () => {
    const bloques = partirPorSubcategoria(
      { 'Productos de PVC': [pvc(1, 'CODO 1/2 PVC', 'PVC 1/2')] },
      null,
      { sinClasificarSiempre: true }
    );
    assert.deepEqual(bloques['Productos de PVC'].map((b) => b.nombre), ['PVC 1/2']);
  });

  test('con la bandera y bloques mezclados, "Sin clasificar" sigue yendo al final', () => {
    const bloques = partirPorSubcategoria(
      { 'Productos de PVC': [pvc(1, 'CODO 1/2 PVC', 'PVC 1/2'), pvc(2, 'TUERCA SUELTA')] },
      null,
      { sinClasificarSiempre: true }
    );
    assert.deepEqual(bloques['Productos de PVC'].map((b) => b.nombre), ['PVC 1/2', 'Otros']);
  });

  test('sin la bandera, el comportamiento de siempre no cambió (categoría ya partida)', () => {
    const bloques = partirPorSubcategoria({
      'Productos de PVC': [pvc(1, 'CODO 1/2 PVC', 'PVC 1/2'), pvc(2, 'TUERCA SUELTA')]
    });
    assert.deepEqual(bloques['Productos de PVC'].map((b) => b.nombre), ['PVC 1/2', 'Otros']);
  });
});
