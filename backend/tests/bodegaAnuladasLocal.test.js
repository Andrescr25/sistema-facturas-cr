/** Facturación y Bodega reales, sobre PostgreSQL desechable y ROLLBACK. */
const { describe, test, before, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');

const activo = process.env.PROBAR_BASE_LOCAL === '1';
let pool, c, bodega, notas, facturacion, estadoDeFactura;

describe('facturas anuladas en Bodega — PostgreSQL local', { skip: !activo }, () => {
  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    c = await pool.connect();
    const db = baseEnTransaccion(c, 'bodega_anulada_zz');
    const ruta = require.resolve('../config/database');
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: db };
    bodega = require('../src/modules/warehouse/bodegaPropia');
    notas = require('../src/modules/facturacion/notaCredito.service');
    facturacion = require('../src/modules/facturacion/facturaPropia.service');
    ({ estadoDeFactura } = await import('../../frontend/src/utils/notaCreditoTexto.js'));
  });
  beforeEach(() => c.query('BEGIN'));
  afterEach(() => c.query('ROLLBACK'));
  after(async () => { c?.release(); await pool?.end(); });

  async function fixture() {
    const nombre = `ZZ-BOD-${randomUUID().slice(0, 8)}`;
    const { rows: [p] } = await c.query('INSERT INTO producto(nombre,referencia,precio_sin_iva) VALUES($1,$1,1000) RETURNING id', [nombre]);
    const { rows: [f] } = await c.query(`INSERT INTO factura(numero,estado,fecha,cliente_nombre,total)
      VALUES($1,'emitida',CURRENT_DATE,$1,2000) RETURNING id`, [nombre]);
    await c.query(`INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,referencia,cantidad,precio_unitario,total)
      VALUES($1,1,$2,$3,$3,2,1000,2000)`, [f.id, p.id, nombre]);
    return { id: f.id, productoId: p.id };
  }
  const listar = () => bodega.listar({ cicloId: 'sin-ciclo' });
  const pendiente = async id => (await listar()).data.pendientes.some(f => f.factura_id === id);
  const crearNota = (f, cantidad) => notas.crearNotaCredito({ facturaId: f.id, motivo: 'anulacion',
    motivoTexto: 'ZZ comprobación local', ...(cantidad ? { lineas: [{ numeroLinea: 1, cantidad }] } : {}) });
  const cancelada = e => e.status === 409 && e.code === 'FACTURA_NO_VIGENTE';

  test('la anulación directa retira la pendiente y bloquea el despacho abierto', async () => {
    const f = await fixture();
    assert.equal(await pendiente(f.id), true);
    await facturacion.anularFactura(f.id, { motivo: 'ZZ anulación de prueba' });
    assert.equal(await pendiente(f.id), false);
    await assert.rejects(bodega.estados(f.id), cancelada);
    await assert.rejects(bodega.registrarFaltantes(f.id, [{ producto_id: f.productoId, tipo_faltante: 'total', cantidad_faltante: 2 }]), cancelada);
    await assert.rejects(bodega.actualizarEstado(f.id, { estado: 'procesado', enviarAImpresion: true }), cancelada);
    const { rows: [r] } = await c.query('SELECT estado_bodega FROM factura WHERE id=$1', [f.id]);
    assert.equal(r.estado_bodega, 'pendiente');
  });

  test('la nota completa conserva emitida, pero desaparece de pendientes y no genera faltantes ni impresión', async () => {
    const f = await fixture();
    assert.equal(await pendiente(f.id), true);
    await crearNota(f);
    const { rows: [r] } = await c.query('SELECT estado FROM factura WHERE id=$1', [f.id]);
    assert.equal(r.estado, 'emitida', 'caso que el filtro anterior confundía con un pedido vigente');
    assert.equal(await pendiente(f.id), false);
    await assert.rejects(bodega.estados(f.id), cancelada);
    await assert.rejects(bodega.registrarFaltantes(f.id, [{ producto_id: f.productoId, tipo_faltante: 'total', cantidad_faltante: 2 }]), cancelada);
    await assert.rejects(bodega.actualizarEstado(f.id, { estado: 'procesado', enviarAImpresion: true }), cancelada);
    for (const [tabla, columna] of [['faltantes', 'factura_propia_id'], ['facturas_reimpresion', 'factura_propia_id']]) {
      const { rows: [n] } = await c.query(`SELECT COUNT(*)::int AS n FROM ${tabla} WHERE ${columna}=$1`, [f.id]);
      assert.equal(n.n, 0);
    }
  });

  test('una nota parcial mantiene el pedido; varias notas que cubren todo lo retiran y anular una lo devuelve', async () => {
    const f = await fixture();
    await crearNota(f, 1);
    assert.equal(await pendiente(f.id), true);
    assert.deepEqual(await bodega.estados(f.id), []);
    const segunda = await crearNota(f, 1);
    assert.equal(await pendiente(f.id), false);
    await notas.anularNotaCredito(segunda.id, { motivo: 'ZZ se revierte la segunda nota' });
    assert.equal(await pendiente(f.id), true);
  });

  test('los cobros completos no cancelan la preparación', async () => {
    const f = await fixture();
    const { rows: [p] } = await c.query(`INSERT INTO pago(numero,fecha,cliente_nombre,monto,anulado) VALUES($1,CURRENT_DATE,'ZZ Bodega',2000,FALSE) RETURNING id`, [`ZZ-PAG-${randomUUID().slice(0, 8)}`]);
    await c.query('INSERT INTO pago_factura(pago_id,factura_id,monto) VALUES($1,$2,2000)', [p.id, f.id]);
    assert.equal(await pendiente(f.id), true);
    await bodega.registrarFaltantes(f.id, [{ producto_id: f.productoId, cantidad_faltante: 0, tipo_faltante: 'completo' }]);
    await bodega.actualizarEstado(f.id, { estado: 'procesado', enviarAImpresion: true });
    assert.equal((await listar()).data.listas.some(r => r.factura_id === f.id), true);
  });

  test('la tolerancia coincide con Facturación y una factura gratis sin créditos sigue vigente', async () => {
    for (const [total, monto] of [[2000, 1999.49], [2000, 1999.50], [2000, 2000], [0, 0]]) {
      const f = await fixture();
      await c.query('UPDATE factura SET total=$2 WHERE id=$1', [f.id, total]);
      if (monto) {
        const { rows: [nc] } = await c.query(`INSERT INTO nota_credito(numero,fecha,cliente_nombre,total)
          VALUES($1,CURRENT_DATE,'ZZ Bodega',$2) RETURNING id`, [`ZZ-NC-${randomUUID().slice(0, 8)}`, monto]);
        await c.query('INSERT INTO nota_credito_factura(nota_credito_id,factura_id,monto) VALUES($1,$2,$3)', [nc.id, f.id, monto]);
      }
      const anulada = estadoDeFactura({ estado: 'emitida', total, acreditado: monto, saldo: total - monto }, String).texto === 'Anulada con nota de crédito';
      assert.equal(await pendiente(f.id), !anulada);
      if (anulada) await assert.rejects(bodega.estados(f.id), cancelada);
      else await bodega.estados(f.id);
    }
  });

  test('el filtro se aplica antes del límite; el resumen no cuenta anuladas', async () => {
    const f = await fixture();
    const otra = await fixture();
    await crearNota(otra);
    const r = await bodega.listar({ dias: 365, limit: 500 });
    assert.equal(r.data.pendientes.some(p => p.factura_id === otra.id), false);
    assert.equal(r.data.pendientes.some(p => p.factura_id === f.id), true);
    assert.equal(r.data.resumen.pendientes, r.data.pendientes.length);
    assert.equal(r.data.resumen.total, r.data.pendientes.length + r.data.listas.length);
  });

  test('si la nota se confirma mientras el despacho espera, lee el crédito después del bloqueo', async () => {
    const { asegurarFacturaVigente } = require('../src/modules/warehouse/vigenciaFactura');
    const { Pool } = require('pg');
    const otroPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const otro = await otroPool.connect();
    const f = await fixture();
    let notaId, esperando;
    // Solo esta copia desechable: la segunda conexión necesita ver la factura.
    await c.query('COMMIT');
    try {
      await c.query('BEGIN');
      await c.query('SELECT id FROM factura WHERE id=$1 FOR UPDATE', [f.id]);
      await otro.query('BEGIN');
      await otro.query("SET LOCAL statement_timeout='5s'");
      esperando = asegurarFacturaVigente(f.id, otro, { bloquear: true }).catch(e => e);
      let bloqueado = false;
      for (let intento = 0; intento < 100 && !bloqueado; intento++) {
        const { rows: [r] } = await c.query("SELECT wait_event_type='Lock' AS bloqueado FROM pg_stat_activity WHERE pid=$1", [otro.processID]);
        bloqueado = r?.bloqueado;
        if (!bloqueado) await new Promise(resolve => setTimeout(resolve, 10));
        await c.query('SELECT pg_stat_clear_snapshot()');
      }
      assert.ok(bloqueado, 'el despacho espera al dueño del bloqueo de factura');
      const { rows: [nc] } = await c.query(`INSERT INTO nota_credito(numero,fecha,cliente_nombre,total)
        VALUES($1,CURRENT_DATE,'ZZ Bodega',2000) RETURNING id`, [`ZZ-NC-${randomUUID().slice(0, 8)}`]);
      notaId = nc.id;
      await c.query('INSERT INTO nota_credito_factura(nota_credito_id,factura_id,monto) VALUES($1,$2,2000)', [notaId, f.id]);
      await c.query('COMMIT');
      assert.equal(cancelada(await esperando), true);
    } finally {
      await c.query('ROLLBACK');
      await esperando;
      await otro.query('ROLLBACK');
      otro.release(); await otroPool.end();
      await c.query('BEGIN');
      if (notaId) await c.query('DELETE FROM nota_credito WHERE id=$1', [notaId]);
      await c.query('DELETE FROM factura WHERE id=$1', [f.id]);
      await c.query('DELETE FROM producto WHERE id=$1', [f.productoId]);
      await c.query('COMMIT');
      await c.query('BEGIN');
    }
  });
});
