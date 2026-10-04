/**
 * Cobros importados y su destino, por ids históricos explícitos. Un monto
 * bien copiado aplicado a OTRA factura deja una deuda falsa; por eso no basta
 * comparar el total del recibo ni las sumas mensuales.
 */
const { ErrorConciliacion, periodo, fechaValida, escalado, leerPaginas } = require('./conciliacion-ventas');
const { COBRADO, ACREDITADO } = require('../../../src/modules/facturacion/saldo.sql');
const { ESTADOS } = require('../../../src/modules/facturacion/desdeAlegra');
const centavos = (v, campo = 'monto') => escalado(v, 2, campo);
const texto = v => v == null || String(v).trim() === '' ? null : String(v).trim();
const dentro = (d, p) => d.fecha >= p.desde && d.fecha <= p.hasta;

/** Reintentos acotados SOLO de GET; nunca repetir errores de datos o acceso. */
async function getLectura(client, endpoint, params, avisar = () => {}, esperar = ms => new Promise(r => setTimeout(r, ms))) {
  let efectivos = { ...params };
  for (let intento = 0; intento < 3; intento++) {
    const r = await client.get(endpoint, efectivos);
    if (r?.success) return r;
    const timeout = /timeout|ECONNABORTED|ETIMEDOUT|ECONNRESET/i.test(r?.error || '');
    const limite = r?.status === 429 || Number(r?.data?.code) === 429;
    const transitorio = timeout || limite || [500, 502, 503, 504].includes(r?.status);
    if (!transitorio || intento === 2) return r;
    // Una página que tarda 30 s con diez recibos puede responder con cinco.
    // Conserva el MISMO offset; leerCobros avanza por filas recibidas.
    if (timeout && endpoint === '/payments' && !efectivos.id && efectivos.limit > 5) efectivos = { ...efectivos, limit: 5 };
    const reset = Number(r?.data?.headers?.['x-rate-limit-reset']) || 0;
    const espera = limite && reset > 0 ? Math.min(reset + 1, 59) * 1000 : (intento + 1) * 1000;
    avisar(`Reintento GET ${endpoint} ${intento + 1}/2 en ${espera / 1000}s`);
    await esperar(espera);
  }
}

function normalizarCobro(d) {
  if (!fechaValida(d.fecha) || typeof d.anulado !== 'boolean' || !Array.isArray(d.aplicaciones)) throw new ErrorConciliacion('Cobro con fecha, estado o aplicaciones inválidos.');
  if (d.alegra_id != null && !texto(d.alegra_id)) throw new ErrorConciliacion('Id de Alegra vacío en un cobro propio.');
  const aplicaciones = d.aplicaciones.map(a => ({ factura_alegra_id: texto(a.factura_alegra_id), factura_id: a.factura_id ?? null, monto: centavos(a.monto) }));
  return { ...d, alegra_id: texto(d.alegra_id), numero: texto(d.numero), monto: centavos(d.monto), cliente_alegra_id: texto(d.cliente_alegra_id), cuenta_alegra_id: texto(d.cuenta_alegra_id), metodo: texto(d.metodo)?.toLowerCase() || null, aplicaciones };
}

function cobroAlegra(d) {
  if (!d || !texto(d.id) || d.type !== 'in' || !['open', 'closed', 'void'].includes(d.status) || !Array.isArray(d.invoices)) throw new ErrorConciliacion('Respuesta inválida de cobros de Alegra.');
  // pago no tiene columna moneda. No sumar un recibo extranjero como colones.
  if ((d.currency?.code || 'CRC') !== 'CRC') throw new ErrorConciliacion('Cobro extranjero: pago aún no guarda moneda.');
  for (const a of d.invoices) if (!texto(a.id)) throw new ErrorConciliacion('Aplicación de Alegra sin id de factura.');
  if (new Set(d.invoices.map(a => String(a.id))).size !== d.invoices.length) throw new ErrorConciliacion('Aplicación de Alegra repetida: la copia actual no la representa.');
  return normalizarCobro({ alegra_id: String(d.id), numero: d.number, fecha: d.date, monto: d.amount, anulado: d.status === 'void', cliente_alegra_id: d.client?.id, cuenta_alegra_id: d.bankAccount?.id, metodo: d.paymentMethod, aplicaciones: d.invoices.map(a => ({ factura_alegra_id: String(a.id), monto: a.amount })) });
}

/**
 * /payments no documenta rango de fechas. Leer descendiendo por fecha hasta
 * cruzar el inicio, validando el orden, cubre todo el tramo sin inventar un
 * filtro ni entrar en los offsets profundos que suelen agotar el timeout.
 */
