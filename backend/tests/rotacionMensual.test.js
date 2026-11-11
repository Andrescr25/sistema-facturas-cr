/**
 * La rotación de la pantalla (2026-11-11): promedio por mes de los últimos 3
 * meses, o de lo que lleva el producto si es nuevo. El usuario: «que la medida
 * de la rotación no sea por mes sino los últimos 3 meses, y si el producto es
 * nuevo y tiene apenas mes y medio, que saque la estadística con eso».
 *
 * Reemplaza a «los últimos 30 días» (2026-10-14). PostgreSQL ejecuta los
 * servicios reales sobre tablas TEMP dentro de BEGIN/ROLLBACK, solo en una
 * copia local. Hoy congelado: 11/11/2026, la ventana va del 12/08 (92 días).
 */
const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const conBase = process.env.PROBAR_BASE_LOCAL === '1';
const HOY = '2026-11-11';

describe('rotación: 3 meses, o lo que lleva si es nuevo — PostgreSQL local', { skip: !conBase }, () => {
  let db; let rotacion; let categoriaId;
  const congelar = (sql, hoy = HOY) => sql.replaceAll(rotacion.HOY_CR, `DATE '${hoy}'`);
  const consultar = async (sql = rotacion.SQL_ROTACION, hoy) => (await db.query(congelar(sql, hoy))).rows;
  const de = (filas, id) => filas.find(r => r.producto_id === id);
  const vender = async (filas) => {
    for (const [producto, fecha, cantidad] of filas) {
      await db.query(`INSERT INTO venta_linea (producto_id, fecha, cantidad, importe, factura_id, cliente_id)
        VALUES ($1, $2, $3, $3::numeric * 100, nextval('rotacion_factura_test'), $1)`, [producto, fecha, cantidad]);
    }
  };
  const comprar = async (producto, fecha, estado = 'registrada') => {
    const { rows: [c] } = await db.query('INSERT INTO compra (estado, fecha_emision) VALUES ($1, $2) RETURNING id', [estado, fecha]);
    await db.query('INSERT INTO compra_linea (compra_id, producto_id) VALUES ($1, $2)', [c.id, producto]);
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
      CREATE TEMP SEQUENCE rotacion_factura_test;
      CREATE TEMP TABLE venta_linea (producto_id integer, fecha date, cantidad numeric,
        importe numeric, factura_id integer, cliente_id integer);
      CREATE TEMP TABLE compra (id serial, estado text, fecha_emision date);
      CREATE TEMP TABLE compra_linea (compra_id integer, producto_id integer);`);
    categoriaId = (await db.query('SELECT categoria_id FROM producto LIMIT 1')).rows[0].categoria_id;
    const rutaDb = require.resolve('../config/database');
    const query = (sql, params) => db.query(congelar(sql), params);
    for (const r of Object.keys(require.cache)) if (r.includes('/src/')) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { query, pool: { query } } };
    rotacion = require('../src/modules/ventas/rotacion');
  });

  beforeEach(async () => { await db.query('TRUNCATE venta_linea, compra, compra_linea'); });
  after(async () => {
    await db?.query('ROLLBACK').catch(() => {});
    await db?.end();
  });

  test('un producto de antes de la ventana: lo vendido en 3 meses, entre 3', async () => {
    await vender([[1, '2026-07-01', 999], [1, '2026-09-01', 40], [1, '2026-11-11', 20]]);
    const r = de(await consultar(), 1);
    assert.deepEqual([Number(r.unidades), Number(r.unidades_mes), Number(r.dias_rotacion), r.rotacion_nueva], [60, 20, 92, false]);
  });

  test('el caso del usuario: mes y medio de vida se promedia sobre esos 45 días', async () => {
    await vender([[2, '2026-09-28', 40], [2, '2026-10-20', 30], [2, '2026-11-10', 20]]);
    const r = de(await consultar(), 2);
    assert.deepEqual([Number(r.unidades), Number(r.dias_rotacion), r.rotacion_nueva], [90, 45, true]);
    assert.equal(Number(r.unidades_mes), 61.33, '90 en 45 días, no 90 entre 3 = 30');
  });

  test('con menos de 30 días se promedia como un mes: dos días no dicen cuánto se vende', async () => {
    await vender([[3, '2026-11-02', 30]]);
    const r = de(await consultar(), 3);
    assert.deepEqual([Number(r.dias_rotacion), Number(r.unidades_mes)], [30, 30.67]);
  });

  test('empezó con su primera COMPRA si fue antes que su primera venta; una compra no registrada no cuenta', async () => {
    await comprar(1, '2026-08-23');
    await comprar(1, '2026-06-01', 'anulada');
    await vender([[1, '2026-10-22', 27]]);
    const r = de(await consultar(), 1);
    assert.deepEqual([Number(r.dias_rotacion), Number(r.unidades_mes)], [81, 10.22]);
  });

  test('una venta vieja, fuera de la ventana, dice que no es nuevo aunque no sume', async () => {
    await vender([[2, '2025-01-15', 5], [2, '2026-11-01', 9]]);
    const r = de(await consultar(), 2);
    assert.deepEqual([Number(r.unidades), Number(r.unidades_mes), r.rotacion_nueva], [9, 3, false]);
  });

  test('el Pareto acumula el promedio: el nuevo que vende rápido sube aunque lleve menos unidades', async () => {
    await vender([[1, '2026-07-01', 1], [1, '2026-10-01', 100], [2, '2026-07-01', 1], [2, '2026-10-01', 60],
      [3, '2026-10-28', 30]]);
    const filas = await consultar();
    assert.deepEqual(filas.map(r => [r.producto_id, Number(r.unidades_mes)]).sort((a, b) => a[0] - b[0]),
      [[1, 33.33], [2, 20], [3, 30.67]]);
    assert.equal(de(filas, 3).clase, 'A', 'por unidades crudas (30 de 190) habría sido B');
  });

  test('Precios conserva sus 12 meses sin promediar por vida', async () => {
    await vender([[3, '2026-10-28', 30]]);
    const r = de(await consultar(rotacion.SQL_ROTACION_PRECIOS), 3);
    assert.deepEqual([Number(r.unidades_mes), r.rotacion_nueva], [2.5, false]);
  });

  test('conserva cantidades fraccionarias', async () => {
    await vender([[1, '2026-01-01', 1], [1, '2026-10-01', 0.99]]);
    assert.equal(Number(de(await consultar(), 1).unidades_mes), 0.33);
  });

  test('Gestión de Catálogo (categoría y búsqueda) y Rentabilidad dicen lo mismo, y de dónde sale', async () => {
    await vender([[1, '2026-07-01', 1], [1, '2026-09-01', 60], [2, '2026-09-28', 90]]);
    const catalogo = require('../src/modules/productos/taxonomia.service');
    const rentabilidad = require('../src/modules/rentabilidad/rentabilidad.service');
    const categoria = await catalogo.productosDeCategoria(categoriaId);
    const buscados = await catalogo.buscar({ buscar: 'ZZ Rotación mensual' });
    const rentables = (await rentabilidad.listarProductos()).data;
    for (const [id, mes, dias] of [[1, 20, null], [2, 61.33, 45], [3, 0, null]]) {
      for (const [lista, nombre] of [[categoria, 'categoría'], [buscados, 'búsqueda']]) {
        const p = lista.find(x => x.id === id);
        assert.deepEqual([p.unidades_mes, p.dias_rotacion], [mes, dias], nombre);
      }
      const r = rentables.find(p => p.productoId === id);
      assert.deepEqual([r.unidadesMes, r.diasRotacion], [mes, dias], 'Rentabilidad');
    }
  });

  test('la fecha de Costa Rica es independiente de la zona de la conexión', async () => {
    const fechaCR = (await db.query(`SELECT ${rotacion.HOY_CR}::text AS hoy`)).rows[0].hoy;
    await db.query(`SET LOCAL TIME ZONE 'Pacific/Kiritimati'`);
    assert.equal((await db.query(`SELECT ${rotacion.HOY_CR}::text AS hoy`)).rows[0].hoy, fechaCR);
  });
});
