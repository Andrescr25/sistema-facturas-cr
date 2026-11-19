/**
 * Impresión con una nota de crédito (2026-11-19). El usuario, tras poder
 * cambiar productos en Reporte Clientes con nota: «dale sí» a que Impresión
 * cambie las líneas sin tocar las que tienen nota, que el faltante del
 * producto acreditado se cierre sin rebaja y que no se le pida al proveedor.
 *
 * Reglas puras sin base; el resto en una base desechable, BEGIN/ROLLBACK.
 */
const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { baseEnTransaccion } = require('../src/utils/baseEnTransaccion');

describe('Impresión con nota de crédito — reglas puras', () => {
  const { conservarLugarAcreditadas, rebajaObjetivo, proponerLineas } = require('../src/modules/reprinting/procesarImpresion');
  const l = (productoId) => ({ productoId, cantidad: 1 });

  test('la línea acreditada vuelve a su número cuando se quita una de antes', () => {
    // Antes: 1 A, 2 B, 3 X (con nota), 4 C. A no llegó y se quita.
    const r = conservarLugarAcreditadas([l('B'), l('X'), l('C')], [{ producto_id: 'X', numero_linea: 3 }]);
    assert.deepEqual(r.map(x => x.productoId), ['B', 'C', 'X']);
  });

  test('sin nota, o con la línea ya en su lugar, el orden no cambia', () => {
    const finales = [l('A'), l('X')];
    assert.equal(conservarLugarAcreditadas(finales, []), finales);
    assert.deepEqual(conservarLugarAcreditadas(finales, [{ producto_id: 'X', numero_linea: 2 }]).map(x => x.productoId), ['A', 'X']);
  });

  test('si no quedan líneas para llegar a su número, queda como venía (la edición lo rechaza)', () => {
    assert.deepEqual(conservarLugarAcreditadas([l('X')], [{ producto_id: 'X', numero_linea: 2 }]).map(x => x.productoId), ['X']);
  });

  test('el faltante con nota no se rebaja más; los demás, como siempre', () => {
    assert.equal(rebajaObjetivo({ cantidad_faltante: 3, estado: null, cantidad_rebajada: 0, con_nota: true }), 0);
    assert.equal(rebajaObjetivo({ cantidad_faltante: 3, estado: null, cantidad_rebajada: 0, con_nota: false }), 3);
  });

  test('la línea acreditada conserva su precio aunque el catálogo cambie', () => {
    const lineas = [
      { producto_id: 1, cantidad: 2, precio_unitario: 100, precio_catalogo: 150, descuento_porcentaje: 0, tarifa: 13 },
      { producto_id: 2, cantidad: 2, precio_unitario: 100, precio_catalogo: 150, descuento_porcentaje: 0, tarifa: 13 }
    ];
    const r = proponerLineas(lineas, [], { actualizarPrecios: true, acreditados: new Set([2]) });
    assert.deepEqual(r.map(x => x.precio), [150, 100]);
  });
});

