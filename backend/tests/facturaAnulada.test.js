/**
 * Una factura anulada en Alegra deja de ser trabajo pendiente acá.
 *
 * EL CASO QUE LO MOTIVÓ
 * En Reporte Clientes aparecía el gimnasio de Palmares con dos facturas
 * pendientes: la electrónica 00100001010000002454 y la de venta
 * 001000014828. Parecía un duplicado de los que deja la conversión a
 * electrónica, pero no lo era — son dos ventas distintas (distintos
 * productos, distintas cantidades, ₡56.650 contra ₡79.649) y la segunda ya
 * estaba ANULADA en Alegra desde el 2 de setiembre.
 *
 * Lo que fallaba era otra cosa: nadie le contaba a la base que se había
 * anulado. Bodega sí se enteraba —lee de Alegra y filtra las `void`— pero se
 * lo guardaba; Reporte Clientes lee solo de la base local y nunca pregunta.
 * Resultado: una factura muerta pidiendo que le alisten productos, al lado
 * de una viva del mismo cliente.
 *
 * De 29 facturas pendientes en el reporte, esta era la única en ese estado.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const rutaDb = require.resolve('../config/database');
const rutaWarehouse = require.resolve('../src/modules/warehouse/warehouse.service');

const hayBase = Boolean(process.env.DATABASE_URL);

/**
 * Carga warehouse.service con la base sustituida por un doble que solo
 * anota lo que se le pide. No se escribe nada de verdad: la base local ES la
 * de producción.
 */
function conBaseFalsa(filasDevueltas = []) {
  const registro = [];
  const real = require.cache[rutaDb];

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        registro.push({ sql: String(sql), params });
        return { rows: filasDevueltas };
      },
      pool: { connect: async () => { throw new Error('el doble no abre conexiones'); } }
    }
  };

  delete require.cache[rutaWarehouse];
  const servicio = require(rutaWarehouse);
  const restaurar = () => {
    if (real) require.cache[rutaDb] = real; else delete require.cache[rutaDb];
    delete require.cache[rutaWarehouse];
  };
  return { servicio, registro, restaurar };
}

describe('marcar en la base las anuladas de Alegra', () => {
  test('escribe los ids de las facturas anuladas', async () => {
    const { servicio, registro, restaurar } = conBaseFalsa([
      { alegra_id: 5349, numero_factura: '001000014828' }
    ]);
    try {
      const n = await servicio.marcarAnuladasEnLocal([{ id: '5349' }, { id: 5350 }]);
      assert.equal(n, 1, 'devuelve cuántas filas cambió de verdad');
      assert.equal(registro.length, 1, 'una sola consulta, no una por factura');
      assert.deepEqual(registro[0].params, [[5349, 5350]]);
      assert.match(registro[0].sql, /estado_bodega = 'anulada'/);
    } finally { restaurar(); }
  });

  test('no vuelve a escribir sobre las que ya están anuladas', async () => {
    // Esto corre cada vez que se sincroniza bodega. Sin la condición, cada
    // corrida reescribiría las mismas filas para siempre.
    const { servicio, registro, restaurar } = conBaseFalsa([]);
    try {
      await servicio.marcarAnuladasEnLocal([{ id: 5349 }]);
      assert.match(registro[0].sql, /IS DISTINCT FROM 'anulada'/);
    } finally { restaurar(); }
  });

  test('sin facturas anuladas no toca la base', async () => {
    const { servicio, registro, restaurar } = conBaseFalsa([]);
    try {
      assert.equal(await servicio.marcarAnuladasEnLocal([]), 0);
      assert.equal(registro.length, 0);
    } finally { restaurar(); }
  });

  test('un id que no es un número no llega a la consulta', async () => {
    // Alegra manda los ids como texto. Uno vacío o raro convertido a NaN
    // rompería el ANY($1::int[]) y se llevaría la corrida entera por delante.
    const { servicio, registro, restaurar } = conBaseFalsa([]);
    try {
      await servicio.marcarAnuladasEnLocal([{ id: 'abc' }, { id: null }, { id: '5349' }]);
      assert.deepEqual(registro[0].params, [[5349]]);
    } finally { restaurar(); }
  });

  test('si TODOS los ids son inservibles no se manda una consulta vacía', async () => {
    const { servicio, registro, restaurar } = conBaseFalsa([]);
    try {
      assert.equal(await servicio.marcarAnuladasEnLocal([{ id: 'abc' }]), 0);
      assert.equal(registro.length, 0, 'ANY(ARRAY[]) sin tipo es un error de Postgres');
    } finally { restaurar(); }
  });
});

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
