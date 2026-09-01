/**
 * Una nota de crédito eliminada no debe volver.
 *
 * EL BUG
 * Eliminar una nota la borraba de verdad. Pero el monitoreo de correo relee
 * los últimos 30 días en cada corrida y guardarNotaCredito inserta con
 * ON CONFLICT (clave) DO NOTHING: sin la fila no hay conflicto que frene
 * nada, así que la nota volvía sola.
 *
 * Y no volvía sola a la lista. Al reingresar entraba como pendiente y
 * aplicarNotasCreditoPendientes le RESTABA el monto al saldo de la factura
 * otra vez. Borrar una nota equivocada terminaba, minutos después, con la
 * nota de vuelta y el saldo rebajado de nuevo — deshaciendo en silencio la
 * decisión de quien la borró.
 *
 * QUÉ SE FIJA ACÁ
 * Que las consultas que leen notas excluyan las eliminadas. Es una prueba de
 * texto sobre el SQL, no de base de datos: el ciclo completo se comprobó
 * contra Postgres en una transacción revertida, pero eso no puede correr en
 * cada `npm test` sobre una base que es la de producción. Lo que sí se puede
 * vigilar siempre es que a nadie se le olvide el filtro al escribir una
 * consulta nueva.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RUTA = path.join(__dirname, '..', 'services', 'notasCreditoService.js');
const FUENTE = fs.readFileSync(RUTA, 'utf8');

/** Los bloques SQL del archivo, uno por cada llamada a query(`...`). */
const CONSULTAS = [...FUENTE.matchAll(/query\(\s*`([^`]+)`/g)].map(m => m[1]);

const LEEN_NOTAS = CONSULTAS.filter(sql =>
  /FROM\s+nota_credito_proveedor|JOIN\s+nota_credito_proveedor/i.test(sql)
);

describe('notas de crédito eliminadas', () => {
  test('hay consultas que leen la tabla', () => {
    assert.ok(LEEN_NOTAS.length >= 4, `solo ${LEEN_NOTAS.length} consultas leen notas; ¿se movió el archivo?`);
  });

  test('toda consulta que LISTA notas excluye las eliminadas', () => {
    // Las que buscan una nota puntual por id no necesitan el filtro: quien la
    // pide ya sabe cuál es, y eliminarNotaCredito justamente necesita leerla.
    const listados = LEEN_NOTAS.filter(sql => !/WHERE\s+id\s*=\s*\$1/i.test(sql));
    const sinFiltro = listados.filter(sql => !/eliminada_en\s+IS\s+NULL/i.test(sql));

    assert.deepEqual(sinFiltro.map(s => s.trim().split('\n')[0].trim()), [],
      'Estas consultas devolverían notas ya eliminadas, y el correo las revive:\n' +
      sinFiltro.map(s => '  ' + s.trim().slice(0, 90)).join('\n'));
  });

  test('eliminar marca la fila en vez de borrarla', () => {
    assert.match(FUENTE, /SET eliminada_en = CURRENT_TIMESTAMP/,
      'eliminarNotaCredito debe marcar la nota');
    assert.doesNotMatch(FUENTE, /DELETE FROM nota_credito_proveedor/,
      'un DELETE real deja la clave libre y el correo vuelve a insertar la nota');
  });

  test('no se puede eliminar dos veces', () => {
    // Sería devolverle el saldo a la factura dos veces, inventando deuda.
    assert.match(FUENTE, /if \(nota\.rows\[0\]\.eliminada_en\)/,
      'falta el guard contra eliminar una nota ya eliminada');
  });

  test('al eliminar se borran sus aplicaciones', () => {
    // Ya se revirtieron sobre el saldo; dejarlas haría que la nota siguiera
    // figurando como aplicada en cada cuenta.
    assert.match(FUENTE, /DELETE FROM nota_credito_aplicacion WHERE nota_credito_id/,
      'las aplicaciones deben borrarse al eliminar la nota');
  });

  test('la prueba sirve: detectaría una consulta sin el filtro', () => {
    const falsa = 'SELECT * FROM nota_credito_proveedor nc WHERE nc.aplicada = FALSE';
    assert.ok(!/eliminada_en\s+IS\s+NULL/i.test(falsa), 'el patrón no detecta la falta del filtro');
  });
});
