/**
 * Una sola cantidad por producto (2026-11-11). El usuario: «ponme en Gestión de
 * Catálogo a la par del producto su cantidad… que no haya duplicaciones: que en
 * un lugar diga que hay 5 y en otro 8».
 *
 * Gestión de Catálogo (la categoría y la búsqueda), Inventario → Existencias y
 * el kardex leen la misma vista (`inventario_saldo`): después de una compra,
 * una venta y una devolución, las tres dicen lo mismo. Contra PostgreSQL local,
 * en una transacción que se deshace.
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

describe('la cantidad de un producto es una sola — PostgreSQL con ROLLBACK', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, () => {
  let c, pool, taxonomia, inventario, categoria, conStock, servicio, zz;
  const rutaDb = require.resolve('../config/database');
  const mover = (productoId, tipo, origenTipo, cantidad) => inventario.registrarEn(c, {
    productoId, tipo, origenTipo, origenId: 1, cantidad, costoUnitario: '100', clave: `zz-una-cifra-${randomUUID()}`
  });

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL });
    c = await pool.connect(); await c.query('BEGIN');
    const { baseEnTransaccion } = require('../src/utils/baseEnTransaccion');
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(c, 'unacifra') };
    taxonomia = require('../src/modules/productos/taxonomia.service');
    inventario = require('../src/modules/inventario/inventario.service');
    categoria = (await c.query('SELECT id FROM categoria_producto WHERE activo ORDER BY id LIMIT 1')).rows[0].id;
    zz = randomUUID().slice(0, 8);
    const producto = async (nombre, inventariable) => (await c.query(
      `INSERT INTO producto(nombre, referencia, cabys, precio_sin_iva, costo_con_iva, categoria_id, inventariable)
       VALUES ($1, $2, '4294401030100', 100, 60, $3, $4) RETURNING id`,
      [`ZZ UNA CIFRA ${zz} ${nombre}`, `ZZ-UNA-${zz}-${nombre}`, categoria, inventariable])).rows[0].id;
    conStock = await producto('CON STOCK', true);
    servicio = await producto('SERVICIO', false);
    await mover(conStock, 'compra', 'compra', '12');
    await mover(conStock, 'venta', 'factura', '-3');
    await mover(conStock, 'nota_credito', 'nota_credito', '1');
    await mover(conStock, 'venta', 'factura', '-0.5');
  });

  after(async () => { if (c) { await c.query('ROLLBACK'); c.release(); } await pool?.end(); });

  test('Gestión de Catálogo, Existencias y el kardex dicen lo mismo: 12 − 3 + 1 − 0,5', async () => {
    const enCategoria = (await taxonomia.productosDeCategoria(categoria)).find(p => p.id === conStock);
    const enBusqueda = (await taxonomia.buscar({ buscar: `ZZ UNA CIFRA ${zz}` })).find(p => p.id === conStock);
    const enExistencias = (await inventario.listarExistencias({ q: `ZZ UNA CIFRA ${zz}` }, c)).productos.find(p => p.producto_id === conStock);
    const enKardex = (await inventario.kardex(conStock, {}, c)).producto;
    assert.deepEqual([enCategoria.existencia, enBusqueda.existencia, Number(enExistencias.existencia), Number(enKardex.existencia)], [9.5, 9.5, 9.5, 9.5]);
  });

  test('un producto que no lleva inventario no muestra cantidad (ni un 0 que parezca contado)', async () => {
    const fila = (await taxonomia.productosDeCategoria(categoria)).find(p => p.id === servicio);
    assert.equal(fila.existencia, null);
  });

  test('una venta más se ve al toque en Gestión de Catálogo: nadie guarda la cifra aparte', async () => {
    await mover(conStock, 'venta', 'factura', '-2');
    const fila = (await taxonomia.productosDeCategoria(categoria)).find(p => p.id === conStock);
    assert.equal(fila.existencia, 7.5);
  });
});
