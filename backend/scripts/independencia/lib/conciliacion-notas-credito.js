/**
 * Una nota con el total correcto puede acreditar OTRA factura. Comparar el
 * destino por alegra_id y cada monto evita que una suma mensual o el número
 * impreso oculten ese error. Esta auditoría no carga ni corrige documentos.
 */
const { ErrorConciliacion, periodo, fechaValida, escalado, leerPaginas } = require('./conciliacion-ventas');
const { getLectura, porIds } = require('./conciliacion-cobros');
const { ESTADOS } = require('../../../src/modules/facturacion/notaDesdeAlegra');
const dentro = (d, p) => d.fecha >= p.desde && d.fecha <= p.hasta;
const texto = v => v == null || String(v).trim() === '' ? null : String(v).trim();
const centavos = (v, campo) => escalado(v, 2, campo);

function idHistorico(v) {
  if (v == null) return null;
  if (!['number', 'string'].includes(typeof v) || !texto(v) || (typeof v === 'number' && !Number.isFinite(v))) throw new ErrorConciliacion('Id histórico inválido en una nota o aplicación.');
  return texto(v);
}

function sumar(importes) {
  return importes.reduce((s, v) => {
    const total = s + v;
    if (!Number.isSafeInteger(total)) throw new ErrorConciliacion('Suma de notas o aplicaciones fuera del rango seguro.');
    return total;
  }, 0);
}

function normalizarNota(d) {
  if (!fechaValida(d.fecha) || !['emitida', 'anulada', 'borrador'].includes(d.estado) || !Array.isArray(d.aplicaciones)) throw new ErrorConciliacion('Nota con fecha, estado o aplicaciones inválidos.');
  const aplicaciones = d.aplicaciones.map(a => {
    const monto = centavos(a.monto, 'aplicación');
    if (monto <= 0) throw new ErrorConciliacion('Aplicación de nota sin monto positivo: la tabla propia no la representa.');
    return { factura_id: a.factura_id ?? null, factura_alegra_id: idHistorico(a.factura_alegra_id), factura_moneda: texto(a.factura_moneda), monto };
  });
  const destinos = aplicaciones.map((a, i) => claveDestino(a, i));
  if (new Set(destinos).size !== destinos.length) throw new ErrorConciliacion('Factura repetida en las aplicaciones de una nota.');
  const otros = (d.otros_destinos || []).map(v => {
    const monto = centavos(v.monto, 'otro destino');
    if (v.clase !== 'nota_debito_ingreso' || !idHistorico(v.alegra_id) || monto <= 0) throw new ErrorConciliacion('Destino adicional de nota inválido.');
    return { clase: v.clase, alegra_id: idHistorico(v.alegra_id), monto, id_propio: v.id_propio ?? null, moneda: texto(v.moneda) };
  });
  if (new Set(otros.map(v => `${v.clase}:${v.alegra_id}`)).size !== otros.length) throw new ErrorConciliacion('Destino adicional repetido.');
  const total = centavos(d.total, 'total'), aplicado = centavos(d.total_aplicado, 'total_aplicado');
  if (total < 0 || aplicado < 0) throw new ErrorConciliacion('Nota con importes negativos no soportados.');
  return { ...d, alegra_id: idHistorico(d.alegra_id), numero: texto(d.numero), total, total_aplicado: aplicado, aplicaciones, otros_destinos: otros };
}

function notaAlegra(d) {
  if (!d || !idHistorico(d.id) || !ESTADOS[d.status]) throw new ErrorConciliacion('Nota de Alegra sin id o con estado desconocido.');
  if ((d.currency?.code || 'CRC') !== 'CRC') throw new ErrorConciliacion('Nota extranjera: nota_credito aún no guarda moneda.');
  // Alegra omite invoices en algunas notas sin detalle de aplicación. No
  // inventar destinos: si totalApplied > 0, aparecerá una incidencia.
  if (d.invoices != null && !Array.isArray(d.invoices)) throw new ErrorConciliacion('Detalle de aplicaciones inválido en Alegra.');
  const aplicaciones = (d.invoices || []).map(a => {
    if (!idHistorico(a.id)) throw new ErrorConciliacion('Aplicación de Alegra sin id de factura.');
    return { factura_alegra_id: idHistorico(a.id), monto: a.amount };
  });
  // La ficha individual incluye aplicaciones a notas de débito de ingreso
  // que el listado omite. Son otro espacio de ids, aun si el número coincide.
  if (d.incomeDebitNotes != null && !Array.isArray(d.incomeDebitNotes)) throw new ErrorConciliacion('Destinos adicionales inválidos en Alegra.');
  const otros = (d.incomeDebitNotes || []).map(v => ({ clase: 'nota_debito_ingreso', alegra_id: v.id, monto: v.amount }));
  return normalizarNota({ alegra_id: idHistorico(d.id), numero: d.numberTemplate?.fullNumber || d.numberTemplate?.formattedNumber,
    fecha: d.date, estado: ESTADOS[d.status], total: d.total, total_aplicado: d.totalApplied, aplicaciones, otros_destinos: otros });
}

