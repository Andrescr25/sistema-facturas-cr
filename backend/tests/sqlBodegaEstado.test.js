/**
 * Verifica que las consultas SQL que escriben estado_bodega sean VÁLIDAS
 * para Postgres.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * Se rompió bodega en producción con un 500: al marcar una factura como
 * alistada, Postgres abortaba con
 *
 *   inconsistent types deduced for parameter $1   (SQLSTATE 42P08)
 *
 * La consulta usaba el mismo $1 en dos lugares con tipos incompatibles: en
 * `estado_bodega = $1` Postgres lo deduce varchar (por la columna) y en
 * `CASE WHEN $1 = 'procesado'` lo deduce text. No es un error de datos: la
 * consulta ni siquiera llega a ejecutarse, falla al analizarla.
 *
 * POR QUÉ NO LO ATRAPÓ NINGÚN TEST
 * Todos los tests de este proyecto sustituyen la base por dobles, porque la
 * base local ES la de producción. Un doble acepta cualquier string como SQL
 * — nunca lo analiza — así que un error de sintaxis o de tipos pasa
 * invisible por más tests que haya. Solo Postgres puede decir si su propio
 * SQL es válido.
 *
 * CÓMO SE PRUEBA SIN RIESGO
 * Con PREPARE dentro de una transacción que SIEMPRE hace ROLLBACK. PREPARE
 * analiza y deduce los tipos —que es exactamente donde falla 42P08— pero no
 * ejecuta nada: no lee, no escribe, no toca una sola fila. Es la única forma
 * de verificar SQL de verdad sin arriesgar datos reales.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const hayBase = Boolean(process.env.DATABASE_URL);
let pool;

// La consulta tal cual la emite warehouse.service.js → actualizarEstadoFactura.
const SQL_ESTADO_BODEGA = `
  UPDATE facturas
  SET estado_bodega = $1,
      bodega_procesado_en = CASE WHEN $2::boolean THEN CURRENT_TIMESTAMP ELSE NULL END,
      observaciones_adicionales = CASE
        WHEN $3::text IS NULL THEN observaciones_adicionales
        ELSE $3::text
      END
  WHERE alegra_id = $4
  RETURNING *
`;

// La de duplicados-electronica, que marca la copia anulada.
const SQL_ANULAR = `
  UPDATE facturas SET estado_bodega = 'anulada'
  WHERE alegra_id = $1::integer AND estado_bodega <> 'anulada'
`;

let contador = 0;

/** Analiza el SQL con Postgres sin ejecutarlo. Devuelve null si es válido. */
async function errorAlAnalizar(sql) {
  // Nombre único por llamada: un PREPARE NO se deshace con ROLLBACK (vive en
  // la sesión, no en la transacción) y el pool reusa conexiones, así que un
  // nombre fijo choca con el de la prueba anterior y se confunde con un
  // fallo del SQL que se está verificando.
  const nombre = `verificacion_sql_${process.pid}_${++contador}`;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`PREPARE ${nombre} AS ${sql}`);
    return null;
  } catch (e) {
    return e;
  } finally {
    await c.query(`DEALLOCATE ${nombre}`).catch(() => {});
    await c.query('ROLLBACK').catch(() => {});
    c.release();
  }
}

describe('SQL de estado_bodega — Postgres lo acepta', { skip: hayBase ? false : 'sin DATABASE_URL' }, () => {
  before(() => { ({ pool } = require('../config/database')); });
  after(async () => { await pool?.end().catch(() => {}); });

  test('marcar una factura en bodega es SQL válido', async () => {
    const error = await errorAlAnalizar(SQL_ESTADO_BODEGA);
    assert.equal(error, null, `Postgres rechazó la consulta: ${error?.message} (${error?.code})`);
  });

  test('no reusa un parámetro con dos tipos distintos (el fallo 42P08)', async () => {
    const error = await errorAlAnalizar(SQL_ESTADO_BODEGA);
    assert.notEqual(error?.code, '42P08', 'volvió el bug: un parámetro con tipos incompatibles');
  });

  test('marcar la copia como anulada es SQL válido', async () => {
    const error = await errorAlAnalizar(SQL_ANULAR);
    assert.equal(error, null, `Postgres rechazó la consulta: ${error?.message} (${error?.code})`);
  });

  test('la prueba sirve: una consulta con el bug SÍ es rechazada', async () => {
    // Sin esto, los tests de arriba pasarían igual si `errorAlAnalizar`
    // devolviera null siempre por un descuido.
    const conBug = `
      UPDATE facturas
      SET estado_bodega = $1,
          bodega_procesado_en = CASE WHEN $1 = 'procesado' THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE alegra_id = $2
    `;
    const error = await errorAlAnalizar(conBug);
    assert.equal(error?.code, '42P08', 'la verificación no detecta el bug que motivó este archivo');
  });
});