async function leerCobros(client, p, avisar = () => {}) {
  periodo(p.desde, p.hasta);
  const docs = [], ids = new Set(); let start = 0, anterior = '9999-12-31';
  for (let pagina = 0; pagina < 5000; pagina++) {
    const r = await client.get('/payments', { type: 'in', start, limit: 10, order_field: 'date', order_direction: 'DESC' });
    if (!r?.success || !Array.isArray(r.data)) throw new ErrorConciliacion(`Lectura incompleta de cobros, página ${pagina + 1}.`);
    if (!r.data.length) return docs;
    for (const d of r.data) {
      const c = cobroAlegra(d);
      if (ids.has(c.alegra_id) || c.fecha > anterior) throw new ErrorConciliacion('Paginación de cobros repetida o fuera de orden. Repetir con Alegra sin cambios.');
      ids.add(c.alegra_id); anterior = c.fecha;
      if (dentro(c, p)) docs.push(c);
    }
    start += r.data.length; avisar(`Cobros: ${start} leídos; ${docs.length} en el tramo`);
    if (anterior < p.desde) return docs;
  }
  throw new ErrorConciliacion('Demasiadas páginas de cobros; lectura incompleta.');
}

/** Solo GET, en lotes documentados de 30 ids; nunca unir por número o nombre. */
async function porIds(client, endpoint, ids) {
  const docs = [], vistos = new Set();
  for (let i = 0; i < ids.length; i += 30) {
    const lote = ids.slice(i, i + 30), r = await client.get(endpoint, { id: lote.join(',') });
    if (!r?.success || !Array.isArray(r.data)) throw new ErrorConciliacion(`No se pudieron verificar ids en ${endpoint}.`);
    for (const d of r.data) {
      if (!texto(d?.id) || !lote.includes(String(d.id)) || vistos.has(String(d.id))) throw new ErrorConciliacion(`Respuesta de ids inválida en ${endpoint}.`);
      vistos.add(String(d.id)); docs.push(d);
    }
  }
  return docs;
}

