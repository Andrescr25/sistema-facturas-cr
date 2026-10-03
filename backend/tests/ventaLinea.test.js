/**
 * `venta_linea`: las ventas salen de las facturas propias (sección 12 del
 * checklist; migración independencia/034), contra la base local de la rama.
 *
 * POR QUÉ CONTRA LA BASE. Lo que cambió es SQL: una vista nueva y una docena
 * de consultas que pasaron de `venta_historico` (ids de Alegra) a la vista
 * (ids propios). Un doble acepta cualquier texto como SQL.
 *
 * CÓMO NO DEJA RASTRO. Una sola conexión dentro de BEGIN, y al final ROLLBACK
 * (igual que faltantesIdsPropios.test.js). Solo con la base LOCAL.
 *
 * LO QUE SE CUIDA
 *  - Solo cuenta una factura EMITIDA: pasarla a borrador o anularla la saca
 *    de las ventas en el acto, sin sincronizar nada. Con el historial viejo
 *    había que esperar el repaso contra Alegra.
 *  - Editar una factura (lo que hace Impresión al rebajar faltantes) cambia
 *    lo vendido en el acto: el historial viejo se quedaba con lo facturado.
 *  - Cada lector corre de verdad sobre la vista y cruza por el id correcto.
 *  - En el portal, la compra de otro cliente no se abre.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const hayBase = Boolean(process.env.DATABASE_URL);
let pool; let cliente;

function baseDePrueba() {
  const query = (sql, params) => cliente.query(sql, params);
  let nivel = 0;
  return {
    query,
    pool: {
      query,
      connect: async () => ({
        query: async (sql, params) => {
          const t = String(sql).trim();
          if (t === 'BEGIN') return cliente.query(`SAVEPOINT prueba_${++nivel}`);
          if (t === 'COMMIT') return cliente.query(`RELEASE SAVEPOINT prueba_${nivel--}`);
          if (t === 'ROLLBACK') return cliente.query(`ROLLBACK TO SAVEPOINT prueba_${nivel--}`);
          return cliente.query(sql, params);
        },
        release() {}
      })
    }
  };
}

describe('las ventas salen de las facturas propias — contra la base local', { skip: hayBase ? false : 'sin DATABASE_URL' }, () => {
  let m = {};
  let venta; // una línea vendida en la ventana de rotación: { factura_id, producto_id, cliente_id, cantidad }
  let portal; // un cliente del portal con compras: { contacto, cliente_id }

  const unidades = async (productoId) => Number((await cliente.query(
    `SELECT unidades FROM (${m.rotacion.SQL_ROTACION}) r WHERE producto_id = $1`, [productoId])).rows[0]?.unidades || 0);

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    cliente = await pool.connect();
    await cliente.query('BEGIN');

    const rutaDb = require.resolve('../config/database');
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseDePrueba() };
    // Prisma (costos derivados no lo usan, pero otros módulos lo arrastran) se
    // cierra en un beforeExit que escribe después de terminar la prueba.
    const rutaPrisma = require.resolve('../lib/prisma');
    require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: {} };

    m = {
      rotacion: require('../src/modules/ventas/rotacion'),
      estadisticas: require('../src/modules/ventas/estadisticas'),
      rentabilidad: require('../src/modules/rentabilidad/rentabilidad.service'),
      sugerencias: require('../src/modules/portal-clientes/portal-clientes.sugerencias.service'),
      inicio: require('../src/modules/portal-clientes/portal-clientes.inicio.service'),
      agente: require('../src/modules/catalogo-agente/catalogo-agente.service')
    };

    // La base local es una copia de hace semanas: para que haya ventas en la
    // ventana de 3 meses, la factura de prueba se fecha hoy (se deshace).
    ({ rows: [venta] } = await cliente.query(`
      SELECT l.factura_id, l.producto_id, f.cliente_id, l.cantidad::numeric AS cantidad
        FROM factura_linea l JOIN factura f ON f.id = l.factura_id
        JOIN producto p ON p.id = l.producto_id AND p.alegra_id IS NOT NULL
       WHERE f.estado = 'emitida' AND NOT f.electronica
         AND (SELECT COUNT(*) FROM factura_linea x WHERE x.factura_id = l.factura_id AND x.producto_id = l.producto_id) = 1
       ORDER BY f.id DESC LIMIT 1
    `));
    assert.ok(venta, 'la base local no tiene facturas emitidas');
    await cliente.query(`UPDATE factura SET fecha = ${m.rotacion.HOY_CR} WHERE id = $1`, [venta.factura_id]);

    ({ rows: [portal] } = await cliente.query(`
      SELECT cp.alegra_contact_id AS contacto, cp.cliente_id
        FROM cliente_portal cp
       WHERE EXISTS (SELECT 1 FROM factura f WHERE f.cliente_id = cp.cliente_id AND f.estado = 'emitida')
       ORDER BY (SELECT COUNT(*) FROM factura f WHERE f.cliente_id = cp.cliente_id) DESC LIMIT 1
    `));
  });

  after(async () => {
    await cliente?.query('ROLLBACK').catch(() => {});
    cliente?.release();
    await pool?.end().catch(() => {});
  });

  test('la vista cuenta las líneas de las facturas emitidas, y solo esas', async () => {
    const { rows: [r] } = await cliente.query(`
      SELECT (SELECT COUNT(*) FROM venta_linea)::int AS vista,
             (SELECT COUNT(*) FROM factura_linea l JOIN factura f ON f.id = l.factura_id WHERE f.estado = 'emitida')::int AS emitidas,
             (SELECT COUNT(*) FROM factura_linea)::int AS todas
    `);
    assert.equal(r.vista, r.emitidas);
    assert.ok(r.todas > r.vista, 'la base local tiene borradores y anuladas: la vista tiene que dejar líneas afuera');
  });

  test('editar la factura cambia lo vendido en el acto (el historial viejo se quedaba con lo facturado)', async () => {
    const antes = await unidades(venta.producto_id);
    await cliente.query('SAVEPOINT edicion');
    await cliente.query(`UPDATE factura_linea SET cantidad = cantidad + 5 WHERE factura_id = $1 AND producto_id = $2`, [venta.factura_id, venta.producto_id]);
    assert.equal(await unidades(venta.producto_id), antes + 5);
    await cliente.query('ROLLBACK TO SAVEPOINT edicion');
  });

  test('un borrador o una anulada dejan de ser venta en el acto, sin sincronizar nada', async () => {
    const antes = await unidades(venta.producto_id);
    assert.ok(antes >= Number(venta.cantidad));
    for (const estado of ['anulada', 'borrador']) {
      await cliente.query('SAVEPOINT estado');
      await cliente.query(`UPDATE factura SET estado = $2 WHERE id = $1`, [venta.factura_id, estado]);
      assert.equal(await unidades(venta.producto_id), antes - Number(venta.cantidad), estado);
      await cliente.query('ROLLBACK TO SAVEPOINT estado');
    }
    assert.equal(await unidades(venta.producto_id), antes);
  });

  test('la rotación va por producto.id y trae el id de Alegra de ESE producto', async () => {
    const mapa = await m.rotacion.rotacionPorProducto();
    const fila = mapa.get(Number(venta.producto_id));
    assert.ok(fila, 'el producto vendido hoy no tiene rotación');
    const { rows: [p] } = await cliente.query('SELECT alegra_id FROM producto WHERE id = $1', [venta.producto_id]);
    assert.equal(fila.alegraItemId, String(p.alegra_id));
    assert.match(fila.clase, /^[ABC]$/);
    const clases = await m.rotacion.clasesAB();
    assert.ok(Array.isArray(clases.A) && Array.isArray(clases.B));
  });

  test('el motor de precios y el catálogo viejo siguen pudiendo cruzar por el id de Alegra', async () => {
    const { rows } = await cliente.query(
      `SELECT alegra_item_id, clase, unidades_mes, clientes_distintos FROM (${m.rotacion.SQL_ROTACION_PRECIOS}) r WHERE alegra_item_id = ANY($1::text[])`, [['1', '2', '3']]);
    assert.ok(Array.isArray(rows));
  });

  test('las series de cuándo se vende corren para el negocio y para un producto', async () => {
    const negocio = await m.estadisticas.series();
    assert.equal(negocio.semanas.length, m.estadisticas.SEMANAS);
    assert.equal(negocio.meses.length, m.estadisticas.MESES);
    assert.equal(negocio.diasDelMes.length, 31);
    const producto = await m.estadisticas.series(venta.producto_id);
    assert.ok(producto.semanas.at(-1).unidades >= Number(venta.cantidad), 'la venta de hoy cae en la semana en curso');
    await assert.rejects(() => m.estadisticas.series('1; DROP TABLE x'), /inválido/);
  });

  test('Rentabilidad arma el resumen y el detalle de un producto sobre las ventas propias', async () => {
    m.rentabilidad._limpiarMemoria();
    const resumen = await m.rentabilidad.obtenerResumen();
    assert.ok(resumen.ventas > 0);
    assert.ok(resumen.facturas >= 1);
    const { rows: [p] } = await cliente.query('SELECT alegra_id FROM producto WHERE id = $1', [venta.producto_id]);
    const detalle = await m.rentabilidad.obtenerProducto(p.alegra_id);
    assert.equal(detalle.producto.productoId, Number(venta.producto_id));
    assert.ok(detalle.producto.unidades >= Number(venta.cantidad));
  });

  test('el historial del agente sale por cliente, con los ids de Alegra que todavía usa la tablet', async () => {
    const h = await m.agente.obtenerHistorialParaCatalogo();
    assert.ok(h.clientes.length > 0);
    const [id, veces, fecha] = h.clientes[0].p[0];
    assert.ok(id && veces >= 1);
    assert.match(fecha, /^\d{4}-\d{2}-\d{2}$/, 'la fecha viaja como día de calendario');
    assert.ok(h.clientes.every((c) => c.p.length <= 120));
    const { rows: [c] } = await cliente.query('SELECT 1 FROM cliente WHERE alegra_id = $1', [String(h.clientes[0].id)]);
    assert.ok(c, 'el id del cliente es el de Alegra de una ficha propia');
  });

  test('portal: la portada, las compras anteriores y sus líneas, por la ficha propia del cliente', async (t) => {
    if (!portal) return t.skip('la copia local no tiene clientes del portal con compras');
    const inicio = await m.inicio.obtenerInicio(portal.cliente_id);
    assert.ok(inicio && typeof inicio === 'object');

    const compras = await m.sugerencias.comprasAnteriores(portal.cliente_id, 5);
    assert.ok(compras.length > 0);
    const { rows: [f] } = await cliente.query('SELECT cliente_id, total FROM factura WHERE id = $1', [compras[0].facturaId]);
    assert.equal(f.cliente_id, portal.cliente_id, 'la compra es de ESE cliente');
    assert.equal(compras[0].total, Math.round(Number(f.total) * 100) / 100, 'el total es el de la factura');

    const detalle = await m.sugerencias.detalleCompra(portal.cliente_id, compras[0].facturaId);
    const lineas = await m.sugerencias.lineasDeCompra(portal.cliente_id, compras[0].facturaId);
    assert.equal(detalle.items.length, lineas.length);

    const ficha = await m.sugerencias.fichaProducto(portal.cliente_id, lineas[0].productoId).catch((e) => e);
    if (!(ficha instanceof Error)) assert.ok(ficha.historial.veces >= 1, 'lo compró: tiene historia con ese producto');
    assert.ok(Array.isArray(await m.sugerencias.seLlevaJuntoCon([lineas[0].productoId])));
  });

  test('portal: la compra de OTRO cliente no se abre, aunque se adivine su id', async (t) => {
    if (!portal) return t.skip('la copia local no tiene clientes del portal con compras');
    const { rows: [ajena] } = await cliente.query(
      `SELECT id FROM factura WHERE estado = 'emitida' AND cliente_id <> $1 ORDER BY id DESC LIMIT 1`, [portal.cliente_id]);
    await assert.rejects(() => m.sugerencias.detalleCompra(portal.cliente_id, ajena.id), (e) => e.status === 404);
    await assert.rejects(() => m.sugerencias.lineasDeCompra(portal.cliente_id, ajena.id), (e) => e.status === 404);
  });
});

describe('la migración 034', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', 'independencia', '034_venta_linea.sql'), 'utf8');

  test('la vista solo deja pasar facturas emitidas y es repetible', () => {
    assert.match(sql, /CREATE OR REPLACE VIEW venta_linea AS/);
    assert.match(sql, /WHERE f\.estado = 'emitida'/);
    assert.match(sql, /l\.cantidad \* l\.precio_unitario - COALESCE\(l\.descuento_monto, 0\)\) AS importe/);
  });
});
