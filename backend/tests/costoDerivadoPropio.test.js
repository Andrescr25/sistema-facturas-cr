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
 *  · con dos compras el mismo día, las "últimas N" son siempre las mismas.
 */

const rutaDb = require.resolve('../config/database');
const rutaPrisma = require.resolve('../lib/prisma');
const rutaDerivado = require.resolve('../src/modules/precios/costoDerivado');
const rutaHistorico = require.resolve('../src/modules/precios/costoHistorico');

describe('el costo derivado por producto propio — contra PostgreSQL local', () => {
  let pool, conexion, derivado, historico, lineasPrisma = [];
  let conAlegra, sinAlegra, facturaId;

  const linea = async (n, { alegraItemId, estado = 'RELACIONADO', precio = 100 }) => {
    const { rows: [l] } = await conexion.query(`
      INSERT INTO productos_factura_proveedor
        (factura_id, numero_linea, codigo_proveedor, descripcion, cantidad, unidad_medida,
         precio_unitario, total_linea, impuesto, alegra_item_id, estado_relacionado)
      VALUES ($1, $2, 'zz', 'zz-línea de costo', 1, 'Unid', $3, $4, $5, $6, $7::estado_relacionado)
      RETURNING id`, [facturaId, n, precio, precio * 1.13, precio * 0.13, alegraItemId, estado]);
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
      const lineaId = await linea(10 + i, { alegraItemId: 'zz-900001' });
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
    const lineaId = await linea(30, { alegraItemId: 'zz-900001', estado: 'PENDIENTE' });
    await costo({ lineaId, productoId: conAlegra, alegraItemId: 'zz-900001', fecha: '2031-03-09', monto: 99999 });
    const c = (await derivado.obtenerCostosDerivados()).get(conAlegra);
    assert.equal(c.costoReciente, 130);
    assert.equal(c.entradas, 5);
  });

  test('con compras el mismo día, las últimas seis son siempre las mismas', async () => {
    // Ocho compras del mismo día para un producto nuevo: la ventana es de 6 y
    // sin desempate Postgres elegía cuáles entraban como le caía.
    const { rows: [p] } = await conexion.query(`INSERT INTO producto (nombre, alegra_id) VALUES ('zz-empate', 'zz-900002') RETURNING id`);
    for (let i = 0; i < 8; i++) {
      const lineaId = await linea(40 + i, { alegraItemId: 'zz-900002' });
      await costo({ lineaId, productoId: p.id, alegraItemId: 'zz-900002', fecha: '2031-03-05', monto: 100 + i * 10 });
    }
    const vistos = new Set();
    for (let i = 0; i < 5; i++) vistos.add((await derivado.obtenerCostosDerivados()).get(p.id).costo);
    // Las seis de mayor id: 120…170 → mediana 145.
    assert.deepEqual([...vistos], [145]);
    assert.match(derivado.SQL_COSTO_DERIVADO, /ORDER BY ch\.fecha DESC, ch\.id DESC/);
  });

  test('una compra nueva nace con su producto propio, y cambiar la relación lo corrige', async () => {
    const lineaId = await linea(60, { alegraItemId: 'zz-900001', precio: 200 });
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
    await conexion.query(`UPDATE productos_factura_proveedor SET alegra_item_id = 'zz-900002' WHERE id = $1`, [lineaId]);
    lineasPrisma = [{ ...base, alegraItemId: 'zz-900002' }];
    await historico.sincronizarCostoDeLineas([lineaId]);
    const otro = (await conexion.query(`SELECT id FROM producto WHERE alegra_id = 'zz-900002'`)).rows[0].id;
    assert.deepEqual(await fila(), { producto_id: otro, alegra_item_id: 'zz-900002', costo: 226 });
  });

  test('un producto sin ficha en Alegra todavía NO tiene costo derivado: el buzón relaciona por el id de Alegra', async () => {
    const lineaId = await linea(70, { alegraItemId: null });
    // Su compra entra por el id propio; no hay id de Alegra que comparar.
    await costo({ lineaId, productoId: sinAlegra, alegraItemId: null, fecha: '2031-03-15', monto: 777 });
    const mapa = await derivado.obtenerCostosDerivados();
    // Hoy NO entra: la validez compara el id de Alegra de la fila con el de la
    // línea del buzón, y los dos están vacíos. Queda escrito para que el día
    // que el buzón guarde el producto propio (Relacionar Productos), esta
    // prueba sea la que haya que cambiar.
    assert.equal(mapa.get(sinAlegra), undefined);
  });

  test('los scripts viejos piden el mismo costo por el id de Alegra, con otro nombre', async () => {
    const porAlegra = await derivado.obtenerCostosDerivadosPorAlegra();
    assert.equal(porAlegra.get('zz-900001').costo, (await derivado.obtenerCostosDerivados()).get(conAlegra).costo);
    assert.ok([...porAlegra.keys()].every(k => typeof k === 'string'));
  });
});