async function leerBaseCobros(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    // Encabezados sin datos personales. Leer la foto local completa permite
    // conservar pares que cambiaron de fecha y obtener todos los saldos de
    // las facturas referidas, aunque se emitieran antes del tramo.
    const pagos = await client.query(`SELECT p.id, p.alegra_id, p.numero, p.fecha::text AS fecha, p.monto, p.anulado,
      cl.alegra_id AS cliente_alegra_id, cu.alegra_id AS cuenta_alegra_id,
      COALESCE(m.alegra_clave, p.metodo_pago_texto) AS metodo,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('factura_id', pf.factura_id, 'factura_alegra_id', f.alegra_id,
        'monto', pf.monto) ORDER BY pf.id) FROM pago_factura pf LEFT JOIN factura f ON f.id=pf.factura_id WHERE pf.pago_id=p.id), '[]'::jsonb) AS aplicaciones
      FROM pago p LEFT JOIN cliente cl ON cl.id=p.cliente_id LEFT JOIN cuenta_dinero cu ON cu.id=p.cuenta_dinero_id
      LEFT JOIN metodo_pago m ON m.id=p.metodo_pago_id ORDER BY p.id`);
    const facturas = await client.query(`SELECT f.id, f.alegra_id, f.numero, f.fecha::text AS fecha, f.estado, f.moneda, f.total,
      ${COBRADO} AS cobrado, ${ACREDITADO} AS acreditado,
      GREATEST(0, f.total - ${COBRADO} - ${ACREDITADO}) AS saldo_calculado,
      COALESCE((SELECT SUM(pf.monto) FROM pago_factura pf JOIN pago p ON p.id=pf.pago_id
        WHERE pf.factura_id=f.id AND NOT p.anulado AND p.alegra_id IS NULL),0) AS cobrado_nativo
      FROM factura f ORDER BY f.id`);
    await client.query('COMMIT');
    return { cobros: pagos.rows.map(normalizarCobro), facturas: facturas.rows };
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

function mapaUnico(docs, campo) {
  const mapa = new Map();
  for (const d of docs) {
    const id = texto(d[campo]);
    if (!id || mapa.has(id)) throw new ErrorConciliacion('Id ausente o repetido en la conciliación.');
    mapa.set(id, d);
  }
  return mapa;
}

function compararCobros(alegra, propios, p) {
  const a = mapaUnico(alegra, 'alegra_id'), b = mapaUnico(propios.filter(d => d.alegra_id != null), 'alegra_id');
  const diferencias = [], incidencias = [], mensual = new Map(); let coinciden = 0;
  const aplicaciones = d => new Map(d.aplicaciones.map((a, i) => [a.factura_alegra_id || `sin_enlace:${i}`, a.monto]));
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const da = a.get(id), db = b.get(id), d = da || db;
    if (!((da && dentro(da, p)) || (db && dentro(db, p)))) continue;
    const cambios = [];
    if (da && db) {
      for (const campo of ['fecha', 'numero', 'monto', 'anulado', 'cliente_alegra_id', 'cuenta_alegra_id', 'metodo']) {
        if (da[campo] !== db[campo]) cambios.push({ campo, alegra: campo === 'monto' ? da[campo] / 100 : da[campo], base: campo === 'monto' ? db[campo] / 100 : db[campo] });
      }
      const aa = aplicaciones(da), ab = aplicaciones(db);
      for (const f of new Set([...aa.keys(), ...ab.keys()])) if (aa.get(f) !== ab.get(f)) cambios.push({ campo: `aplicaciones.${f}`, alegra: aa.has(f) ? aa.get(f) / 100 : null, base: ab.has(f) ? ab.get(f) / 100 : null });
    }
    if (!da || !db || cambios.length) diferencias.push({ alegra_id: id, id_propio: db?.id || null, numero: d.numero, tipo: !db ? 'falta_en_base' : !da ? 'solo_en_base' : 'datos_distintos', cambios });
    else coinciden++;
  }
  for (const [fuente, docs] of [['alegra', alegra], ['base_importada', propios.filter(d => d.alegra_id != null)], ['base_nativa', propios.filter(d => d.alegra_id == null)]]) {
    for (const d of docs.filter(d => dentro(d, p))) {
      const aplicado = d.aplicaciones.reduce((s,a) => s+a.monto, 0);
      if (!Number.isSafeInteger(aplicado)) throw new ErrorConciliacion('Suma de aplicaciones fuera del rango seguro.');
      if (aplicado !== d.monto) incidencias.push({ fuente, alegra_id: d.alegra_id, id_propio: d.id || null, tipo: 'monto_sin_aplicar_o_excedido', diferencia: (d.monto-aplicado)/100 });
      if (fuente !== 'alegra' && d.aplicaciones.some(a => a.factura_id == null)) incidencias.push({ fuente, alegra_id: d.alegra_id, id_propio: d.id || null, tipo: 'aplicacion_sin_factura_propia' });
      const mes = d.fecha.slice(0,7), estado = d.anulado ? 'anulado' : 'vigente', clave = `${mes}:${estado}`;
      if (!mensual.has(clave)) mensual.set(clave, { mes, estado, moneda: 'CRC', alegra: { documentos: 0, monto: 0 }, base_importada: { documentos: 0, monto: 0 }, base_nativa: { documentos: 0, monto: 0 } });
      const grupo = mensual.get(clave)[fuente]; grupo.documentos++; grupo.monto += d.monto;
      if (!Number.isSafeInteger(grupo.monto)) throw new ErrorConciliacion('Suma mensual de cobros fuera del rango seguro.');
    }
  }
  const meses = [...mensual.values()].sort((a,b) => `${a.mes}:${a.estado}`.localeCompare(`${b.mes}:${b.estado}`));
  for (const m of meses) {
    m.diferencia_base_menos_alegra = { documentos: m.base_importada.documentos-m.alegra.documentos, monto: (m.base_importada.monto-m.alegra.monto)/100 };
    for (const f of ['alegra','base_importada','base_nativa']) m[f].monto /= 100;
  }
  return { resumen: { coinciden, faltan_en_base: diferencias.filter(d => d.tipo==='falta_en_base').length, solo_en_base: diferencias.filter(d => d.tipo==='solo_en_base').length, datos_distintos: diferencias.filter(d => d.tipo==='datos_distintos').length, nativos_excluidos: propios.filter(d => d.alegra_id == null && dentro(d,p)).length }, mensual: meses, diferencias, incidencias };
}

