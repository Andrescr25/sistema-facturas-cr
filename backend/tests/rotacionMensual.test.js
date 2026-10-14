/**
 * Promedio mensual solicitado para Rentabilidad: meses completos, incluido
 * un mes sin ventas. PostgreSQL ejecuta el SQL sobre tablas TEMP dentro de
 * BEGIN/ROLLBACK; no modifica facturas ni productos de la copia local.
 */
const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const conBase = process.env.PROBAR_BASE_LOCAL === '1';

describe('rotación mensual de meses completos — PostgreSQL local', { skip: !conBase }, () => {
  let db; let sqlRotacion; let HOY_CR; let categoriaId;
  const congelar = (sql, hoy = '2026-10-14') => sql.replaceAll(HOY_CR, `DATE '${hoy}'`);
  const consultar = async (completos = true, hoy) => (await db.query(congelar(
    sqlRotacion(3, { promedioMesesCompletos: completos }), hoy))).rows;
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
      UPDATE producto SET nombre = 'ZZ Media mensual ' || id, referencia = 'ZZ-media-' || id,
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

  test('30 + 0 + 60 son 30 u/mes; las 900 de octubre no entran en la media', async () => {
    await insertar([[1, '2026-07-01', 30], [1, '2026-09-20', 60], [1, '2026-10-10', 900]]);
    const [r] = await consultar();
    assert.equal(Number(r.unidades_mes), 30);
    assert.equal(Number(r.unidades), 960, 'el acumulado vigente sigue siendo independiente');
  });

  test('se incluye el primer día y último día del período, sin el mes actual ni el anterior a la ventana', async () => {
    await insertar([[1, '2026-06-30', 999], [1, '2026-07-01', 30], [1, '2026-09-30', 60],
      [1, '2026-10-01', 999], [1, '2026-10-15', 999]]);
    assert.equal(Number((await consultar())[0].unidades_mes), 30);
  });

  test('un producto vendido sólo en el mes actual tiene media cero', async () => {
    await insertar([[2, '2026-10-05', 120]]);
    const [r] = await consultar();
    assert.equal(Number(r.unidades_mes), 0);
    assert.equal(Number(r.unidades), 120);
    assert.equal(r.clase, 'A', 'la clase vigente no depende del promedio de meses cerrados');
  });

  test('conserva un producto que sólo vendió al comienzo del primer mes completo', async () => {
    await insertar([[3, '2026-07-01', 30]]);
    const [r] = await consultar();
    assert.equal(r.producto_id, 3);
    assert.equal(Number(r.unidades_mes), 10);
    assert.equal(Number(r.unidades), 0);
    assert.equal(r.clase, 'C');
  });

  test('el promedio no se reinicia entre el primer día y el final del mismo mes', async () => {
    await insertar([[1, '2026-07-01', 30], [1, '2026-09-20', 60], [1, '2026-10-20', 999]]);
    for (const hoy of ['2026-10-01', '2026-10-14', '2026-10-31']) {
      assert.equal(Number((await consultar(true, hoy))[0].unidades_mes), 30);
    }
  });

  test('noviembre incorpora octubre cerrado y retira julio', async () => {
    await insertar([[1, '2026-07-01', 30], [1, '2026-09-20', 60], [1, '2026-10-20', 90]]);
    assert.equal(Number((await consultar(true, '2026-11-01'))[0].unidades_mes), 50);
  });

  test('cruza el año y considera febrero bisiesto completo', async () => {
    await insertar([[1, '2023-12-01', 12], [1, '2024-01-31', 18], [1, '2024-02-29', 30], [1, '2024-03-01', 999]]);
    assert.equal(Number((await consultar(true, '2024-03-01'))[0].unidades_mes), 20);
  });

  test('no redondea 1/3 a cero y conserva los productos sin ventas fuera del resultado', async () => {
    await insertar([[1, '2026-09-01', 1]]);
    const filas = await consultar();
    assert.equal(filas.length, 1);
    assert.equal(Number(filas[0].unidades_mes), 0.33);
  });

  test('ventas, semanas, facturas, clientes, última venta y Pareto conservan la ventana vigente', async () => {
    await insertar([[1, '2026-07-01', 3000], [1, '2026-08-01', 12], [1, '2026-10-01', 30],
      [2, '2026-09-01', 10], [3, '2026-10-05', 2]]);
    const normales = await consultar(false);
    const completas = await consultar();
    for (const anterior of normales) {
      const actual = completas.find(r => r.producto_id === anterior.producto_id);
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

  test('Rentabilidad, categoría y búsqueda de Gestión muestran la misma media, incluidos decimales y cero', async () => {
    await insertar([[1, '2026-07-01', 30], [1, '2026-09-20', 60], [1, '2026-10-10', 900], [2, '2026-09-01', 1]]);
    const catalogo = require('../src/modules/productos/taxonomia.service');
    const rentabilidad = require('../src/modules/rentabilidad/rentabilidad.service');
    const categoria = await catalogo.productosDeCategoria(categoriaId);
    const buscados = await catalogo.buscar({ buscar: 'ZZ Media mensual' });
    const rentables = (await rentabilidad.listarProductos()).data;
    for (const [id, media] of [[1, 30], [2, 0.33], [3, 0]]) {
      assert.equal(categoria.find(p => p.id === id).unidades_mes, media, 'categoría');
      assert.equal(buscados.find(p => p.id === id).unidades_mes, media, 'búsqueda');
      assert.equal(rentables.find(p => p.productoId === id).unidadesMes, media, 'Rentabilidad');
    }
  });

  test('la fecha de Costa Rica es independiente de la zona de la conexión', async () => {
    const fechaCR = (await db.query(`SELECT ${HOY_CR}::text AS hoy`)).rows[0].hoy;
    await db.query(`SET LOCAL TIME ZONE 'Pacific/Kiritimati'`);
    assert.equal((await db.query(`SELECT ${HOY_CR}::text AS hoy`)).rows[0].hoy, fechaCR);
  });
});
