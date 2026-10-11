const { test } = require('node:test');
const assert = require('node:assert/strict');
const { periodo } = require('../scripts/independencia/lib/conciliacion-ventas');
const { normalizarNota, notaAlegra, leerBaseNotas, compararNotas, ejecutar } = require('../scripts/independencia/lib/conciliacion-notas-credito');
const p = periodo('2026-09-01', '2026-09-30');
const remota = (extra = {}) => ({ id: '700', date: p.desde, status: 'open', numberTemplate: { fullNumber: 'ZZ-700' },
  total: 113, totalApplied: 113, invoices: [{ id: '600', amount: 113 }], ...extra });
const fila = (extra = {}) => ({ id: 10, alegra_id: '700', fecha: p.desde, estado: 'emitida', numero: 'ZZ-700', total: '113.00', total_aplicado: '113.00',
  aplicaciones: [{ factura_id: 20, factura_alegra_id: '600', factura_moneda: 'CRC', monto: '113.00' }], ...extra });
const propia = (extra = {}) => normalizarNota(fila(extra));

test('nota y aplicaciones se comparan en centavos, por ids históricos explícitos', () => {
  const r = compararNotas([notaAlegra(remota())], [propia()], p);
  assert.equal(r.resumen.coinciden, 1); assert.deepEqual(r.diferencias, []); assert.deepEqual(r.incidencias, []);
  assert.equal(r.mensual[0].alegra.aplicado_a_facturas, 113);
});
test('acreditar otra factura se detecta aunque total, número y suma mensual coincidan', () => {
  const r = compararNotas([notaAlegra(remota())], [propia({ aplicaciones: [{ factura_id: 600, factura_alegra_id: '20', factura_moneda: 'CRC', monto: 113 }] })], p);
  assert.equal(r.mensual[0].diferencia_base_menos_alegra.aplicado_a_facturas, 0);
  assert.deepEqual(r.diferencias[0].cambios.map(c => c.campo), ['aplicaciones.alegra:600', 'aplicaciones.alegra:20']);
});
test('una nota repartida conserva cada monto y permite otro orden del detalle', () => {
  const a = notaAlegra(remota({ invoices: [{ id: '600', amount: 13 }, { id: '601', amount: 100 }] }));
  const b = propia({ aplicaciones: [{ factura_id: 21, factura_alegra_id: '601', factura_moneda: 'CRC', monto: 100 }, { factura_id: 20, factura_alegra_id: '600', factura_moneda: 'CRC', monto: 13 }] });
  assert.equal(compararNotas([a], [b], p).resumen.coinciden, 1);
  const cruzada = propia({ aplicaciones: [{ factura_id: 21, factura_alegra_id: '601', factura_moneda: 'CRC', monto: 13 }, { factura_id: 20, factura_alegra_id: '600', factura_moneda: 'CRC', monto: 100 }] });
  assert.equal(compararNotas([a], [cruzada], p).diferencias[0].cambios.length, 2);
});
test('faltantes y sobrantes no se compensan; notas nativas se cuentan separadas', () => {
  const r = compararNotas([notaAlegra(remota())], [propia({ alegra_id: '701' }), propia({ alegra_id: null })], p);
  assert.equal(r.resumen.faltan_en_base, 1); assert.equal(r.resumen.solo_en_base, 1); assert.equal(r.resumen.nativos_excluidos, 1);
  assert.equal(r.mensual[0].diferencia_base_menos_alegra.total, 0); assert.equal(r.mensual[0].base_nativa.total, 113);
});
test('notas anuladas y borradores tienen grupos separados, sin cambiar su detalle histórico', () => {
  const a = [notaAlegra(remota({ status: 'void' })), notaAlegra(remota({ id: '701', status: 'draft', totalApplied: 0, invoices: [] }))];
  const b = [propia({ estado: 'anulada' }), propia({ alegra_id: '701', estado: 'borrador', total_aplicado: 0, aplicaciones: [] })];
  const r = compararNotas(a, b, p);
  assert.equal(r.resumen.coinciden, 2); assert.deepEqual(r.mensual.map(m => m.estado), ['anulada', 'borrador']);
  assert.deepEqual(r.incidencias, []);
});
test('un cambio de fecha fuera del período conserva la comparación y sus incidencias', () => {
  const a = notaAlegra(remota({ date: '2026-08-31', invoices: [] }));
  const r = compararNotas([a], [propia()], p);
  assert.ok(r.diferencias[0].cambios.some(c => c.campo === 'fecha'));
  assert.equal(r.incidencias[0].fuente, 'alegra'); assert.equal(r.incidencias[0].diferencia, 113);
  assert.equal(r.mensual[0].alegra.documentos, 0); assert.equal(r.mensual[0].base_importada.documentos, 1);
});
test('crédito legítimo aún sin aplicar es una observación y permite una copia coincidente', () => {
  const a = notaAlegra(remota({ totalApplied: 0, invoices: undefined }));
  const b = propia({ total_aplicado: 0, aplicaciones: [] });
  const r = compararNotas([a], [b], p);
  assert.equal(r.resumen.coinciden, 1); assert.deepEqual(r.incidencias, []);
  assert.deepEqual(r.observaciones.map(o => o.monto), [113, 113]);
});
test('monto declarado sin destino individual impide certificar aunque ambas copias sean iguales', () => {
  const r = compararNotas([notaAlegra(remota({ invoices: undefined }))], [propia({ aplicaciones: [] })], p);
  assert.equal(r.resumen.coinciden, 1);
  assert.deepEqual(r.incidencias.map(i => i.tipo), ['aplicado_declarado_sin_respaldo_individual', 'aplicado_declarado_sin_respaldo_individual']);
  assert.equal(r.incidencias[0].declarado, 113); assert.equal(r.incidencias[0].aplicaciones, 0);
});
test('el exceso sobre el total y diferencias del declarado aparecen sin usar el saldo guardado', () => {
  const r = compararNotas([notaAlegra(remota({ totalApplied: 114, invoices: [{ id: '600', amount: 114 }] }))], [propia({ saldo: '999999' })], p);
  assert.ok(r.diferencias[0].cambios.some(c => c.campo === 'total_aplicado'));
  assert.equal(r.incidencias[0].tipo, 'aplicaciones_exceden_total');
});
test('un enlace perdido no se reconstruye por número; una aplicación importada a factura nativa se avisa', () => {
  const r = compararNotas([], [propia({ aplicaciones: [{ factura_id: null, factura_alegra_id: null, factura_numero: 'ZZ-600', monto: 113 }] }),
    propia({ alegra_id: '701', aplicaciones: [{ factura_id: 20, factura_alegra_id: null, factura_moneda: 'CRC', monto: 113 }] })], p);
  assert.deepEqual(r.incidencias.map(i => i.tipo), ['aplicacion_sin_factura_propia', 'aplicacion_importada_a_factura_nativa']);
});
test('una nota nativa a factura nativa no mezcla su id con Alegra ni genera un falso enlace perdido', () => {
  const r = compararNotas([], [propia({ alegra_id: null, aplicaciones: [{ factura_id: 600, factura_alegra_id: null, factura_moneda: 'CRC', monto: 113 }] })], p);
  assert.deepEqual(r.diferencias, []); assert.deepEqual(r.incidencias, []); assert.equal(r.resumen.nativos_excluidos, 1);
});
test('fechas, estados, moneda, montos, formas e ids inválidos abortan en lugar de inventar ceros', () => {
  for (const extra of [{ id: '' }, { id: false }, { date: '2026-02-30' }, { status: 'nuevo' }, { total: null }, { totalApplied: false },
    { currency: { code: 'USD' } }, { invoices: {} }, { invoices: [{ amount: 113 }] }, { invoices: [{ id: '600', amount: 0 }] },
    { invoices: [{ id: '600', amount: -1 }] }, { invoices: [{ id: '600', amount: 13 }, { id: '600', amount: 100 }] }]) assert.throws(() => notaAlegra(remota(extra)));
  assert.throws(() => propia({ alegra_id: '' }));
  assert.throws(() => compararNotas([], [propia({ aplicaciones: [{ factura_id: 20, factura_alegra_id: '600', factura_moneda: 'USD', monto: 113 }] })], p));
});
test('duplicar una nota o desbordar sumas en centavos no certifica el resultado', () => {
  assert.throws(() => compararNotas([notaAlegra(remota()), notaAlegra(remota())], [], p));
  const grande = propia({ total: 50000000000000, total_aplicado: 0, aplicaciones: [] });
  assert.throws(() => compararNotas([], [grande, { ...grande, id: 11, alegra_id: '701' }], p), /rango seguro/);
});
test('la foto exige READ ONLY y libera la conexión si falla la lectura o la validación', async () => {
  for (const falla of ['lectura', 'validacion']) {
    const llamadas = [];
    const pool = { connect: async () => ({ query: async sql => { llamadas.push(sql); if (sql.startsWith('SELECT')) { if (falla === 'lectura') throw new Error('zz'); return { rows: [fila({ total: null })] }; } return { rows: [] }; }, release: () => llamadas.push('release') }) };
    await assert.rejects(leerBaseNotas(pool));
    assert.match(llamadas[0], /REPEATABLE READ READ ONLY/); assert.deepEqual(llamadas.slice(-2), ['ROLLBACK', 'release']);
  }
});

