/** Cadena real completa; cada caso termina en ROLLBACK sobre un clon propio. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fixture = require('./fixtures/contextoCadena');
const activo = process.env.PROBAR_BASE_LOCAL === '1';
let c, pool, d, nivel = 0;
const tablasFijas = ['pedido_cliente','pedido_cliente_linea','factura','factura_linea','faltantes','orden_compra_ciclo','orden_compra_ciclo_linea','orden_compra_ciclo_origen','orden_compra_ciclo_envio','orden_compra_ciclo_factura','orden_compra_ciclo_factura_pdf','orden_compra_ciclo_recepcion','orden_compra_ciclo_recepcion_linea','compra','compra_linea','entrega_evento','movimiento_inventario'];
if (activo) {
  require('../config/aislado').asegurarBaseLocal();
  assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
  pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 1 });
  const query = (sql, params) => sql === 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY' ? Promise.resolve({ rows: [] }) : c.query(sql, params);
  // Los servicios ejecutan su SQL real. SAVEPOINT mantiene todos sus commits
  // dentro del caso desechable; la lectura real READ ONLY se verifica por HTTP.
  const rutaDb = require.resolve('../config/database');
  require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { query, pool: { query, connect: async () => {
    const sp = 'cadena_' + ++nivel;
    return { query: (sql, p) => query(sql === 'BEGIN' ? 'SAVEPOINT ' + sp : sql === 'COMMIT' ? 'RELEASE SAVEPOINT ' + sp : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT ' + sp : sql, p), release() {} };
  } } } };
  before(async () => { c = await pool.connect(); await c.query('BEGIN'); });
  after(async () => { if (c) { await c.query('ROLLBACK'); c.release(); } await pool.end(); });
}
const caso = (nombre, fn) => test(nombre, { skip: !activo }, async () => {
  await c.query('SAVEPOINT caso_cadena');
  d = null;
  try { d = await fixture.crear({ query: (sql, p) => c.query(sql, p) }); await fn(); }
  finally { d?.liberar(); await c.query('ROLLBACK TO SAVEPOINT caso_cadena'); }
});
async function huellas(tablas = tablasFijas) {
  const resultado = {};
  for (const t of tablas) resultado[t] = (await c.query(`SELECT md5(COALESCE(string_agg(h,'' ORDER BY h),'')) h FROM (SELECT md5(to_jsonb(t)::text) h FROM ${t} t) x`)).rows[0].h;
  return resultado;
}
const stock = async () => Number((await c.query('SELECT existencia FROM inventario_saldo WHERE producto_id=$1', [d.producto])).rows[0].existencia);
const necesidad = async cicloId => (await d.s.necesidades.listar({ cicloId, q: 'P-' + d.producto })).productos.find(p => p.productoId === d.producto);
caso('portal/agente → factura → bodega → compra/recepción → carga conserva dos semanas y origen', async () => {
  assert.equal(d.transportes.length, 3);
  for (const [i, id] of d.facturas.entries()) {
    const f = await d.s.facturas.obtenerFactura(id);
    assert.equal(f.ciclo.id, i < 2 ? d.actual.id : d.proximo.id);
    assert.equal(f.anticipado, i !== 1);
    const p = await d.s.pedidos.detalle(d.pedidos[i]);
    assert.equal(p.factura_id, id); assert.equal(p.estado, 'facturado');
  }
  const actual = await necesidad(d.actual.id), proximo = await necesidad(d.proximo.id);
  assert.equal(Number(actual.cantidades.solicitado), 10); assert.equal(Number(actual.cantidades.recibido), 4);
  assert.equal(Number(proximo.cantidades.solicitado), 4); assert.equal(Number(proximo.cantidades.recibido), 1);
  assert.equal((await d.s.fisico.consultar(d.facturas[0])).lineas[0].entregada, 1);
  assert.equal((await d.s.fisico.consultar(d.facturas[2])).lineas[0].enCamion, 1);
});
caso('mover/renombrar/Maps y promover conserva 17 tablas completas y los recorridos previos', async () => {
  const antes = await huellas(), cuerpo = await d.s.fisico.consultar(d.facturas[0]);
  const { futuro } = await fixture.mover(d);
  assert.deepEqual(await huellas(), antes);
  for (const cy of [d.actual, d.proximo]) {
    const f = await d.s.rutas.obtenerCiclo(cy.id);
    assert.equal(f.ruta_nombre, d.ruta.nombre); assert.deepEqual(f.clientes, cy.clientes);
  }
  assert.equal(futuro.clientes.length, 1); assert.equal(futuro.clientes[0].cliente_id, d.b.id); assert.equal(futuro.clientes[0].orden, 1);
  const despues = await d.s.fisico.consultar(d.facturas[0]);
  assert.deepEqual(despues.historial, cuerpo.historial); assert.equal(despues.requiereRevision, false);
  assert.equal(despues.ciclo.estado, 'cerrado'); assert.equal(despues.puedeEntregar, false);
});
caso('una recepción final después de promover acredita solo el delta en su orden original', async () => {
  const comerciales = await huellas(['orden_compra_ciclo_linea','orden_compra_ciclo_origen','orden_compra_ciclo_envio','orden_compra_ciclo_factura','orden_compra_ciclo_factura_pdf','compra','compra_linea']);
  await fixture.mover(d); const antes = await stock();
  const r = await fixture.recibir(d, 0, 6, true);
  assert.equal(r.orden.ciclo.id, d.actual.id); assert.equal(r.orden.estado, 'recibida');
  assert.equal(r.comparacion[0].recibido, 10); assert.equal(await stock(), antes + 6);
  assert.deepEqual(await huellas(Object.keys(comerciales)), comerciales);
  const siguiente = await necesidad(d.proximo.id); assert.equal(Number(siguiente.cantidades.recibido), 1); assert.equal(Number(siguiente.cantidades.pendienteRecibir), 3);
});
caso('cerrar enviada después del cambio conserva cuatro recibidas y libera seis del mismo ciclo', async () => {
  const o = d.ordenes[0], antes = await stock(), otra = await necesidad(d.proximo.id);
  const p = await d.s.cierre.consultar(o.id); await fixture.mover(d);
  assert.equal((await d.s.cierre.consultar(o.id)).revision, p.revision);
  const body = { clave: randomUUID(), version: p.version, revision: p.revision, confirmar: true, motivo: 'ZZ proveedor confirmó cierre del saldo de esta semana' };
  const r = await d.s.cierre.cerrar(o.id, body, d.actor);
  assert.equal(r.orden.estado, 'cerrada'); assert.equal(r.orden.ciclo.id, d.actual.id);
  assert.equal(await stock(), antes); assert.deepEqual(await necesidad(d.proximo.id), otra);
  const actual = await necesidad(d.actual.id); assert.equal(Number(actual.cantidades.recibido), 4); assert.equal(Number(actual.cantidades.sinCobertura), 6); assert.equal(Number(actual.cantidades.pendienteRecibir), 0);
  const historial = await d.s.ordenes.listar({ cicloId: d.actual.id, vista: 'historial' }); assert.equal(historial[0].id, o.id);
  await d.s.cierre.cerrar(o.id, body, d.actor); assert.equal((await c.query('SELECT COUNT(*)::int n FROM orden_compra_ciclo_cierre WHERE orden_id=$1', [o.id])).rows[0].n, 1);
});
caso('carga anticipada sigue en próxima semana, entrega exige promover y no vuelve a descontar stock', async () => {
  await fixture.mover(d); const antes = await stock(), guardado = await d.s.fisico.consultar(d.facturas[0]);
  await assert.rejects(fixture.evento(d, 2, 'entrega', 1), e => e.status === 409);
  await d.s.rutas.cambiarEstadoCiclo(d.proximo.id, { estado: 'entrega', estadoAnterior: 'preparacion' }, d.actor);
  const entregado = await fixture.evento(d, 2, 'entrega', 1);
  assert.equal(entregado.ciclo.id, d.proximo.id); assert.equal(entregado.lineas[0].entregada, 1);
  assert.equal(await stock(), antes); assert.deepEqual((await d.s.fisico.consultar(d.facturas[0])).historial, guardado.historial);
  assert.equal(Number((await necesidad(d.proximo.id)).cantidades.comprometido), 3);
});
caso('respuesta perdida se reconoce tras cierre; descarga conserva fotografía y no mueve compras/stock', async () => {
  await fixture.mover(d); const antes = await huellas(['compra','compra_linea','movimiento_inventario']);
  const repetido = await d.s.fisico.registrar(d.facturas[0], d.cargaOriginal, d.actor); assert.equal(repetido.version, 2);
  await assert.rejects(fixture.evento(d, 0, 'carga', 1), e => e.status === 409);
  const r = await fixture.evento(d, 0, 'descarga', 2, 'ZZ devolución de carga de la semana cerrada');
  assert.equal(r.ciclo.id, d.actual.id); assert.equal(r.lineas[0].enCamion, 0); assert.equal(r.lineas[0].entregada, 1);
  assert.equal(r.historial[2].documento.factura.clienteNombre, d.a.nombre);
  assert.deepEqual(await huellas(Object.keys(antes)), antes);
});
caso('PDF de envío/factura y comparación permanecen idénticos después del cambio de ruta/semana', async () => {
  const antes = [];
  for (const [i, v] of d.vinculos.entries()) antes.push({ envio: (await d.s.envio.descargar(d.ordenes[i].id, d.ordenes[i].envios[0].id)).pdf,
    factura: (await d.s.facturaOrden.descargarPdf(d.ordenes[i].id, v.vinculo, v.pdfId)).pdf, vista: await d.s.facturaOrden.consultar(d.ordenes[i].id) });
  await fixture.mover(d);
  for (const [i, v] of d.vinculos.entries()) {
    assert.deepEqual((await d.s.envio.descargar(d.ordenes[i].id, d.ordenes[i].envios[0].id)).pdf, antes[i].envio);
    assert.deepEqual((await d.s.facturaOrden.descargarPdf(d.ordenes[i].id, v.vinculo, v.pdfId)).pdf, antes[i].factura);
    assert.deepEqual(await d.s.facturaOrden.consultar(d.ordenes[i].id), antes[i].vista);
  }
  assert.equal(d.transportes.length, 3);
});
caso('histórico Sin ciclo permanece sin Maps, carga, reclasificación o eventos inventados', async () => {
  await fixture.mover(d);
  const f = await d.s.facturas.obtenerFactura(d.historico); assert.equal(f.ciclo, null); assert.equal(f.historica, true);
  const o = await d.s.ordenes.obtener(d.ordenes[2].id); assert.equal(o.ciclo, null); assert.equal(o.lineas[0].origenes[0].factura_id, d.historico);
  const p = await d.s.entregas.parada('cl-' + d.a.id, { cicloId: 'sin-ciclo' }); assert.equal(p.ciclo, null); assert.equal(p.ubicacion_maps, null);
  assert.equal((await d.s.entregas.plan({ cicloId: 'sin-ciclo' })).carga.length, 0);
  await assert.rejects(d.s.fisico.consultar(d.historico), e => e.status === 409);
  assert.equal((await c.query('SELECT COUNT(*)::int n FROM entrega_evento WHERE factura_id=$1', [d.historico])).rows[0].n, 0);
});
caso('Excel y consultas leen contexto fijo, cobertura y avance sin alterar la cadena', async () => {
  await fixture.mover(d); const antes = await huellas(), XLSX = require('xlsx');
  for (const [cy, ids] of [[d.actual, d.facturas.slice(0, 2)], [d.proximo, [d.facturas[2]]]]) {
    const plan = await d.s.entregas.plan({ cicloId: cy.id }); assert.ok(plan.paradas.every(p => p.ciclo.id === cy.id));
    const exp = await require('../src/modules/entregas/entregas.excel').exportar({ cicloId: cy.id });
    const libro = XLSX.read(exp.buffer, { type: 'buffer' }); const filas = XLSX.utils.sheet_to_json(libro.Sheets.Documentos);
    assert.deepEqual(filas.map(x => x['ID documento']).sort(), [...ids].sort()); assert.ok(filas.every(x => x['ID ciclo'] === cy.id));
    const oc = await require('../src/modules/orders-whatsapp/ordenesCiclo.excel').exportar({ cicloId: cy.id });
    const l = XLSX.read(oc.buffer, { type: 'buffer' }); assert.ok(XLSX.utils.sheet_to_json(l.Sheets.Procedencia).every(x => x['ID ciclo'] === cy.id && [d.a.nombre, d.b.nombre].includes(x.Cliente)));
    const detalle = await necesidad(cy.id); assert.ok(detalle.origenes.every(x => x.ciclo.id === cy.id));
  }
  assert.deepEqual(await huellas(), antes);
});
