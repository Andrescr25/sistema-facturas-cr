const { test } = require('node:test');
const assert = require('node:assert/strict');
const { periodo, normalizarBase, normalizarAlegra, leerPaginas, leerBase, conciliar } = require('../scripts/independencia/lib/conciliacion-ventas');
const { argumentos, ejecutar, mensajeSeguro } = require('../scripts/independencia/conciliar-ventas');
const p = periodo('2026-09-01', '2026-09-30');
// Fichas sintéticas. Ninguna lectura de red ni factura de negocio en la suite.
const remota = (id = '900', extra = {}) => ({
  id, date: p.desde, status: 'closed', numberTemplate: { fullNumber: `ZZ-${id}`, documentType: 'invoice' },
  subtotal: 100, discount: 0, tax: 13, total: 113,
  items: [{ id: '800', quantity: 1, price: 100, discount: 0, total: 113, tax: [{ percentage: 13, amount: 13 }] }], ...extra
});
const a = (id, extra) => normalizarAlegra(remota(id, extra), 'factura');
const propia = (d, extra = {}) => ({ ...d, id: 1, ...extra });

test('fechas inclusivas reales, orden y argumentos completos antes de abrir conexiones', () => {
  for (const [desde, hasta] of [['2026-02-30', '2026-03-01'], ['2026-13-01', '2026-13-02'], ['2026-09-30', '2026-09-01'], [undefined, undefined]]) assert.throws(() => periodo(desde, hasta));
  assert.deepEqual(periodo('2024-02-29', '2024-02-29'), { desde: '2024-02-29', hasta: '2024-02-29' });
  assert.throws(() => argumentos(['--desde=2026-09-01', '--hasta=2026-09-30']));
  assert.throws(() => argumentos(['--desde=2026-09-01', '--hasta=2026-09-30', '--salida=secreto.json']));
  assert.throws(() => argumentos(['--desde=2026-09-01', '--hasta=2026-09-30', '--salida=/tmp/zz.json', '--desde=2026-09-02']));
});

test('el emparejamiento es por alegra_id aunque el id propio coincida con otro remoto', () => {
  const d = a('900');
  const r = conciliar([d], [propia(d, { id: 77 }), propia(a('77'), { id: 900 })], p);
  assert.equal(r.resumen.coinciden, 1);
  assert.equal(r.resumen.solo_en_base, 1);
  assert.equal(r.diferencias[0].alegra_id, '77');
});

test('faltante remoto y sobrante local con el mismo total no se compensan', () => {
  const r = conciliar([a('900')], [propia(a('901'))], p);
  assert.equal(r.mensual[0].diferencia_base_menos_alegra.total, 0);
  assert.equal(r.sin_diferencias, false);
  assert.equal(r.resumen.faltan_en_base, 1);
  assert.equal(r.resumen.solo_en_base, 1);
});

test('documentos nativos se cuentan aparte y jamás se buscan en Alegra', () => {
  const r = conciliar([], [propia(a(), { alegra_id: null })], p);
  assert.equal(r.sin_diferencias, true);
  assert.equal(r.resumen.nativos_excluidos, 1);
  assert.equal(r.mensual[0].base_nativa.total, 113);
  assert.equal(r.mensual[0].diferencia_base_menos_alegra.total, 0);
});

test('borradores, anuladas, tiquetes, notas y monedas quedan en grupos distintos', () => {
  const docs = [a(), a('901', { status: 'draft' }), a('902', { status: 'void' }), a('903', { numberTemplate: { documentType: 'saleTicket' } }), a('904', { currency: { code: 'USD' } }), normalizarAlegra(remota('905'), 'nota_credito')];
  const r = conciliar(docs, docs.map(d => propia(d)), p);
  assert.equal(r.resumen.coinciden, 6);
  assert.equal(r.mensual.length, 6);
  assert.equal(r.mensual.filter(m => m.estado === 'emitida' && m.tipo_documento === 'factura' && m.moneda === 'CRC')[0].alegra.total, 113);
});