describe('Impresión con nota de crédito — PostgreSQL desechable', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, () => {
  let pool, db, ajustes, cola, impresion, usuario;
  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 1 }); db = await pool.connect();
    const ruta = require.resolve('../config/database');
    for (const r of Object.keys(require.cache)) if (r.includes('/src/')) delete require.cache[r];
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: baseEnTransaccion(db, 'impnota_zz') };
    ajustes = require('../src/modules/missing-items/missing-items.service');
    cola = require('../src/modules/reprinting/colaImpresion');
    impresion = require('../src/modules/reprinting/procesarImpresion');
    usuario = { id: (await db.query('SELECT min(id) AS id FROM usuario WHERE es_admin AND activo')).rows[0].id, nombre: 'ZZ Impresión con nota' };
  });
  beforeEach(async () => { await db.query('BEGIN'); });
  afterEach(async () => { await db.query('ROLLBACK'); });
  after(async () => { db?.release(); await pool?.end(); });

  const escenario = (o) => require('./helpers/sustitucionProducto').crearEscenario(db, usuario, o);
  const lineas = async (e) => (await db.query(
    'SELECT numero_linea, producto_id, cantidad::float, precio_unitario::float, descuento_porcentaje::float FROM factura_linea WHERE factura_id=$1 ORDER BY numero_linea', [e.factura.id])).rows;
  const notaDe = async (e, productoId, cantidad) => {
    const numeroLinea = (await lineas(e)).find(l => l.producto_id === productoId).numero_linea;
    return require('../src/modules/facturacion/notaCredito.service').crearNotaCredito(
      { facturaId: e.factura.id, motivo: 'devolucion', motivoTexto: 'ZZ nota', lineas: [{ numeroLinea, cantidad }] }, usuario.id);
  };
  const noLlego = (faltanteId) => ajustes.saveAdjustment({ faltanteId, cantidadEntregada: 0, estado: 'no_llego', revisado: true }, usuario.id);
  const faltante = async (id) => (await db.query('SELECT estado, cantidad_rebajada::float FROM faltantes WHERE id=$1', [id])).rows[0];

  test('nota sobre otro producto: Impresión rebaja lo que no llegó y deja la línea acreditada igual', async () => {
    const e = await escenario({ recibidas: 0 });
    await notaDe(e, e.otro.id, 1);
    const acreditada = (await lineas(e)).find(l => l.producto_id === e.otro.id);
    await noLlego(e.faltanteId);
    await cola.encolarDesdeReporte(e.factura.id);
    await impresion.procesar(e.factura.id, {}, usuario);
    const despues = await lineas(e);
    assert.equal(despues.find(l => l.producto_id === e.a.id).cantidad, 3, 'se rebajaron las 3 que no llegaron');
    assert.deepEqual(despues.find(l => l.producto_id === e.otro.id), acreditada, 'mismo número, cantidad, precio y descuento');
    assert.deepEqual(await faltante(e.faltanteId), { estado: 'procesado', cantidad_rebajada: 3 });
  });

  test('nota sobre el producto que faltaba: no se exige revisarlo, no se rebaja, conserva su precio y no se le pide al proveedor', async () => {
    const e = await escenario({ recibidas: 0 });
    const detectados = [];
    await require('../src/utils/guardarFaltantes').guardarFaltantes(e.factura.id,
      [{ producto_id: e.otro.id, cantidad_faltante: 1, tipo_faltante: 'parcial' }], usuario.nombre, db, detectados);
    const otroFaltante = detectados[0].id;
    await notaDe(e, e.a.id, 3);
    const acreditada = (await lineas(e)).find(l => l.producto_id === e.a.id);

    const { faltanteOperativo } = require('../src/modules/reports/faltantesCompra.sql');
    const { rows: necesidades } = await db.query(`SELECT f.id FROM faltantes f JOIN factura fa ON fa.id=f.factura_propia_id
      WHERE fa.id=$1 AND ${faltanteOperativo('f', 'fa')} ORDER BY f.id`, [e.factura.id]);
    assert.deepEqual(necesidades.map(r => r.id), [otroFaltante], 'Reporte Proveedores ya no pide el acreditado');

    await noLlego(otroFaltante);
    await db.query('UPDATE producto SET precio_sin_iva = precio_sin_iva + 100 WHERE id = ANY($1::int[])', [[e.a.id, e.otro.id]]);
    await cola.encolarDesdeReporte(e.factura.id);
    await impresion.procesar(e.factura.id, {}, usuario);

    const despues = await lineas(e);
    assert.deepEqual(despues.find(l => l.producto_id === e.a.id), acreditada, 'ni cantidad ni precio');
    assert.equal(despues.find(l => l.producto_id === e.otro.id).cantidad, 1);
    assert.equal(despues.find(l => l.producto_id === e.otro.id).precio_unitario, Number(e.otro.precio_sin_iva) + 100, 'los demás sí toman el precio del catálogo');
    assert.deepEqual(await faltante(e.faltanteId), { estado: 'procesado', cantidad_rebajada: 0 });
    assert.deepEqual(await faltante(otroFaltante), { estado: 'procesado', cantidad_rebajada: 1 });
  });

  test('si Impresión tendría que mover la línea acreditada, no toca nada y dice qué hacer', async () => {
    const e = await escenario({ originales: 3, faltan: 3, recibidas: 0 });
    await notaDe(e, e.otro.id, 1);
    const antes = await lineas(e);
    await noLlego(e.faltanteId);
    await cola.encolarDesdeReporte(e.factura.id);
    await assert.rejects(impresion.procesar(e.factura.id, {}, usuario),
      (err) => err.status === 409 && /no se puede cambiar ni mover/.test(err.message) && /otra nota de crédito/.test(err.message));
    assert.deepEqual(await lineas(e), antes);
  });
});
