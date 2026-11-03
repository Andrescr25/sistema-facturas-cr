/**
 * Gestión de Catálogo: filtro «Rotación baja o nula» (2026-11-03).
 *
 * El usuario, para ordenar el catálogo: «agrégame un filtro en Gestión de
 * Catálogo que diga rotación baja o nula, dentro de donde están los otros
 * filtros: a la venta, ocultos del catálogo…». Son los que están a la venta y
 * en los últimos 30 días vendieron menos de 3 unidades (el corte con que el
 * motor de precios dice «se vende poco»), ninguna incluida.
 *
 * Contra PostgreSQL local, en una transacción que se deshace. Las ventas van
 * en una tabla TEMP que tapa la vista `venta_linea` solo en esta conexión.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

describe('filtro de rotación baja o nula — contra PostgreSQL local', () => {
  let db, productos, motor, p;

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    db = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query("SET TIME ZONE 'America/Costa_Rica'");
    await db.query('BEGIN');
    await db.query(`CREATE TEMP TABLE venta_linea (producto_id integer, fecha date, cantidad numeric,
      importe numeric, factura_id integer, cliente_id integer)`);
    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    for (const r of Object.keys(require.cache)) if (r.includes(`${path.sep}src${path.sep}`)) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'rotbaja') };
    productos = require('../src/modules/productos/productos.service');
    motor = require('../src/modules/precios/motor');

    const nuevo = async (nombre, { oculto = false, activo = true } = {}) => (await db.query(
      `INSERT INTO producto (nombre, referencia, precio_sin_iva, costo_con_iva, activo, oculto)
       VALUES ($1, $1, 1000, 700, $2, $3) RETURNING id`, [nombre, activo, oculto])).rows[0].id;
    p = {
      nada: await nuevo('ZZ ROTBAJA SIN VENTAS'),
      dos: await nuevo('ZZ ROTBAJA DOS UNIDADES'),
      tres: await nuevo('ZZ ROTBAJA TRES UNIDADES'),
      viejas: await nuevo('ZZ ROTBAJA VENTAS VIEJAS'),
      oculto: await nuevo('ZZ ROTBAJA OCULTO', { oculto: true }),
      baja: await nuevo('ZZ ROTBAJA DADO DE BAJA', { activo: false })
    };
    const venta = (producto, diasAtras, cantidad) => db.query(
      `INSERT INTO venta_linea (producto_id, fecha, cantidad, importe, factura_id, cliente_id)
       VALUES ($1, (now() AT TIME ZONE 'America/Costa_Rica')::date - $2::int, $3, $3::numeric * 1000, $1, 1)`,
      [producto, diasAtras, cantidad]);
    await venta(p.dos, 0, 2);
    await venta(p.tres, 0, 1);
    await venta(p.tres, 29, 2);
    await venta(p.viejas, 30, 50);
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  const nombres = async (estado) => (await productos.listarProductos({ buscar: 'ZZ ROTBAJA', estado, limite: 50 })).data.map(x => x.nombre).sort();

  test('a la venta con menos de 3 unidades en 30 días, ninguna incluida; lo de antes de 30 días no cuenta', async () => {
    assert.equal(motor.ROTACION_BAJA, 3);
    assert.deepEqual(await nombres('rotacion_baja'), ['ZZ ROTBAJA DOS UNIDADES', 'ZZ ROTBAJA SIN VENTAS', 'ZZ ROTBAJA VENTAS VIEJAS']);
  });

  test('con 3 unidades (hoy y hace 29 días) ya no es baja; ocultos y dados de baja no entran', async () => {
    const lista = await nombres('rotacion_baja');
    assert.ok(!lista.includes('ZZ ROTBAJA TRES UNIDADES'));
    assert.ok(!lista.includes('ZZ ROTBAJA OCULTO'));
    assert.ok(!lista.includes('ZZ ROTBAJA DADO DE BAJA'));
  });

  test('primero los que no vendieron nada; después los de 1 o 2 unidades', async () => {
    const orden = (await productos.listarProductos({ buscar: 'ZZ ROTBAJA', estado: 'rotacion_baja', limite: 50 })).data.map(x => x.nombre);
    assert.deepEqual(orden, ['ZZ ROTBAJA SIN VENTAS', 'ZZ ROTBAJA VENTAS VIEJAS', 'ZZ ROTBAJA DOS UNIDADES']);
  });

  test('los otros estados siguen igual, y uno que no existe se rechaza', async () => {
    assert.equal((await nombres('activos')).length, 4);
    assert.deepEqual(await nombres('ocultos'), ['ZZ ROTBAJA OCULTO']);
    await assert.rejects(productos.listarProductos({ estado: 'rotacion' }), (e) => e.status === 400 && /rotacion_baja/.test(e.message));
  });
});

describe('la pantalla', () => {
  const leer = (...p) => sinComentarios(fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', ...p), 'utf8'));

  test('si la lista llega al tope, lo dice', () => {
    assert.match(leer('components', 'gestion-catalogo', 'ResultadosBusqueda.jsx'), /\{tope && resultados\.length >= tope && \(/);
    assert.match(leer('pages', 'GestionCatalogo.jsx'), /tope=\{lista\.tope\}/);
  });

  test('«Rotación baja o nula» está en el mismo selector que «A la venta», «Ocultos» y «Dados de baja»', () => {
    const g = sinComentarios(fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'GestionCatalogo.jsx'), 'utf8'));
    assert.match(g, /\{ valor: 'inactivos', texto: 'Dados de baja' \},\s*\{ valor: 'rotacion_baja', texto: 'Rotación baja o nula' \}/);
  });
});
