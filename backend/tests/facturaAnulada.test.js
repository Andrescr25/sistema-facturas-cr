/**
 * Una factura anulada deja de ser trabajo pendiente.
 *
 * EL CASO QUE LO MOTIVÓ
 * En Reporte Clientes aparecía el gimnasio de Palmares con dos facturas
 * pendientes: la electrónica 00100001010000002454 y la de venta
 * 001000014828. Parecía un duplicado de los que deja la conversión a
 * electrónica, pero no lo era — son dos ventas distintas (distintos
 * productos, distintas cantidades, ₡56.650 contra ₡79.649) y la segunda ya
 * estaba ANULADA en Alegra desde el 2 de setiembre: nadie le contaba a la
 * base local que se había anulado.
 *
 * En esta rama la factura es PROPIA y "anulada" es su `estado`: el reporte
 * la deja fuera por ahí (migración independencia/032). La sincronización que
 * marcaba en la tabla vieja las anuladas de Alegra se retiró con la Bodega
 * vieja (2026-09-30).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const hayBase = Boolean(process.env.DATABASE_URL);

describe('el reporte de faltantes deja fuera las anuladas', { skip: hayBase ? false : 'sin DATABASE_URL' }, () => {
  let pool;
  before(() => { ({ pool } = require('../config/database')); });
  after(async () => { await pool?.end().catch(() => {}); });

  test('ninguna factura anulada trae faltantes al reporte', async () => {
    // Solo lectura contra la base real: se comprueba la condición nueva tal
    // como la ve Postgres, sin escribir ni una fila.
    // Desde la migración independencia/032 el faltante cuelga de la factura
    // PROPIA, y "anulada" es su `estado` (no el estado de bodega de la tabla vieja).
    const r = await pool.query(`
      SELECT COUNT(*)::int AS n
      FROM faltantes f
      JOIN factura fa ON fa.id = f.factura_propia_id
      WHERE f.estado IN ('pendiente', 'procesado')
        AND f.tipo_faltante != 'completo'
        AND (f.cantidad_faltante::numeric > 0)
        AND fa.estado <> 'anulada'
        AND fa.estado = 'anulada';
    `);
    assert.equal(r.rows[0].n, 0, 'la condición no está filtrando lo que dice filtrar');
  });

  test('`estado <> \'anulada\'` no pierde facturas: la columna no admite NULL', async () => {
    // Con la tabla vieja la condición tenía que ser IS DISTINCT FROM:
    // `estado_bodega` podía ser NULL, `NULL <> 'anulada'` es NULL y una
    // condición NULL descarta la fila — una factura sin estado desaparecía del
    // reporte sin que nadie la anulara. `factura.estado` es NOT NULL (borrador,
    // emitida o anulada), así que `<>` alcanza. Si algún día admite NULL, esta
    // prueba avisa antes de que se pierdan faltantes.
    const r = await pool.query(`
      SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'factura' AND column_name = 'estado'
    `);
    assert.equal(r.rows[0]?.is_nullable, 'NO');
  });
});
