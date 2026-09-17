const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * El mapeo proveedor↔producto colgado de NUESTROS ids.
 *
 * `supplier_product_mapping` se llaveaba por `alegra_item_id` y
 * `supplier_cedula`: un id de un sistema ajeno y un texto que llega escrito de
 * varias formas. La migración 018 agregó `producto_id` y `proveedor_id` y
 * rellenó los 2.060 que había; esto es lo que evita que los NUEVOS nazcan
 * vacíos y la migración se pudra al día siguiente.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'productos-revision', 'idsPropiosDelMapeo.js');

function montar({ falla = false } = {}) {
  for (const r of [rutaDb, rutaServicio]) delete require.cache[r];

  const visto = { sql: null, params: null, llamadas: 0 };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        visto.llamadas++;
        visto.sql = sql;
        visto.params = params;
        if (falla) throw new Error('la base dijo que no');
        return { rows: [] };
      }
    }
  };
  return { servicio: require(rutaServicio), visto };
}

describe('colgar el mapeo de nuestros ids', () => {
  test('liga el producto por el id de Alegra y el proveedor por la cédula', async () => {
    const { servicio, visto } = montar();
    await servicio.ligarIdsPropios('abc-123');

    assert.match(visto.sql, /p\.alegra_id = base\.alegra_item_id/);
    assert.match(visto.sql, /pr\.identificacion = base\.supplier_cedula/);
    assert.deepEqual(visto.params, ['abc-123']);
  });

  test('no pisa lo que ya estaba ligado', async () => {
    // Con COALESCE, repetirlo sobre una fila ya resuelta es inocuo.
    const { servicio, visto } = montar();
    await servicio.ligarIdsPropios('abc-123');

    assert.match(visto.sql, /COALESCE\(m\.producto_id/);
    assert.match(visto.sql, /COALESCE\(m\.proveedor_id/);
  });

  test('sin id no consulta nada', async () => {
    const { servicio, visto } = montar();
    await servicio.ligarIdsPropios(null);
    await servicio.ligarIdsPropios('');

    assert.equal(visto.llamadas, 0);
  });

  test('si falla NO se pierde la relación que la persona confirmó', async () => {
    // Un producto que todavía no está en el maestro no puede impedir guardar
    // el mapeo: queda en NULL y se rellena cuando el producto exista.
    const { servicio } = montar({ falla: true });
    await servicio.ligarIdsPropios('abc-123');   // no debe lanzar
  });

  test('toca UNA sola fila, la del mapeo que se acaba de guardar', async () => {
    const { servicio, visto } = montar();
    await servicio.ligarIdsPropios('abc-123');

    assert.match(visto.sql, /WHERE m\.id = base\.id AND m\.id = \$1/);
  });
});