function claveDestino(a, i) {
  // Los prefijos separan los dos espacios de ids. Nunca recuperar un enlace
  // nulo buscando factura_numero: el mismo número puede existir en dos series.
  return a.factura_alegra_id ? `alegra:${a.factura_alegra_id}` : a.factura_id != null ? `propia:${a.factura_id}` : `sin_enlace:${i}`;
}

async function leerBaseNotas(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    // Foto completa para no perder pares con la fecha cambiada fuera del
    // tramo. La identidad del destino sale del FK real, no de su texto.
    const { rows } = await client.query(`SELECT n.id, n.alegra_id, n.numero, n.fecha::text AS fecha, n.estado, n.total, n.total_aplicado,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('factura_id', nf.factura_id,
        'factura_alegra_id', f.alegra_id, 'factura_moneda', f.moneda, 'monto', nf.monto) ORDER BY nf.id)
        FROM nota_credito_factura nf LEFT JOIN factura f ON f.id=nf.factura_id WHERE nf.nota_credito_id=n.id), '[]'::jsonb) AS aplicaciones
      ,COALESCE((SELECT jsonb_agg(jsonb_build_object('clase','nota_debito_ingreso','alegra_id',d.alegra_id,
        'id_propio',d.id,'moneda',d.moneda,'monto',nd.monto) ORDER BY nd.id)
        FROM nota_credito_debito_ingreso nd JOIN debito_ingreso_historico d ON d.id=nd.debito_ingreso_id
        WHERE nd.nota_credito_id=n.id),'[]'::jsonb) AS otros_destinos
      FROM nota_credito n ORDER BY n.id`);
    const notas = rows.map(normalizarNota);
    await client.query('COMMIT');
    return notas;
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

function mapaImportadas(docs) {
  const mapa = new Map();
  for (const d of docs) {
    if (!d.alegra_id || mapa.has(d.alegra_id)) throw new ErrorConciliacion('Nota importada sin id o con id repetido.');
    mapa.set(d.alegra_id, d);
  }
  return mapa;
}

function compararNotas(alegra, propias, p) {
  periodo(p.desde, p.hasta);
  const a = mapaImportadas(alegra), b = mapaImportadas(propias.filter(d => d.alegra_id != null));
  const diferencias = [], incidencias = [], observaciones = [], mensual = new Map();
  let coinciden = 0;
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const da = a.get(id), db = b.get(id);
    if (!((da && dentro(da, p)) || (db && dentro(db, p)))) continue;
    const cambios = [];
    if (da && db) {
      for (const campo of ['fecha', 'estado', 'numero', 'total', 'total_aplicado']) {
        if (da[campo] !== db[campo]) cambios.push({ campo, alegra: campo.startsWith('total') ? da[campo] / 100 : da[campo], base: campo.startsWith('total') ? db[campo] / 100 : db[campo] });
      }
      const aa = new Map(da.aplicaciones.map((v, i) => [claveDestino(v, i), v.monto]));
      const ab = new Map(db.aplicaciones.map((v, i) => [claveDestino(v, i), v.monto]));
      for (const f of new Set([...aa.keys(), ...ab.keys()])) {
        if (aa.get(f) !== ab.get(f)) cambios.push({ campo: `aplicaciones.${f}`, alegra: aa.has(f) ? aa.get(f) / 100 : null, base: ab.has(f) ? ab.get(f) / 100 : null });
      }
      const destinos = d => d.otros_destinos.map(v => ({ clase:v.clase,alegra_id:v.alegra_id,monto:v.monto/100 })).sort((a, b) => a.alegra_id.localeCompare(b.alegra_id));
      const otrosA = destinos(da), otrosB = destinos(db);
      if (JSON.stringify(otrosA) !== JSON.stringify(otrosB)) cambios.push({ campo: 'otros_destinos', alegra: otrosA, base: otrosB });
    }
    if (!da || !db || cambios.length) diferencias.push({ alegra_id: id, id_propio: db?.id || null, numero: (da || db).numero,
      tipo: !db ? 'falta_en_base' : !da ? 'solo_en_base' : 'datos_distintos', cambios });
    else coinciden++;
  }

  for (const [fuente, docs] of [['alegra', alegra], ['base_importada', propias.filter(d => d.alegra_id != null)], ['base_nativa', propias.filter(d => d.alegra_id == null)]]) {
    for (const d of docs) {
      // Auditar también el par fuera del período si la otra fuente lo tiene
      // dentro. Solo las sumas mensuales se filtran por la fecha de cada lado.
      const par = fuente === 'alegra' ? b.get(d.alegra_id) : a.get(d.alegra_id);
      if (!dentro(d, p) && !(par && dentro(par, p))) continue;
      const ref = { fuente, alegra_id: d.alegra_id, id_propio: d.id || null };
      const aplicado = sumar(d.aplicaciones.map(v => v.monto)), otros = sumar(d.otros_destinos.map(v => v.monto)), representado = sumar([aplicado, otros]);
      if (representado !== d.total_aplicado) incidencias.push({ ...ref, tipo: 'aplicado_declarado_sin_respaldo_individual', declarado: d.total_aplicado / 100, aplicaciones: representado / 100, diferencia: (d.total_aplicado - representado) / 100 });
      if (d.total_aplicado > d.total || representado > d.total) incidencias.push({ ...ref, tipo: 'aplicaciones_exceden_total', total: d.total / 100 });
      for (const v of d.otros_destinos) if (fuente !== 'alegra') {
        if (v.moneda && v.moneda !== 'CRC') throw new ErrorConciliacion('Crédito propio a débito extranjero: falta moneda en nota_credito.');
        if (v.id_propio == null || !v.moneda) incidencias.push({ ...ref, tipo:'aplicacion_sin_debito_propio',alegra_id_destino:v.alegra_id });
      }
      for (const v of d.aplicaciones) {
        if (v.factura_moneda && v.factura_moneda !== 'CRC') throw new ErrorConciliacion('Nota propia aplicada a una factura extranjera: falta moneda en nota_credito.');
        if (fuente !== 'alegra' && (v.factura_id == null || !v.factura_moneda)) incidencias.push({ ...ref, tipo: 'aplicacion_sin_factura_propia', monto: v.monto / 100 });
        else if (fuente === 'base_importada' && !v.factura_alegra_id) incidencias.push({ ...ref, tipo: 'aplicacion_importada_a_factura_nativa', factura_id: v.factura_id, monto: v.monto / 100 });
      }
      // Un crédito pendiente puede ser legítimo. Es información para revisar,
      // no una diferencia entre copias ni una corrección automática de saldo.
      if (d.estado !== 'anulada' && d.total_aplicado < d.total) observaciones.push({ ...ref, tipo: 'credito_no_aplicado', monto: (d.total - d.total_aplicado) / 100 });
      if (!dentro(d, p)) continue;
      const mes = d.fecha.slice(0, 7), clave = `${mes}:${d.estado}`;
      if (!mensual.has(clave)) mensual.set(clave, { mes, estado: d.estado, moneda: 'CRC', alegra: grupoVacio(), base_importada: grupoVacio(), base_nativa: grupoVacio() });
      const grupo = mensual.get(clave)[fuente]; grupo.documentos++; grupo.aplicaciones += d.aplicaciones.length;
      grupo.total = sumar([grupo.total, d.total]); grupo.aplicado_declarado = sumar([grupo.aplicado_declarado, d.total_aplicado]); grupo.aplicado_a_facturas = sumar([grupo.aplicado_a_facturas, aplicado]); grupo.aplicado_a_otros_documentos = sumar([grupo.aplicado_a_otros_documentos, otros]);
    }
  }
  const meses = [...mensual.values()].sort((a, b) => `${a.mes}:${a.estado}`.localeCompare(`${b.mes}:${b.estado}`));
  for (const m of meses) {
    m.diferencia_base_menos_alegra = Object.fromEntries(Object.keys(grupoVacio()).map(k => [k, (m.base_importada[k] - m.alegra[k]) / (['documentos', 'aplicaciones'].includes(k) ? 1 : 100)]));
    for (const f of ['alegra', 'base_importada', 'base_nativa']) for (const k of ['total', 'aplicado_declarado', 'aplicado_a_facturas', 'aplicado_a_otros_documentos']) m[f][k] /= 100;
  }
  return { resumen: { coinciden, faltan_en_base: diferencias.filter(d => d.tipo === 'falta_en_base').length,
    solo_en_base: diferencias.filter(d => d.tipo === 'solo_en_base').length, datos_distintos: diferencias.filter(d => d.tipo === 'datos_distintos').length,
    nativos_excluidos: propias.filter(d => d.alegra_id == null && dentro(d, p)).length }, mensual: meses, diferencias, incidencias, observaciones };
}