function compararSaldos(remotas, propias, ids) {
  const a = mapaUnico(remotas, 'id'), b = mapaUnico(propias.filter(d => d.alegra_id != null), 'alegra_id');
  const diferencias = []; let coinciden = 0, noCobrables = 0;
  for (const id of ids) {
    const da = a.get(id), db = b.get(id);
    if ((da && (da.currency?.code || 'CRC') !== 'CRC') || (db && db.moneda.trim() !== 'CRC')) throw new ErrorConciliacion('Factura extranjera: los cobros actuales no conservan moneda.');
    if (!da || !db) { diferencias.push({ alegra_id: id, id_propio: db?.id || null, tipo: !db ? 'factura_falta_en_base' : 'factura_solo_en_base' }); continue; }
    const estado = ESTADOS[da.status];
    if (!estado || !fechaValida(da.date)) throw new ErrorConciliacion('Factura con estado o fecha desconocidos al conciliar saldos.');
    if (estado !== db.estado) { diferencias.push({ alegra_id: id, id_propio: db.id, tipo: 'estado_distinto', alegra: estado, base: db.estado }); continue; }
    if (estado !== 'emitida') { noCobrables++; continue; }
    const saldoA = centavos(da.balance, 'balance'), saldoB = centavos(db.saldo_calculado, 'saldo_calculado');
    if (saldoA !== saldoB) diferencias.push({ alegra_id: id, id_propio: db.id, numero: db.numero, tipo: 'saldo_distinto', alegra: saldoA/100, base: saldoB/100, diferencia: (saldoB-saldoA)/100, cobrado_base: Number(db.cobrado), acreditado_base: Number(db.acreditado), cobrado_nativo_base: Number(db.cobrado_nativo) });
    else coinciden++;
  }
  return { resumen: { facturas_revisadas: ids.size, coinciden, no_cobrables_omitidas: noCobrables, diferencias: diferencias.length }, diferencias };
}

async function ejecutar({ client, pool, p, avisar = () => {} }) {
  periodo(p.desde, p.hasta);
  const inicio = new Date().toISOString();
  const lectura = { get: (endpoint, params) => getLectura(client, endpoint, params, avisar) };
  const remotos = await leerCobros(lectura,p,avisar);
  const facturas = await leerPaginas(lectura,'/invoices',{ date_afterOrNow:p.desde,date_beforeOrNow:p.hasta,order_field:'id',order_direction:'ASC' },avisar);
  for (const d of facturas) if (!fechaValida(d.date) || d.date < p.desde || d.date > p.hasta) throw new ErrorConciliacion('Alegra ignoró el filtro de fechas de facturas.');
  const base = await leerBaseCobros(pool);
  const porIdPropio = new Map(base.facturas.map(f=>[f.id,f]));
  for (const d of base.cobros.filter(d=>dentro(d,p))) for (const a of d.aplicaciones) {
    const f = porIdPropio.get(a.factura_id);
    if (f && f.moneda.trim() !== 'CRC') throw new ErrorConciliacion('Cobro propio aplicado a una factura extranjera: falta moneda en pago.');
  }
  const leidos = new Set(remotos.map(d => d.alegra_id));
  const extra = await porIds(lectura,'/payments',base.cobros.filter(d => d.alegra_id != null && dentro(d,p) && !leidos.has(d.alegra_id)).map(d => d.alegra_id));
  remotos.push(...extra.map(cobroAlegra));
  const ids = new Set([...facturas.map(d=>String(d.id)), ...base.facturas.filter(d=>d.alegra_id != null && dentro(d,p)).map(d=>String(d.alegra_id))]);
  for (const d of [...remotos,...base.cobros].filter(d=>dentro(d,p))) for (const a of d.aplicaciones) if (a.factura_alegra_id) ids.add(a.factura_alegra_id);
  const ya = new Set(facturas.map(d=>String(d.id)));
  facturas.push(...await porIds(lectura,'/invoices',[...ids].filter(id=>!ya.has(id))));
  const cobros = compararCobros(remotos,base.cobros,p), saldos = compararSaldos(facturas,base.facturas,ids);
  return { version:1, periodo:p, lectura:{iniciada_en:inicio,terminada_en:new Date().toISOString()},
    alcance:'Cobros del tramo y sus aplicaciones; saldos ACTUALES de facturas emitidas en el tramo o referidas por sus cobros. Solo CRC. No es un saldo histórico a la fecha final.',
    advertencia:'GET sucesivos sin instantánea en Alegra. Repetir con el origen congelado antes del corte. La conciliación de compras, existencias y aplicaciones de notas sigue pendiente.',
    sin_diferencias:!cobros.diferencias.length && !cobros.incidencias.length && !saldos.diferencias.length, cobros, saldos };
}

module.exports = { getLectura, normalizarCobro, cobroAlegra, leerCobros, porIds, leerBaseCobros, compararCobros, compararSaldos, ejecutar };
