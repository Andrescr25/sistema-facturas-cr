const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const XLSX = require('xlsx');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
const { AHORA_CR_SQL: AHORA } = require('../src/utils/fechaCR');

describe('historial de Reporte Clientes tras 24 h sin gestión — PostgreSQL y ROLLBACK', () => {
  let pool, db, servicio, cola, excel, cliente, producto, ruta;
  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_/);
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 1 });
    db = await pool.connect(); await db.query('BEGIN');
    const rutaDb = require.resolve('../config/database');
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db) };
    servicio = require('../src/modules/reports/reporteClientes.service');
    cola = require('../src/modules/reprinting/colaImpresion');
    excel = require('../src/modules/reports/report.excel');
    ruta = (await db.query("INSERT INTO ruta_cliente(nombre) VALUES ('ZZ Ruta historial') RETURNING id")).rows[0].id;
    cliente = (await db.query("INSERT INTO cliente(nombre,ruta_id,orden_ruta) VALUES ('ZZ Cliente historial',$1,1) RETURNING id", [ruta])).rows[0].id;
    producto = (await db.query("INSERT INTO producto(nombre,referencia) VALUES ('ZZ Producto historial','ZZ-HIST') RETURNING id")).rows[0].id;
  });
  beforeEach(async () => { await db.query('SAVEPOINT caso'); });
  afterEach(async () => { await db.query('ROLLBACK TO SAVEPOINT caso'); });
  after(async () => { if (db) { await db.query('ROLLBACK'); db.release(); } await pool?.end(); });

  async function factura({ envio = 30, procesada = false, procesadaHace = 26, ficha = cliente, gestion = 40 } = {}) {
    const id = (await db.query(`INSERT INTO factura
      (cliente_id,cliente_nombre,numero,fecha,estado,actualizado_en,creado_en)
      VALUES ($1,'ZZ Cliente historial',$2,'2026-10-01','emitida',${AHORA}-INTERVAL '72 hours',${AHORA}-INTERVAL '72 hours') RETURNING id`,
    [ficha, 'ZZ-' + randomUUID().slice(0, 8)])).rows[0].id;
    await db.query(`INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total)
      VALUES ($1,1,$2,'ZZ Producto historial',6,100,600)`, [id, producto]);
    const falta = (await db.query(`INSERT INTO faltantes
      (factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,created_at,updated_at)
      VALUES ($1,$2,3,'parcial',$3,${AHORA}-INTERVAL '48 hours',${AHORA}-$4*INTERVAL '1 hour') RETURNING id`,
    [id, producto, procesada ? 'procesado' : 'pendiente', gestion])).rows[0].id;
    await db.query(`INSERT INTO faltantes_ajustes(faltante_id,cantidad_entregada,estado,requiere_actualizacion,revisado,created_at,updated_at)
      VALUES ($1,0,'no_llego',true,true,${AHORA}-INTERVAL '48 hours',${AHORA}-INTERVAL '48 hours')`, [falta]);
    if (envio !== null) await db.query(`INSERT INTO facturas_reimpresion
      (factura_propia_id,estado,ajustes_realizados,fecha_creacion,fecha_procesamiento)
      VALUES ($1,$2,'[]'::jsonb,${AHORA}-$3*INTERVAL '1 hour',CASE WHEN $4 THEN ${AHORA}-$5*INTERVAL '1 hour' END)`,
    [id, procesada ? 'procesada' : 'pendiente', envio, procesada, procesadaHace]);
    return { id, falta };
  }
  async function leer(vista = 'activos', extras = {}) {
    const r = await servicio.getMissingItemsByClient({ rutaId: ruta, vista, ...extras });
    assert.equal(r.success, true, r.error); return r;
  }
  const ids = r => r.data.flatMap(c => c.facturas_con_faltantes.map(f => f.factura_id));
  const ficha = r => r.data.flatMap(c => c.facturas_con_faltantes)[0];

  test('sin envío no se archiva por antigua ni por estar revisada', async () => {
    const f = await factura({ envio: null });
    assert.deepEqual(ids(await leer()), [f.id]);
    assert.deepEqual(ids(await leer('historial')), []);
  });
  test('23 h 59 min 59 s activa; al cumplir exactamente 24 h va al historial', async () => {
    const f = await factura({ envio: 24 - 1 / 3600 });
    assert.deepEqual(ids(await leer()), [f.id]);
    await db.query(`UPDATE facturas_reimpresion SET fecha_creacion=${AHORA}-INTERVAL '24 hours' WHERE factura_propia_id=$1`, [f.id]);
    assert.deepEqual(ids(await leer()), []);
    const historial = await leer('historial');
    assert.deepEqual(ids(historial), [f.id]);
    assert.equal(ficha(historial).en_historial, true);
    assert.equal(ficha(historial).en_cola_impresion, true, 'archivar el reporte no saca de Impresión');
  });
  test('procesar es movimiento: cuenta desde impresión, no desde el primer envío', async () => {
    const f = await factura({ envio: 70, procesada: true, procesadaHace: 2, gestion: 2 });
    assert.deepEqual(ids(await leer()), [f.id]);
    assert.deepEqual(ids(await leer('historial')), []);
  });
  test('factura ya procesada y sin movimientos conserva ajustes y productos en historial', async () => {
    const f = await factura({ procesada: true });
    const historico = ficha(await leer('historial'));
    assert.equal(historico.factura_id, f.id);
    assert.equal(historico.estado_procesamiento, 'procesado');
    assert.equal(historico.productos_faltantes[0].cantidad_faltante, 3);
    assert.equal(historico.productos_faltantes[0].ajuste_estado, 'no_llego');
  });
  test('procesados antiguos sin fila de cola también conservan su historia', async () => {
    const f = await factura({ envio: null, procesada: true });
    assert.deepEqual(ids(await leer('historial')), [f.id]);
    assert.deepEqual(ids(await leer()), []);
  });
  test('un ajuste reciente de cualquier producto reinicia el plazo de toda la factura', async () => {
    const f = await factura();
    await db.query(`UPDATE faltantes_ajustes SET updated_at=${AHORA}-INTERVAL '2 hours' WHERE faltante_id=$1`, [f.falta]);
    assert.deepEqual(ids(await leer()), [f.id]);
    assert.deepEqual(ids(await leer('historial')), []);
    await db.query(`UPDATE faltantes_ajustes SET updated_at=${AHORA}-INTERVAL '25 hours' WHERE faltante_id=$1`, [f.falta]);
    assert.deepEqual(ids(await leer('historial')), [f.id]);
  });
  test('gestión en otra línea y cambio de factura también reinician 24 h', async () => {
    const f = await factura();
    await db.query(`INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,created_at,updated_at)
      VALUES ($1,$2,1,'parcial','pendiente',${AHORA}-INTERVAL '1 hour',${AHORA}-INTERVAL '1 hour')`, [f.id, producto]);
    assert.deepEqual(ids(await leer()), [f.id]);
    await db.query(`UPDATE faltantes SET created_at=${AHORA}-INTERVAL '40 hours',updated_at=${AHORA}-INTERVAL '40 hours' WHERE factura_propia_id=$1`, [f.id]);
    await db.query(`UPDATE factura SET actualizado_en=${AHORA}-INTERVAL '2 hours' WHERE id=$1`, [f.id]);
    assert.deepEqual(ids(await leer()), [f.id]);
  });
  test('cliente con vieja archivada y factura nueva se ve en ambas vistas sin mezclar documentos', async () => {
    const vieja = await factura(); const nueva = await factura({ envio: null });
    assert.deepEqual(ids(await leer()), [nueva.id]);
    assert.deepEqual(ids(await leer('historial')), [vieja.id]);
    assert.equal((await leer()).resumen.total_facturas_afectadas, 1);
  });
  const vencida = (e) => e.status === 409 && /24 horas/.test(e.message) && /nota de crédito/.test(e.message) && /factura nueva/.test(e.message);
  const enCola = async (id) => (await db.query(
    "SELECT count(*)::int n FROM facturas_reimpresion WHERE factura_propia_id=$1 AND estado='pendiente'", [id])).rows[0].n;

  test('en el historial ya no se recupera: 409, y la cola y los faltantes quedan como estaban', async () => {
    const f = await factura();
    assert.equal(ficha(await leer('historial')).puede_recuperar, false);
    await assert.rejects(cola.devolverAlReporte(f.id), vencida);
    assert.deepEqual(ids(await leer('historial')), [f.id]);
    assert.equal(await enCola(f.id), 1);
    assert.equal((await db.query("SELECT estado FROM faltantes WHERE id=$1", [f.falta])).rows[0].estado, 'pendiente');
  });
  test('en activos se recupera: la pendiente sale de la cola, sin borrar faltantes', async () => {
    const f = await factura({ envio: 2 });
    assert.equal(ficha(await leer()).puede_recuperar, true);
    const r = await cola.devolverAlReporte(f.id);
    assert.equal(r.sacada_de_la_cola, true);
    assert.equal(await enCola(f.id), 0);
    assert.deepEqual(ids(await leer()), [f.id]);
    assert.equal((await db.query('SELECT count(*)::int n FROM faltantes WHERE id=$1', [f.falta])).rows[0].n, 1);
  });
  test('impresa hace 24 h o más no se recupera, aunque una gestión reciente la tenga en activos', async () => {
    const f = await factura({ envio: 70, procesada: true, procesadaHace: 24, gestion: 2 });
    assert.deepEqual(ids(await leer()), [f.id]);
    assert.equal(ficha(await leer()).puede_recuperar, false);
    await assert.rejects(cola.devolverAlReporte(f.id), vencida);
    assert.equal((await db.query("SELECT estado FROM faltantes WHERE id=$1", [f.falta])).rows[0].estado, 'procesado');
  });
  test('a las 48 h en el historial sale de él (y del Excel), sin borrar nada', async () => {
    const f = await factura({ envio: 72 - 1 / 3600, gestion: 80 });
    // Toda gestión anterior al envío: el plazo lo marca el envío de hace 72 h.
    await db.query(`UPDATE faltantes SET created_at=${AHORA}-INTERVAL '80 hours' WHERE id=$1`, [f.falta]);
    await db.query(`UPDATE faltantes_ajustes SET created_at=${AHORA}-INTERVAL '80 hours',updated_at=${AHORA}-INTERVAL '80 hours' WHERE faltante_id=$1`, [f.falta]);
    const enHistorial = ficha(await leer('historial'));
    assert.equal(enHistorial.factura_id, f.id, 'a 1 s de cumplir 48 h sigue en el historial');
    assert.equal(enHistorial.sale_del_historial_en.getTime() - enHistorial.historial_desde.getTime(), 48 * 3600 * 1000);

    await db.query(`UPDATE facturas_reimpresion SET fecha_creacion=${AHORA}-INTERVAL '72 hours' WHERE factura_propia_id=$1`, [f.id]);
    assert.deepEqual(ids(await leer('historial')), []);
    assert.deepEqual(ids(await leer()), [], 'tampoco vuelve a activos');
    const archivo = await excel.exportarClientes({ vista: 'historial', clienteId: cliente, rutaId: ruta });
    assert.equal(XLSX.utils.sheet_to_json(XLSX.read(archivo.buffer).Sheets.Faltantes).length, 0);
    assert.equal(await enCola(f.id), 1, 'la cola de Impresión la sigue esperando');
    assert.equal((await db.query('SELECT count(*)::int n FROM faltantes WHERE id=$1', [f.falta])).rows[0].n, 1);
    assert.equal((await db.query('SELECT count(*)::int n FROM factura WHERE id=$1', [f.id])).rows[0].n, 1);
  });
  test('recuperar procesada de hace menos de 24 h conserva cola histórica, pero no la archiva sin reenviarla', async () => {
    const f = await factura({ envio: 70, procesada: true, procesadaHace: 2, gestion: 2 });
    await cola.devolverAlReporte(f.id);
    await db.query(`UPDATE faltantes SET updated_at=${AHORA}-INTERVAL '48 hours' WHERE id=$1`, [f.falta]);
    assert.deepEqual(ids(await leer()), [f.id]);
    assert.deepEqual(ids(await leer('historial')), []);
    await cola.encolarDesdeReporte(f.id);
    assert.deepEqual(ids(await leer()), [f.id]);
    assert.equal(ficha(await leer()).en_cola_impresion, true);
  });
  test('dos filas antiguas de cola no duplican productos; manda el envío más reciente', async () => {
    const f = await factura();
    await db.query(`INSERT INTO facturas_reimpresion(factura_propia_id,estado,ajustes_realizados,fecha_creacion)
      VALUES ($1,'pendiente','[]'::jsonb,${AHORA}-INTERVAL '1 hour')`, [f.id]);
    assert.deepEqual(ids(await leer()), [f.id]);
    assert.equal(ficha(await leer()).productos_faltantes.length, 1);
  });
  test('sesiones UTC y Costa Rica dan el mismo corte e instantes explícitos', async () => {
    await factura();
    await db.query("SET LOCAL TIME ZONE 'UTC'");
    const utc = ficha(await leer('historial'));
    await db.query("SET LOCAL TIME ZONE 'America/Costa_Rica'");
    const cr = ficha(await leer('historial'));
    assert.equal(utc.historial_desde.getTime(), cr.historial_desde.getTime());
    assert.equal(utc.ultima_gestion_en.getTime(), cr.ultima_gestion_en.getTime());
  });
  test('consultar repetidamente y descargar Excel no cambian las fechas ni los registros', async () => {
    const f = await factura();
    const huella = async () => (await db.query(`SELECT md5(jsonb_build_array(
      (SELECT to_jsonb(x) FROM factura x WHERE id=$1),
      (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM faltantes x WHERE factura_propia_id=$1),
      (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM facturas_reimpresion x WHERE factura_propia_id=$1),
      (SELECT to_jsonb(x) FROM faltantes_ajustes x WHERE faltante_id=$2))::text) h`, [f.id, f.falta])).rows[0].h;
    const antes = await huella();
    await leer(); await leer('historial'); await leer('historial');
    const archivo = await excel.exportarClientes({ vista: 'historial', clienteId: cliente, rutaId: ruta });
    const libro = XLSX.read(archivo.buffer, { type: 'buffer' });
    const filas = XLSX.utils.sheet_to_json(libro.Sheets.Faltantes);
    assert.equal(filas.length, 1);
    assert.equal(filas[0]['ID factura'], f.id);
    assert.ok(filas[0]['En historial desde']);
    assert.equal(await huella(), antes);
    const vacio = await excel.exportarClientes({ clienteId: cliente, rutaId: ruta });
    assert.equal(XLSX.utils.sheet_to_json(XLSX.read(vacio.buffer).Sheets.Faltantes).length, 0);
  });
  test('anuladas no aparecen y vista inválida falla sin devolver todo', async () => {
    const f = await factura();
    await db.query("UPDATE factura SET estado='anulada' WHERE id=$1", [f.id]);
    assert.deepEqual(ids(await leer()), []); assert.deepEqual(ids(await leer('historial')), []);
    for (const vista of ['todas', [], true, {}, 'HISTORIAL']) {
      const r = await servicio.getMissingItemsByClient({ vista });
      assert.equal(r.success, false); assert.equal(r.status, 400);
    }
  });
  test('ruta e identidad del cliente se conservan en historial', async () => {
    const f = await factura();
    const r = await leer('historial');
    assert.equal(r.data[0].id, cliente); assert.equal(r.data[0].ruta.id, ruta);
    assert.deepEqual(ids(await leer('historial', { rutaId: 2147483647 })), []);
    assert.equal(ficha(r).factura_id, f.id);
  });
  test('Impresión: el historial guarda TODAS las impresas, solo para ver; no se recupera ni se borra', async () => {
    // 2026-10-24: «que el historial sea solo para ver el PDF y no se borre nada».
    const impresion = require('../src/modules/reprinting/procesarImpresion');
    assert.equal(impresion.recuperarProcesada, undefined, 'Impresión ya no recupera');
    const nueva = await factura({ envio: 70, procesada: true, procesadaHace: 1 });
    const pasada48 = await factura({ envio: 70, procesada: true, procesadaHace: 49 });
    const pasada7d = await factura({ envio: 300, procesada: true, procesadaHace: 200 });
    // Una fila procesada vieja y repetida de la misma factura no la duplica.
    await db.query(`INSERT INTO facturas_reimpresion(factura_propia_id,estado,ajustes_realizados,fecha_creacion,fecha_procesamiento)
      VALUES ($1,'procesada','[]'::jsonb,${AHORA}-INTERVAL '400 hours',${AHORA}-INTERVAL '399 hours')`, [nueva.id]);

    const primera = await cola.listarProcesadas({ pagina: 1, limite: 200 });
    const todas = [...primera.data];
    for (let p = 2; p <= Math.ceil(primera.total / 200); p++) todas.push(...(await cola.listarProcesadas({ pagina: p, limite: 200 })).data);
    const nuestras = todas.filter((x) => [nueva.id, pasada48.id, pasada7d.id].includes(x.factura_id)).map((x) => x.factura_id);
    assert.deepEqual(nuestras, [nueva.id, pasada48.id, pasada7d.id], 'todas, una vez cada una, la más nueva primero');
    assert.equal(todas.length, primera.total);
    assert.equal(todas.some((x) => 'puede_recuperar' in x), false);

    const chica = await cola.listarProcesadas({ pagina: 1, limite: 1 });
    assert.equal(chica.data.length, 1);
    assert.equal(chica.paginacion.hayMas, primera.total > 1);
  });
});