function grupoVacio() { return { documentos: 0, aplicaciones: 0, total: 0, aplicado_declarado: 0, aplicado_a_facturas: 0, aplicado_a_otros_documentos: 0 }; }

async function ejecutar({ client, pool, p, avisar = () => {} }) {
  periodo(p.desde, p.hasta);
  const inicio = new Date().toISOString(); // Instante del informe, no día de negocio.
  const lectura = { get: (ep, params) => getLectura(client, ep, params, avisar) };
  // /credit-notes documenta fecha exacta, no rango. Leer hasta página vacía.
  const remotas = (await leerPaginas(lectura, '/credit-notes', {}, avisar)).map(notaAlegra);
  const propias = await leerBaseNotas(pool), porId = mapaImportadas(propias.filter(n => n.alegra_id != null));
  const seleccionadas = remotas.filter(n => dentro(n, p) || (porId.has(n.alegra_id) && dentro(porId.get(n.alegra_id), p)));
  for (const n of seleccionadas) await completarDetalleNota(lectura,n);
  const ids = [...new Set(seleccionadas.flatMap(n => n.aplicaciones.map(v => v.factura_alegra_id)))];
  const facturas = await porIds(lectura, '/invoices', ids), vistas = new Set(facturas.map(f => String(f.id)));
  for (const f of facturas) if ((f.currency?.code || 'CRC') !== 'CRC') throw new ErrorConciliacion('Nota aplicada a una factura extranjera: falta moneda en nota_credito.');
  const notas = compararNotas(remotas, propias, p);
  const idsDebito = new Set(seleccionadas.flatMap(n=>n.otros_destinos.map(v=>v.alegra_id)));
  // Este endpoint no documenta filtro por ids: leer el listado completo,
  // incluso tras una página corta, y verificar los destinos explícitamente.
  const debitos = idsDebito.size ? await leerPaginas(lectura,'/income-debit-notes',{},avisar) : [];
  const debitosVistos = new Map(debitos.map(d=>[String(d.id),d]));
  for (const n of seleccionadas) for (const v of n.otros_destinos) {
    const d=debitosVistos.get(v.alegra_id);
    if (!d) notas.incidencias.push({fuente:'alegra',alegra_id:n.alegra_id,tipo:'debito_destino_ausente_en_alegra',alegra_id_destino:v.alegra_id});
    else if ((d.currency?.code || 'CRC') !== 'CRC') throw new ErrorConciliacion('Nota aplicada a débito extranjero: falta moneda en nota_credito.');
  }
  for (const n of seleccionadas) for (const v of n.aplicaciones) if (!vistas.has(v.factura_alegra_id)) notas.incidencias.push({ fuente: 'alegra', alegra_id: n.alegra_id, tipo: 'factura_destino_ausente_en_alegra', factura_alegra_id: v.factura_alegra_id });
  return { version: 2, periodo: p, lectura: { iniciada_en: inicio, terminada_en: new Date().toISOString() },
    alcance: 'Aplicaciones ACTUALES de notas fechadas en el tramo, o de sus pares con fecha cambiada; total y aplicado declarado. Solo CRC. Usar también conciliación de ventas y cobros; no es un cierre histórico.',
    advertencia: 'GET sucesivos sin instantánea en Alegra. Repetir con el origen congelado antes del corte. Compras, existencias y resolución de discrepancias siguen pendientes.',
    sin_diferencias: !notas.diferencias.length && !notas.incidencias.length,
    destinos: { facturas_referidas: ids.length, facturas_leidas: facturas.length, debitos_referidos:idsDebito.size, debitos_encontrados:[...idsDebito].filter(id=>debitosVistos.has(id)).length }, notas };
}

/** El cargador y el auditor deben reconstruir el MISMO detalle omitido. */
async function completarDetalleNota(lectura,n) {
  if (n.total_aplicado <= sumar([...n.aplicaciones,...n.otros_destinos].map(v=>v.monto))) return null;
  const r=await lectura.get(`/credit-notes/${encodeURIComponent(n.alegra_id)}`,{});
  if (!r?.success || !r.data || Array.isArray(r.data)) throw new ErrorConciliacion('No se pudo completar el detalle individual de una nota.');
  const detalle=notaAlegra(r.data);
  if (['alegra_id','numero','fecha','estado','total','total_aplicado'].some(k=>n[k]!==detalle[k]) ||
    n.aplicaciones.some(v=>!detalle.aplicaciones.some(a=>a.factura_alegra_id===v.factura_alegra_id && a.monto===v.monto))) throw new ErrorConciliacion('Una nota cambió entre listado y detalle. Repetir con el origen congelado.');
  Object.assign(n,detalle);
  return r.data;
}

module.exports = { normalizarNota, notaAlegra, completarDetalleNota, leerBaseNotas, compararNotas, ejecutar };
