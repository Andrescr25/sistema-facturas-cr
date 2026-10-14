/**
 * Rotación confirmada tras el caso del producto agotado: unidades vendidas
 * en 30 días, incluido el mes actual. PostgreSQL ejecuta servicios reales
 * sobre tablas TEMP dentro de BEGIN/ROLLBACK, sólo en una copia local.
 */
const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const conBase = process.env.PROBAR_BASE_LOCAL === '1';

describe('rotación de los últimos 30 días — PostgreSQL local', { skip: !conBase }, () => {
  let db; let sqlRotacion; let HOY_CR; let categoriaId;
  const congelar = (sql, hoy = '2026-10-14') => sql.replaceAll(HOY_CR, `DATE '${hoy}'`);
  const consultar = async (reciente = true, hoy, meses = 3) => (await db.query(congelar(
    sqlRotacion(meses, { ultimos30Dias: reciente }), hoy))).rows;
  const insertar = async (filas) => {
    for (const [producto, fecha, cantidad] of filas) {
      await db.query(`INSERT INTO venta_linea (producto_id, fecha, cantidad, importe, factura_id, cliente_id)
        VALUES ($1, $2, $3, $3::numeric * 100, nextval('rotacion_factura_test'), $1)`, [producto, fecha, cantidad]);
    }
  };

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    const { Client } = require('pg');
    db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query('BEGIN');
    await db.query(`CREATE TEMP TABLE producto AS
        SELECT * FROM public.producto WHERE activo AND NOT oculto ORDER BY id LIMIT 3;
      UPDATE producto p SET id = x.id FROM
        (SELECT ctid, row_number() OVER (ORDER BY id)::int AS id FROM producto) x WHERE p.ctid = x.ctid;
      UPDATE producto SET nombre = 'ZZ Rotación mensual ' || id, referencia = 'ZZ-rotacion-' || id,
        categoria_id = (SELECT id FROM categoria_producto WHERE activo ORDER BY id LIMIT 1),
        subcategoria_id = NULL, alegra_id = NULL;
      UPDATE producto SET alegra_id = '9999002' WHERE id = 2;
      CREATE TEMP SEQUENCE rotacion_factura_test;
      CREATE TEMP TABLE venta_linea (producto_id integer, fecha date, cantidad numeric,
        importe numeric, factura_id integer, cliente_id integer);`);
    categoriaId = (await db.query('SELECT categoria_id FROM producto LIMIT 1')).rows[0].categoria_id;
    const rutaDb = require.resolve('../config/database');
    const rutaRotacion = require.resolve('../src/modules/ventas/rotacion');
    const query = (sql, params) => db.query(congelar(sql), params);
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { query, pool: { query } } };
    delete require.cache[rutaRotacion];
    ({ sqlRotacion, HOY_CR } = require(rutaRotacion));
  });

  beforeEach(async () => { await db.query('TRUNCATE venta_linea'); });
  after(async () => {
    await db?.query('ROLLBACK').catch(() => {});
    await db?.end();
  });

  test('el caso real: 43 recientes de septiembre y 31 de octubre dan 74, no 49/3', async () => {
    await insertar([[1, '2026-07-20', 6], [1, '2026-09-25', 43], [1, '2026-10-13', 31]]);
    const [r] = await consultar();
    assert.equal(Number(r.unidades_mes), 74);
    assert.equal(Number(r.unidades), 80, 'los totales vigentes siguen siendo independientes');
  });

  test('incluye hoy y los 29 días anteriores, sin añadir el día 31 ni ventas futuras', async () => {
    await insertar([[1, '2026-09-14', 999], [1, '2026-09-15', 4],
      [1, '2026-10-14', 70], [1, '2026-10-15', 999]]);
    assert.equal(Number((await consultar())[0].unidades_mes), 74);
  });

  test('70 unidades sólo en el mes actual muestran 70', async () => {
    await insertar([[2, '2026-10-05', 70]]);
    const [r] = await consultar();
    assert.equal(Number(r.unidades_mes), 70);
    assert.equal(Number(r.unidades), 70);
    assert.equal(r.clase, 'A');
  });

  test('sin ventas recientes la rotación es cero, aunque haya ventas anteriores', async () => {
    await insertar([[3, '2026-07-20', 30], [3, '2026-09-14', 20]]);
    const [r] = await consultar();
    assert.equal(Number(r.unidades_mes), 0);
    assert.equal(Number(r.unidades), 50);
  });

  test('el movimiento sale de la ventana al cumplir más de treinta días', async () => {
    await insertar([[1, '2026-09-25', 43], [1, '2026-10-13', 31]]);
    assert.equal(Number((await consultar(true, '2026-10-24'))[0].unidades_mes), 74);
    assert.equal(Number((await consultar(true, '2026-10-25'))[0].unidades_mes), 31);
  });

  test('no se reinicia al cambiar de mes', async () => {
    await insertar([[1, '2026-10-13', 70], [1, '2026-11-01', 4]]);
    assert.equal(Number((await consultar(true, '2026-10-31'))[0].unidades_mes), 70);
    assert.equal(Number((await consultar(true, '2026-11-01'))[0].unidades_mes), 74);
  });

  test('cruza el año con exactamente treinta días', async () => {
    await insertar([[1, '2025-12-02', 999], [1, '2025-12-03', 30], [1, '2026-01-01', 40]]);
    assert.equal(Number((await consultar(true, '2026-01-01'))[0].unidades_mes), 70);
  });

  test('febrero bisiesto empieza el día uno y el no bisiesto el 31 de enero', async () => {
    await insertar([[1, '2024-01-31', 999], [1, '2024-02-01', 12], [1, '2024-02-29', 18], [1, '2024-03-01', 40]]);
    assert.equal(Number((await consultar(true, '2024-03-01'))[0].unidades_mes), 70);
    await db.query('TRUNCATE venta_linea');
    await insertar([[1, '2025-01-30', 999], [1, '2025-01-31', 12], [1, '2025-02-28', 18], [1, '2025-03-01', 40]]);
    assert.equal(Number((await consultar(true, '2025-03-01'))[0].unidades_mes), 70);
  });

  test('incluso una ventana mensual corta de febrero conserva los treinta días recientes', async () => {
    await insertar([[1, '2025-01-31', 70]]);
    const [r] = await consultar(true, '2025-03-01', 1);
    assert.equal(Number(r.unidades_mes), 70);
    assert.equal(Number(r.unidades), 0);
    assert.equal(r.clase, 'C');
  });

  test('conserva cantidades fraccionarias', async () => {
    await insertar([[1, '2026-10-01', 0.33]]);
    assert.equal(Number((await consultar())[0].unidades_mes), 0.33);
  });

  test('ventas, semanas, facturas, clientes, última venta y Pareto conservan la ventana vigente', async () => {
    await insertar([[1, '2026-07-01', 3000], [1, '2026-08-01', 12], [1, '2026-10-01', 30],
      [2, '2026-09-01', 10], [3, '2026-10-05', 2]]);
    const normales = await consultar(false);
    const recientes = await consultar();
    for (const anterior of normales) {
      const actual = recientes.find(r => r.producto_id === anterior.producto_id);
      for (const campo of ['unidades', 'ventas', 'unidades_semana', 'facturas', 'clientes_distintos', 'ultima_venta', 'clase']) {
        assert.equal(actual[campo], anterior[campo], campo);
      }
    }
  });

  test('Precios conserva su media de doce meses y la lectura móvil sigue disponible', async () => {
    await insertar([[1, '2026-09-01', 36], [1, '2026-10-01', 120]]);
    assert.equal(Number((await consultar(false))[0].unidades_mes), 52);
    const precios = await db.query(congelar(sqlRotacion(12)));
    assert.equal(Number(precios.rows[0].unidades_mes), 13);
  });

  test('Rentabilidad, categoría y búsqueda muestran 74, decimales y cero sin ventas', async () => {
    await insertar([[1, '2026-07-20', 6], [1, '2026-09-25', 43], [1, '2026-10-13', 31], [2, '2026-10-01', 0.33]]);
    const catalogo = require('../src/modules/productos/taxonomia.service');
    const rentabilidad = require('../src/modules/rentabilidad/rentabilidad.service');
    const categoria = await catalogo.productosDeCategoria(categoriaId);
    const buscados = await catalogo.buscar({ buscar: 'ZZ Rotación mensual' });
    const rentables = (await rentabilidad.listarProductos()).data;
    for (const [id, rotacion] of [[1, 74], [2, 0.33], [3, 0]]) {
      assert.equal(categoria.find(p => p.id === id).unidades_mes, rotacion, 'categoría');
      assert.equal(buscados.find(p => p.id === id).unidades_mes, rotacion, 'búsqueda');
      assert.equal(rentables.find(p => p.productoId === id).unidadesMes, rotacion, 'Rentabilidad');
    }
  });

  test('la fecha de Costa Rica es independiente de la zona de la conexión', async () => {
    const fechaCR = (await db.query(`SELECT ${HOY_CR}::text AS hoy`)).rows[0].hoy;
    await db.query(`SET LOCAL TIME ZONE 'Pacific/Kiritimati'`);
    assert.equal((await db.query(`SELECT ${HOY_CR}::text AS hoy`)).rows[0].hoy, fechaCR);
  });
});
