const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

/**
 * El costo derivado de las compras, por `producto.id` (sección 13).
 *
 * Contra PostgreSQL local, en una transacción que se deshace. Lo que se
 * comprueba es lo que cambió el 2026-10-03:
 *  · el mapa se llavea por el id PROPIO;
 *  · la fila del historial NACE con su `producto_id` (antes solo la migración
 *    005 lo rellenaba, y toda compra posterior quedaba fuera del costo);
 *  · con dos compras el mismo día, las "últimas N" son siempre las mismas;
 *  · la LÍNEA del buzón guarda su producto propio (migración 038), y de ahí
 *    salen la validez y la fila: un producto sin ficha en Alegra ya tiene
 *    costo de compras.
 */

const rutaDb = require.resolve('../config/database');
const rutaPrisma = require.resolve('../lib/prisma');
const rutaDerivado = require.resolve('../src/modules/precios/costoDerivado');
const rutaHistorico = require.resolve('../src/modules/precios/costoHistorico');

describe('el costo derivado por producto propio — contra PostgreSQL local', () => {
  let pool, conexion, derivado, historico, lineasPrisma = [];
  let conAlegra, sinAlegra, facturaId;

  // Una línea del buzón. Relacionada lleva su producto propio; pendiente, no.
  const linea = async (n, { productoId = null, alegraItemId = null, estado = 'RELACIONADO', precio = 100 }) => {
    const { rows: [l] } = await conexion.query(`
      INSERT INTO productos_factura_proveedor
        (factura_id, numero_linea, codigo_proveedor, descripcion, cantidad, unidad_medida,
         precio_unitario, total_linea, impuesto, alegra_item_id, producto_id, estado_relacionado)
      VALUES ($1, $2, 'zz', 'zz-línea de costo', 1, 'Unid', $3, $4, $5, $6, $7, $8::estado_relacionado)
      RETURNING id`, [facturaId, n, precio, precio * 1.13, precio * 0.13, alegraItemId, productoId, estado]);
    return l.id;
  };
  const costo = async ({ lineaId, productoId, alegraItemId, fecha, monto }) => conexion.query(`
    INSERT INTO costo_historico (alegra_item_id, producto_id, producto_factura_id, fecha, costo_unitario, origen)
    VALUES ($1, $2, $3, $4, $5, 'factura_proveedor')`, [alegraItemId, productoId, lineaId, fecha, monto]);

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const doble = (ruta, exports) => { require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports }; };
    doble(rutaDb, { query: (sql, params) => conexion.query(sql, params) });
    // El que escribe lee las líneas con Prisma; acá se le entregan a mano.
    doble(rutaPrisma, { productoFactura: { findMany: async ({ where }) => lineasPrisma.filter(l => where.id.in.includes(l.id)) } });
    for (const r of [rutaDerivado, rutaHistorico]) delete require.cache[r];
    derivado = require(rutaDerivado);
    historico = require(rutaHistorico);

    const producto = async (nombre, alegraId) => (await conexion.query(
      `INSERT INTO producto (nombre, alegra_id, precio_sin_iva) VALUES ($1, $2, 1000) RETURNING id`, [nombre, alegraId])).rows[0].id;
    conAlegra = await producto('zz-costo con Alegra', 'zz-900001');
    sinAlegra = await producto('zz-costo sin Alegra', null);

    const { rows: [f] } = await conexion.query(`
      INSERT INTO facturas_proveedores (clave, numero_consecutivo, fecha_emision, proveedor_nombre, proveedor_cedula,
                                        total_productos, total_factura, archivo_xml)
      VALUES ('zz-clave-costo-derivado', 'zz-00000000000000000001', '2031-03-10', 'zz-proveedor', 'zz-3101',
              1, 0, '<zz/>') RETURNING id`);
    facturaId = f.id;
  });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('el mapa se llavea por producto.id, y la mediana no se mueve por una compra rara', async () => {
    const montos = [100, 110, 120, 5000, 130];
    for (let i = 0; i < montos.length; i++) {
      const lineaId = await linea(10 + i, { productoId: conAlegra, alegraItemId: 'zz-900001' });
      await costo({ lineaId, productoId: conAlegra, alegraItemId: 'zz-900001', fecha: `2031-03-0${i + 1}`, monto: montos[i] });
    }
    const mapa = await derivado.obtenerCostosDerivados();
    const c = mapa.get(conAlegra);
    assert.equal(c.costo, 120);                 // mediana de 100, 110, 120, 130, 5000
    assert.equal(c.costoReciente, 130);
    assert.equal(c.entradas, 5);
    // La llave es el NÚMERO del producto propio; el id de Alegra no abre nada.
    assert.equal(mapa.get('zz-900001'), undefined);
    assert.equal(mapa.get(String(conAlegra)), undefined);
    assert.ok([...mapa.keys()].every(k => Number.isInteger(k) && k > 0));
  });

  test('una línea que dejó de estar relacionada ya no cuenta', async () => {
    // Quedó PENDIENTE: `soltarLineas` le quita el producto junto con el estado.
    const lineaId = await linea(30, { estado: 'PENDIENTE' });
    await costo({ lineaId, productoId: conAlegra, alegraItemId: 'zz-900001', fecha: '2031-03-09', monto: 99999 });
    const c = (await derivado.obtenerCostosDerivados()).get(conAlegra);
    assert.equal(c.costoReciente, 130);
    assert.equal(c.entradas, 5);
  });

  test('una línea que se relacionó con OTRO producto deja de contar para el primero', async () => {
    // La fila vieja quedó colgada del producto anterior: no es de él ni del nuevo.
    const lineaId = await linea(31, { productoId: sinAlegra });
    await costo({ lineaId, productoId: conAlegra, alegraItemId: 'zz-900001', fecha: '2031-03-09', monto: 88888 });
    const mapa = await derivado.obtenerCostosDerivados();
    assert.equal(mapa.get(conAlegra).costoReciente, 130);
    assert.equal(mapa.get(sinAlegra), undefined);
  });

  test('con compras el mismo día, las últimas seis son siempre las mismas', async () => {
    // Ocho compras del mismo día para un producto nuevo: la ventana es de 6 y
    // sin desempate Postgres elegía cuáles entraban como le caía.
    const { rows: [p] } = await conexion.query(`INSERT INTO producto (nombre, alegra_id) VALUES ('zz-empate', 'zz-900002') RETURNING id`);
    for (let i = 0; i < 8; i++) {
      const lineaId = await linea(40 + i, { productoId: p.id, alegraItemId: 'zz-900002' });
      await costo({ lineaId, productoId: p.id, alegraItemId: 'zz-900002', fecha: '2031-03-05', monto: 100 + i * 10 });
    }
    const vistos = new Set();
    for (let i = 0; i < 5; i++) vistos.add((await derivado.obtenerCostosDerivados()).get(p.id).costo);
    // Las seis de mayor id: 120…170 → mediana 145.
    assert.deepEqual([...vistos], [145]);
    assert.match(derivado.SQL_COSTO_DERIVADO, /ORDER BY ch\.fecha DESC, ch\.id DESC/);
  });

  test('una compra nueva nace con su producto propio, y cambiar la relación lo corrige', async () => {
    const lineaId = await linea(60, { productoId: conAlegra, alegraItemId: 'zz-900001', precio: 200 });
    const base = {
      id: lineaId, estadoRelacionado: 'RELACIONADO', alegraItemId: 'zz-900001',
      precioUnitario: 200, descuento: 0, cantidad: 1, impuesto: 26, totalLinea: 226,
      factura: { fechaEmision: new Date('2031-03-20T12:00:00'), proveedorNombre: 'zz-proveedor', proveedorCedula: 'zz-3101' },
      mapeo: { factorConversion: 1 }
    };
    lineasPrisma = [base];
    assert.deepEqual(await historico.sincronizarCostoDeLineas([lineaId]), { registradas: 1, eliminadas: 0 });

    const fila = async () => (await conexion.query(
      'SELECT producto_id, alegra_item_id, costo_unitario::float8 AS costo FROM costo_historico WHERE producto_factura_id = $1', [lineaId])).rows[0];
    assert.deepEqual(await fila(), { producto_id: conAlegra, alegra_item_id: 'zz-900001', costo: 226 });

    // La línea se vuelve a relacionar con OTRO producto: la fila se va con él.
    const otro = (await conexion.query(`SELECT id FROM producto WHERE alegra_id = 'zz-900002'`)).rows[0].id;
    await conexion.query(
      `UPDATE productos_factura_proveedor SET producto_id = $2, alegra_item_id = 'zz-900002' WHERE id = $1`, [lineaId, otro]);
    lineasPrisma = [{ ...base, alegraItemId: 'zz-900002' }];
    await historico.sincronizarCostoDeLineas([lineaId]);
    assert.deepEqual(await fila(), { producto_id: otro, alegra_item_id: 'zz-900002', costo: 226 });

    // Y si la línea se suelta (vuelve a PENDIENTE), la fila se va.
    await conexion.query(
      `UPDATE productos_factura_proveedor SET producto_id = NULL, alegra_item_id = NULL, estado_relacionado = 'PENDIENTE' WHERE id = $1`, [lineaId]);
    lineasPrisma = [{ ...base, alegraItemId: null, estadoRelacionado: 'PENDIENTE' }];
    assert.deepEqual(await historico.sincronizarCostoDeLineas([lineaId]), { registradas: 0, eliminadas: 1 });
    assert.equal(await fila(), undefined);
  });

  test('un producto SIN ficha en Alegra ya tiene costo de sus compras', async () => {
    // Era lo que no se podía: la línea no tenía id de Alegra que guardar, así
    // que ni se escribía la fila ni contaba al leer. Ahora las dos cosas salen
    // del producto propio de la línea.
    const lineaId = await linea(70, { productoId: sinAlegra, precio: 300 });
    lineasPrisma = [{
      id: lineaId, estadoRelacionado: 'RELACIONADO', alegraItemId: null,
      precioUnitario: 300, descuento: 0, cantidad: 1, impuesto: 39, totalLinea: 339,
      factura: { fechaEmision: new Date('2031-03-15T12:00:00'), proveedorNombre: 'zz-proveedor', proveedorCedula: 'zz-3101' },
      mapeo: { factorConversion: 1 }
    }];
    assert.deepEqual(await historico.sincronizarCostoDeLineas([lineaId]), { registradas: 1, eliminadas: 0 });

    const { rows: [fila] } = await conexion.query(
      'SELECT producto_id, alegra_item_id, costo_unitario::float8 AS costo FROM costo_historico WHERE producto_factura_id = $1', [lineaId]);
    assert.deepEqual(fila, { producto_id: sinAlegra, alegra_item_id: null, costo: 339 });

    const c = (await derivado.obtenerCostosDerivados()).get(sinAlegra);
    assert.equal(c.costo, 339);
    assert.equal(c.entradas, 1);
    // Y no se cuela en lo que los scripts viejos piden por el id de Alegra.
    assert.ok(![...(await derivado.obtenerCostosDerivadosPorAlegra()).keys()].includes(null));
  });

  test('los scripts viejos piden el mismo costo por el id de Alegra, con otro nombre', async () => {
    const porAlegra = await derivado.obtenerCostosDerivadosPorAlegra();
    assert.equal(porAlegra.get('zz-900001').costo, (await derivado.obtenerCostosDerivados()).get(conAlegra).costo);
    assert.ok([...porAlegra.keys()].every(k => typeof k === 'string'));
  });
});