function poolFalso(filas) { return { connect: async () => ({ query: async sql => ({ rows: sql.startsWith('SELECT n.') ? filas : [] }), release() {} }) }; }
function clienteFalso(notas, facturas = [{ id: '600', currency: { code: 'CRC' } }]) {
  let pagina = 0, debitos=0;
  return { get: async (ep) => ({ success: true, data: ep === '/credit-notes' ? (pagina++ === 0 ? notas : []) : ep.startsWith('/credit-notes/') ? notas.find(n => String(n.id) === ep.split('/').at(-1)) : ep==='/income-debit-notes' ? (debitos++===0?[{id:'901'}]:[]) : facturas }) };
}
test('flujo completo sigue tras página corta y verifica factura anterior al mes por su id', async () => {
  const llamadas = [], falso = clienteFalso([remota()]);
  const r = await ejecutar({ client: { get: async (ep, params) => { llamadas.push({ ep, params }); return falso.get(ep, params); } }, pool: poolFalso([fila()]), p });
  assert.equal(r.sin_diferencias, true); assert.equal(r.destinos.facturas_referidas, 1);
  assert.deepEqual(llamadas.map(c => c.params.start), [0, 1, undefined]);
  assert.deepEqual(llamadas.at(-1), { ep: '/invoices', params: { id: '600' } });
  assert.match(r.alcance, /ACTUALES/);
});
test('flujo distingue crédito disponible de detalle ausente y de factura destino desaparecida', async () => {
  const disponible = await ejecutar({ client: clienteFalso([remota({ totalApplied: 0, invoices: [] })]), pool: poolFalso([fila({ total_aplicado: 0, aplicaciones: [] })]), p });
  assert.equal(disponible.sin_diferencias, true); assert.equal(disponible.notas.observaciones.length, 2);
  const sinDetalle = await ejecutar({ client: clienteFalso([remota({ invoices: undefined })]), pool: poolFalso([fila({ aplicaciones: [] })]), p });
  assert.equal(sinDetalle.sin_diferencias, false); assert.equal(sinDetalle.notas.incidencias.length, 2);
  const sinFactura = await ejecutar({ client: clienteFalso([remota()], []), pool: poolFalso([fila()]), p });
  assert.equal(sinFactura.sin_diferencias, false); assert.equal(sinFactura.notas.incidencias[0].tipo, 'factura_destino_ausente_en_alegra');
});
test('un fallo del listado o de los destinos y una factura extranjera abortan el flujo', async () => {
  await assert.rejects(ejecutar({ client: { get: async () => ({ success: false, status: 403 }) }, pool: poolFalso([]), p }));
  await assert.rejects(ejecutar({ client: clienteFalso([remota()], [{ id: '600', currency: { code: 'USD' } }]), pool: poolFalso([fila()]), p }));
  let llamada = 0;
  await assert.rejects(ejecutar({ client: { get: async () => (++llamada < 3 ? { success: true, data: llamada === 1 ? [remota()] : [] } : { success: false, status: 403 }) }, pool: poolFalso([fila()]), p }));
});
test('pares con fecha cambiada fuera del tramo siguen incluyendo sus facturas destino', async () => {
  const r = await ejecutar({ client: clienteFalso([remota({ date: '2026-08-31' })]), pool: poolFalso([fila()]), p });
  assert.equal(r.sin_diferencias, false); assert.equal(r.destinos.facturas_referidas, 1);
  assert.equal(r.notas.diferencias[0].cambios[0].campo, 'fecha');
});
test('la ficha individual descubre el destino a nota de débito que el listado omite', async () => {
  const notas = [remota({ invoices: undefined })], falso = clienteFalso(notas);
  const client = { get: async (ep, params) => ep.startsWith('/credit-notes/') ? { success: true, data: { ...notas[0], incomeDebitNotes: [{ id: '901', amount: 113 }] } } : falso.get(ep, params) };
  const r = await ejecutar({ client, pool: poolFalso([fila({ aplicaciones: [] })]), p });
  assert.equal(r.sin_diferencias, false); assert.equal(r.notas.resumen.datos_distintos, 1);
  assert.deepEqual(r.notas.incidencias.map(i => i.tipo), ['aplicado_declarado_sin_respaldo_individual']);
  assert.equal(r.destinos.debitos_referidos,1);
  assert.equal(r.notas.mensual[0].alegra.aplicado_a_otros_documentos, 113);
});
test('el débito acreditado se compara por su id externo y no por su serial o un id de factura', async()=>{
  const a=remota({invoices:[],incomeDebitNotes:[{id:'901',amount:113}]});
  const b=fila({aplicaciones:[],otros_destinos:[{clase:'nota_debito_ingreso',alegra_id:'901',id_propio:600,moneda:'CRC',monto:113}]});
  const r=await ejecutar({client:clienteFalso([a]),pool:poolFalso([b]),p});
  assert.equal(r.sin_diferencias,true);assert.equal(r.destinos.debitos_encontrados,1);
  assert.equal(r.notas.resumen.coinciden,1);
  const mal=compararNotas([notaAlegra(a)],[propia({aplicaciones:[],otros_destinos:[{clase:'nota_debito_ingreso',alegra_id:'600',id_propio:901,moneda:'CRC',monto:113}]})],p);
  assert.equal(mal.diferencias[0].cambios[0].campo,'otros_destinos');
});
test('débito destino desaparecido, falta de vínculo propio y moneda extranjera se señalan',async()=>{
  const a=remota({invoices:[],incomeDebitNotes:[{id:'901',amount:113}]});
  const falso=clienteFalso([a]);
  const r=await ejecutar({client:{get:(ep,params)=>ep==='/income-debit-notes'?Promise.resolve({success:true,data:[]}):falso.get(ep,params)},pool:poolFalso([]),p});
  assert.equal(r.sin_diferencias,false);assert.equal(r.notas.incidencias[0].tipo,'debito_destino_ausente_en_alegra');
  const invalida=propia({aplicaciones:[],otros_destinos:[{clase:'nota_debito_ingreso',alegra_id:'901',monto:113}]});
  assert.equal(compararNotas([], [invalida], p).incidencias[0].tipo,'aplicacion_sin_debito_propio');
  assert.throws(()=>compararNotas([], [propia({aplicaciones:[],otros_destinos:[{clase:'nota_debito_ingreso',alegra_id:'901',id_propio:5,moneda:'USD',monto:113}]})], p));
});
test('detalle individual fallido, ajeno o modificado impide certificar datos mezclados', async () => {
  for (const respuesta of [{ success: false, status: 403 }, { success: true, data: [] }, { success: true, data: remota({ id: 'otro' }) }, { success: true, data: remota({ total: 114 }) }]) {
    const falso = clienteFalso([remota({ invoices: [] })]);
    await assert.rejects(ejecutar({ client: { get: async (ep, params) => ep.startsWith('/credit-notes/') ? respuesta : falso.get(ep, params) }, pool: poolFalso([fila()]), p }));
  }
  assert.throws(() => notaAlegra(remota({ incomeDebitNotes: {} })));
  assert.throws(() => notaAlegra(remota({ incomeDebitNotes: [{ id: '901', amount: null }] })));
});

