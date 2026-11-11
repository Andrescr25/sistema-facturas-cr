/**
 * Un exceso, de la tanda al catálogo y a la factura (2026-11-11). El usuario:
 * «así como los productos nuevos salen en el catálogo, que pase lo mismo con
 * los excesos y se vea el descuento; y que si se factura ese producto, agarre
 * el descuento que se puso en excesos».
 *
 * Sin el conteo físico casi todo el inventario está en 0: empacar sin escribir
 * la cantidad dejaba la oferta escondida. Contra PostgreSQL local, en una
 * transacción que se deshace.
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

describe('un exceso llega al catálogo y a la factura — PostgreSQL con ROLLBACK', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, () => {
  let c, pool, excesos, facturacion, ofertas, catalogo, producto, cliente, usuario, tanda, item;
  const rutaDb = require.resolve('../config/database');
  const enOferta = async () => (await ofertas.ofertasVigentes()).find(o => o.productoId === producto.id);

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL });
    c = await pool.connect(); await c.query('BEGIN');
    const { baseEnTransaccion } = require('../src/utils/baseEnTransaccion');
    for (const r of Object.keys(require.cache)) if (r.includes('/src/')) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(c, 'excesocatalogo') };
    excesos = require('../src/modules/inventario-auditorias/inventario-auditorias.service');
    facturacion = require('../src/modules/facturacion/facturaPropia.service');
    ofertas = require('../src/modules/facturacion/ofertas.service');
    catalogo = require('../src/modules/catalogo-agente/catalogo-agente.service');
    const zz = randomUUID().slice(0, 8);
    producto = (await c.query(`INSERT INTO producto (nombre, referencia, cabys, precio_sin_iva, costo_con_iva, categoria_id, impuesto_id)
      VALUES ($1, $2, '4294401030100', 1000, 700, (SELECT id FROM categoria_producto WHERE activo ORDER BY id LIMIT 1),
              (SELECT id FROM impuesto WHERE tarifa = 13 ORDER BY id LIMIT 1)) RETURNING id, nombre, referencia`,
      [`ZZ EXCESO ${zz}`, `ZZ-EXC-${zz}`])).rows[0];
    cliente = (await c.query(`SELECT c.id FROM cliente c WHERE c.activo AND COALESCE(c.descuento_global, 0) = 0
      AND NOT EXISTS (SELECT 1 FROM ciclo_ruta_cliente x WHERE x.cliente_id = c.id) ORDER BY c.id LIMIT 1`)).rows[0].id;
    usuario = (await c.query('SELECT id FROM usuario WHERE activo ORDER BY id LIMIT 1')).rows[0].id;
    tanda = await excesos.crearExcesoManual();
    item = await excesos.agregarItemExceso(tanda.id, { productoId: producto.id });
    await excesos.guardarDescuentoExceso({ productoId: producto.id, descuentoPorcentaje: 20 });
  });

  after(async () => { if (c) { await c.query('ROLLBACK'); c.release(); } await pool?.end(); });

  test('con el inventario en 0 no deja empacar sin escribir cuántas hay, y la oferta todavía no sale', async () => {
    await assert.rejects(excesos.actualizarItemExceso(tanda.id, item.id, { empacado: true }),
      (e) => e.status === 400 && /cuántas unidades/.test(e.message));
    assert.equal(await enOferta(), undefined);
  });

  test('empacado con 12: el inventario queda en 12 y la oferta sale con su 20 % en Facturación y en el catálogo', async () => {
    await excesos.actualizarItemExceso(tanda.id, item.id, { empacado: true, stockReal: '12' });
    const { rows: [s] } = await c.query('SELECT existencia FROM inventario_saldo WHERE producto_id = $1', [producto.id]);
    assert.equal(Number(s.existencia), 12);
    assert.equal((await enOferta()).descuentoPorcentaje, 20);
    assert.equal((await catalogo.listarOfertas()).find(o => String(o.id) === String(producto.id)).descuentoPorcentaje, 20);
  });

  test('facturado sin permiso de precio: vale el 20 % del exceso y no otro; al venderse todo, la oferta se apaga', async () => {
    const venta = (cantidad, descuento) => ({ clienteId: cliente,
      items: [{ productoId: producto.id, reference: producto.referencia, name: producto.nombre, quantity: cantidad, price: 1000, discount: descuento }] });
    await assert.rejects(facturacion.crearFactura(venta(1, 25), usuario, { precioFijo: true }), (e) => e.code === 'PRECIO_FIJO');
    const f = await facturacion.crearFactura(venta(12, 20), usuario, { precioFijo: true });
    const { rows: [l] } = await c.query('SELECT descuento_porcentaje::float, total::float FROM factura_linea WHERE factura_id = $1', [f.id]);
    assert.deepEqual([l.descuento_porcentaje, l.total], [20, 10848]);
    assert.equal(await enOferta(), undefined, 'se vendieron las 12: ya no se ofrece');
  });
});

describe('la pantalla del exceso y la del catálogo', () => {
  const fs = require('fs');
  const path = require('path');
  const { sinComentarios } = require('./dobles/sinComentarios');

  test('la tarjeta de empaque pide la cantidad si el inventario dice 0 o menos', async () => {
    const { faltaCantidadParaEmpacar } = await import('../../frontend/src/utils/inventarioAuditoriaUtils.js');
    assert.equal(faltaCantidadParaEmpacar({ stock_sistema: '0.0000' }, ''), true);
    assert.equal(faltaCantidadParaEmpacar({ stock_sistema: '-3' }, '  '), true);
    assert.equal(faltaCantidadParaEmpacar({ stock_sistema: '-3' }, '12'), false);
    assert.equal(faltaCantidadParaEmpacar({ stock_sistema: '5' }, ''), false, 'con inventario positivo se empaca directo, como antes');
  });

  test('el catálogo del agente tiene «Liquidación» en Todo y como filtro, como «Productos nuevos»', () => {
    const pagina = sinComentarios(fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'CatalogoAgente.jsx'), 'utf8'));
    assert.match(pagina, /clave: '__liquidacion', texto: 'Liquidación', icono: Flame, contador: featuredProducts\.length/);
    assert.match(pagina, /\(enTodo \|\| categoria === '__liquidacion'\) && featuredProducts\.length > 0/);
    assert.match(pagina, /<Seccion titulo="Liquidación"/);
  });
});