test('una fecha movida fuera del período sigue siendo diferencia del mismo documento', () => {
  const d = a();
  const r = conciliar([d], [propia(d, { fecha: '2026-08-31' })], p);
  assert.equal(r.diferencias[0].tipo, 'datos_distintos');
  assert.equal(r.diferencias[0].cambios[0].campo, 'fecha');
});

test('líneas e IVA diferentes se detectan aun cuando la cabecera coincide', () => {
  const d = a(), b = propia(d, { lineas: d.lineas.map(l => ({ ...l, cantidad: 20000, tarifa: 4000, impuesto_monto: 400 })) });
  const r = conciliar([d], [b], p);
  assert.deepEqual(r.diferencias[0].cambios.map(c => c.campo), ['lineas.1.cantidad', 'lineas.1.tarifa', 'lineas.1.impuesto_monto']);
  assert.equal(r.diferencias[0].cambios[0].base, 2);
  assert.equal(r.mensual[0].diferencia_base_menos_alegra.total, 0);
});

test('precisión de PostgreSQL: centavos exactos y cantidad/precio con sus escalas', () => {
  const d = a('900', { subtotal: 0.1, tax: 0.2, total: 0.3 });
  const b = normalizarBase({ ...d, subtotal: '0.10', descuento: '0.00', impuesto: '0.20', total: '0.30', lineas: [{ numero_linea: 1, alegra_item_id: '800', cantidad: '1.0000', precio_unitario: '100.00000', descuento_porcentaje: '0.000', descuento_monto: '0.00', tarifa: '13.000', impuesto_monto: '13.00', total: '113.00' }] });
  assert.equal(conciliar([d], [b], p).sin_diferencias, true);
  const r = conciliar([d, a('901', { total: 0.2 })], [], p);
  assert.equal(r.mensual[0].alegra.total, 0.5);
});

test('un total ausente, un estado nuevo o un impuesto no representable no pasa como cero', () => {
  for (const extra of [{ total: null }, { total: '' }, { total: NaN }, { total: false }, { total: [] }, { status: 'nuevo' }, { items: undefined }, { date: '2026-02-30' }, { items: [{ quantity: 1, price: 1, discount: 0, total: 1, tax: [{ percentage: 1, amount: 1 }, { percentage: 2, amount: 2 }] }] }]) assert.throws(() => a('900', extra));
  assert.throws(() => normalizarAlegra(remota('900', { currency: { code: 'USD' } }), 'nota_credito'));
  assert.throws(() => conciliar([a(), a()], [], p));
});

test('los errores internos no filtran configuración y los argumentos sí explican qué corregir', () => {
  const interno = Object.assign(new Error('zz credencial que no debe salir'), { config: { auth: { password: 'zz' } } });
  assert.doesNotMatch(mensajeSeguro(interno), /credencial|password|zz/);
  assert.match(mensajeSeguro(Object.assign(new Error('zz'), { code: 'EEXIST' })), /ya existe/);
  try { argumentos([]); } catch (e) { assert.match(mensajeSeguro(e), /Período inválido/); }
});

test('paginación usa solo GET, incluye páginas cortas y acaba con página vacía', async () => {
  const llamadas = [], paginas = [[{ id: '1' }], [{ id: '2' }], []];
  const docs = await leerPaginas({ get: async (endpoint, params) => { llamadas.push({ endpoint, params }); return { success: true, data: paginas.shift() }; } }, '/invoices');
  assert.equal(docs.length, 2);
  assert.deepEqual(llamadas.map(c => c.params.start), [0, 1, 2]);
});

test('página fallida, forma inválida o ids repetidos impiden certificar una copia parcial', async () => {
  for (const respuesta of [{ success: false }, { success: true, data: { data: [] } }, { success: true, data: [{ id: '1' }, { id: '1' }] }, { success: true, data: [{}] }]) await assert.rejects(leerPaginas({ get: async () => respuesta }, '/invoices'));
});