test('PostgreSQL real: conserva notas, enlaces, facturas y numeradores y enlaza por el FK real', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, async () => {
  const { pool } = require('../config/database');
  const huella = async () => (await pool.query(`SELECT
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM nota_credito d) AS notas,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM nota_credito_factura d) AS enlaces,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM debito_ingreso_historico d) AS debitos,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM nota_credito_debito_ingreso d) AS creditos_debito,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.id),'')) FROM factura d) AS facturas,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.serie),'')) FROM serie_consecutivo d) AS series,
    (SELECT md5(COALESCE(string_agg(row_to_json(d)::text,'' ORDER BY d.sequencename),'')) FROM pg_sequences d
      WHERE d.schemaname='public' AND d.sequencename IN ('nota_credito_id_seq','nota_credito_factura_id_seq','factura_id_seq','debito_ingreso_historico_id_seq','nota_credito_debito_ingreso_id_seq')) AS secuencias`)).rows[0];
  try {
    const antes = await huella(), notas = await leerBaseNotas(pool);
    assert.ok(notas.length > 0); assert.deepEqual(await huella(), antes);
    const enlaces = (await pool.query(`SELECT nf.nota_credito_id, nf.factura_id, f.alegra_id, nf.monto
      FROM nota_credito_factura nf JOIN factura f ON f.id=nf.factura_id ORDER BY nf.id`)).rows;
    assert.ok(enlaces.some(e => String(e.factura_id) !== e.alegra_id), 'espacios de ids diferentes en la copia');
    for (const e of enlaces) {
      const app = notas.find(n => n.id === e.nota_credito_id).aplicaciones.find(a => a.factura_id === e.factura_id);
      assert.equal(app.factura_alegra_id, e.alegra_id); assert.equal(app.monto, Math.round(Number(e.monto) * 100));
    }
    // Intentar escribir DENTRO del mismo lector comprueba la guarda SQL real;
    // PostgreSQL rechaza el UPDATE antes de modificar una fila.
    const client = await pool.connect();
    try {
      await assert.rejects(leerBaseNotas({ connect: async () => ({ query: async sql => {
        if (sql.startsWith('SELECT n.')) await client.query('UPDATE nota_credito SET total=total WHERE false');
        return client.query(sql);
      }, release() {} }) }), e => e.code === '25006');
    } finally { client.release(); }
    assert.deepEqual(await huella(), antes);
  } finally { await pool.end(); }
});