test('la instantánea de base exige READ ONLY y libera la conexión incluso al fallar', async () => {
  const llamadas = [];
  const client = { query: async (sql) => { llamadas.push(sql); if (/^SELECT/.test(sql)) throw new Error('zz lectura fallida'); return { rows: [] }; }, release: () => llamadas.push('release') };
  await assert.rejects(leerBase({ connect: async () => client }, p, {}));
  assert.match(llamadas[0], /REPEATABLE READ READ ONLY/);
  assert.deepEqual(llamadas.slice(-2), ['ROLLBACK', 'release']);
});

test('el flujo consulta ids locales ausentes para detectar cambios de fecha remotos', async () => {
  const llamadas = [], d = remota('900', { date: '2026-08-31' });
  const propiaSinEscalar = { ...d, alegra_id: '900', clase: 'factura', tipo_documento: 'factura', fecha: p.desde, estado: 'emitida', moneda: 'CRC', numero: 'ZZ-900', electronica: false, clave_hacienda: null, descuento: 0, impuesto: 13, lineas: [] };
  const pool = { connect: async () => ({ query: async (sql) => ({ rows: sql.includes('FROM factura d') ? [propiaSinEscalar] : [] }), release() {} }) };
  const client = { get: async (ep, params) => { llamadas.push({ ep, params }); return { success: true, data: params.id ? [d] : [] }; } };
  const r = await ejecutar({ client, pool, p });
  assert.equal(r.resumen.datos_distintos, 1);
  assert.equal(r.diferencias[0].cambios[0].campo, 'fecha');
  assert.deepEqual(llamadas.at(-1), { ep: '/invoices', params: { id: '900' } });
  assert.equal(llamadas[0].params.date_afterOrNow, p.desde);
  assert.equal(llamadas[0].params.date_beforeOrNow, p.hasta);
});

test('un filtro de fechas ignorado nunca genera un informe válido', async () => {
  let n = 0;
  await assert.rejects(ejecutar({ client: { get: async () => ({ success: true, data: n++ === 0 ? [remota('900', { date: '2026-08-31' })] : [] }) }, pool: { connect: async () => { throw new Error('No debe consultar'); } }, p }), /ignoró el filtro/);
});

test('PostgreSQL real: lectura coherente, sin cambios en tablas ni secuencias', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, async () => {
  const { pool } = require('../config/database');
  const huella = async () => (await pool.query(`SELECT
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text, '' ORDER BY d.id), '')) FROM factura d) AS facturas,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text, '' ORDER BY d.id), '')) FROM factura_linea d) AS lineas,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text, '' ORDER BY d.id), '')) FROM nota_credito d) AS notas,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text, '' ORDER BY d.id), '')) FROM nota_credito_linea d) AS lineas_notas,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text, '' ORDER BY d.serie), '')) FROM serie_consecutivo d) AS series,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text, '' ORDER BY d.sequencename), '')) FROM pg_sequences d
      WHERE d.schemaname='public' AND d.sequencename IN ('factura_id_seq','factura_linea_id_seq','nota_credito_id_seq','nota_credito_linea_id_seq')) AS secuencias`)).rows[0];
  try {
    const antes = await huella();
    const docs = await leerBase(pool, p, {});
    assert.ok(docs.length > 0);
    assert.ok(docs.every(d => typeof d.fecha === 'string' && Array.isArray(d.lineas)));
    assert.deepEqual(await huella(), antes);
    const client = await pool.connect();
    try {
      await client.query('BEGIN TRANSACTION READ ONLY');
      await assert.rejects(client.query("UPDATE factura SET total=total WHERE false"), e => e.code === '25006');
    } finally { await client.query('ROLLBACK'); client.release(); }
  } finally { await pool.end(); }
});
