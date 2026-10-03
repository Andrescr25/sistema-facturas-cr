/**
 * Auditoría de la copia de ventas, NO una sincronización. Se compara por
 * alegra_id: los ids seriales propios y los de Alegra pueden coincidir y
 * pertenecer a documentos distintos. Ni saldos congelados ni redondeos del
 * reporte del contador sirven para demostrar que una copia es fiel.
 */
const { facturaDesdeAlegra, ESTADOS } = require('../../../src/modules/facturacion/desdeAlegra');
const { notaDesdeAlegra } = require('../../../src/modules/facturacion/notaDesdeAlegra');
// Solo estos errores controlados se muestran en la CLI. Los de red/base
// pueden arrastrar configuración y no se imprimen, ni siquiera su stack.
class ErrorConciliacion extends Error {}
const contexto = Object.fromEntries(['clientes', 'productos', 'impuestos', 'plazos', 'metodos', 'facturas'].map(k => [k, new Map()]));
const IMPORTES = ['subtotal', 'descuento', 'impuesto', 'total'];
const CABECERA = ['tipo_documento', 'fecha', 'estado', 'moneda', 'numero', 'serie', 'consecutivo', 'electronica', 'clave_hacienda', 'anulada_por_nota'];
const ESCALAS = { cantidad: 4, precio_unitario: 5, descuento_porcentaje: 3, descuento_monto: 2, tarifa: 3, impuesto_monto: 2, total: 2 };
const enPeriodo = (d, p) => d.fecha >= p.desde && d.fecha <= p.hasta;

function fechaValida(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return false;
  const [a, m, d] = v.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

function periodo(desde, hasta) {
  if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta) throw new ErrorConciliacion('Período inválido: usar --desde=YYYY-MM-DD --hasta=YYYY-MM-DD.');
  return { desde, hasta };
}

function escalado(v, escala, campo) {
  if (!['number', 'string'].includes(typeof v) || String(v).trim() === '' || !Number.isFinite(Number(v))) throw new ErrorConciliacion(`Dato numérico inválido: ${campo}.`);
  const n = Math.round(Number(v) * 10 ** escala);
  if (!Number.isSafeInteger(n)) throw new ErrorConciliacion(`Importe fuera del rango seguro: ${campo}.`);
  return n;
}

function normalizarBase(d) {
  if (!fechaValida(d.fecha) || !['emitida', 'anulada', 'borrador'].includes(d.estado)) throw new ErrorConciliacion('Documento propio con fecha/estado inválido.');
  const fila = { ...d, moneda: String(d.moneda || 'CRC').trim(), consecutivo: d.consecutivo == null ? null : String(d.consecutivo), lineas: d.lineas || [] };
  if (!/^[A-Z]{3}$/.test(fila.moneda)) throw new ErrorConciliacion('Moneda inválida.');
  for (const campo of IMPORTES) fila[campo] = escalado(d[campo], 2, campo);
  if (!Array.isArray(fila.lineas)) throw new ErrorConciliacion('Líneas inválidas.');
  fila.lineas = fila.lineas.map(l => {
    const r = { numero_linea: Number(l.numero_linea), alegra_item_id: l.alegra_item_id == null ? null : String(l.alegra_item_id), cabys: l.cabys?.trim() || null };
    if (!Number.isSafeInteger(r.numero_linea) || r.numero_linea < 1) throw new ErrorConciliacion('Número de línea inválido.');
    for (const [campo, escala] of Object.entries(ESCALAS)) r[campo] = escalado(l[campo], escala, campo);
    return r;
  }).sort((a, b) => a.numero_linea - b.numero_linea);
  if (new Set(fila.lineas.map(l => l.numero_linea)).size !== fila.lineas.length) throw new ErrorConciliacion('Número de línea duplicado.');
  return fila;
}

function normalizarAlegra(d, clase) {
  // Los traductores de carga toleran ausencias históricas. Una auditoría no
  // puede convertir un total ausente en cero y certificarlo como correcto.
  if (!d || d.id == null || !ESTADOS[d.status] || !fechaValida(d.date)) throw new ErrorConciliacion(`Respuesta inválida de Alegra (${clase}): id, fecha o estado.`);
  if (clase === 'factura' && d.numberTemplate?.documentType && !['invoice', 'saleTicket'].includes(d.numberTemplate.documentType)) throw new ErrorConciliacion('Tipo de documento de Alegra no soportado.');
  for (const k of ['subtotal', 'discount', 'tax', 'total']) escalado(d[k], 2, k);
  if (!Array.isArray(d.items)) throw new ErrorConciliacion(`Alegra no incluyó las líneas (${clase}).`);
  for (const l of d.items) {
    for (const k of ['quantity', 'price', 'discount', 'total']) escalado(l[k], 5, k);
    if (!Array.isArray(l.tax) || l.tax.length > 1) throw new ErrorConciliacion('Impuestos de línea no soportados por la copia actual.');
    for (const t of l.tax) { escalado(t.percentage, 3, 'percentage'); escalado(t.amount, 2, 'amount'); }
  }
  const moneda = String(d.currency?.code || 'CRC').trim();
  // nota_credito todavía no tiene columna moneda: no afirmar que una nota
  // en dólares se copió fielmente ni sumar dólares con colones.
  if (clase === 'nota_credito' && moneda !== 'CRC') throw new ErrorConciliacion('Nota de crédito en moneda extranjera: la tabla propia aún no guarda su moneda.');
  const traducida = clase === 'nota_credito' ? notaDesdeAlegra(d, contexto) : facturaDesdeAlegra(d, contexto);
  return normalizarBase({ ...traducida.fila, tipo_documento: clase === 'nota_credito' ? clase : traducida.fila.tipo_documento, moneda, lineas: traducida.lineas, clase });
}

/** Páginas GET completas. Una respuesta rota o repetida nunca es "sin datos". */
async function leerPaginas(client, endpoint, params = {}, avisar = () => {}) {
  const filas = [], ids = new Set();
  // Se termina con una página VACÍA, incluso si una página trae menos de 30:
  // algunos límites efectivos pueden ser menores que el límite solicitado.
  for (let pagina = 0; pagina < 2000; pagina++) {
    const r = await client.get(endpoint, { ...params, start: filas.length, limit: 30 });
    if (!r?.success || !Array.isArray(r.data)) throw new ErrorConciliacion(`Lectura incompleta de ${endpoint}, página ${pagina + 1}. Repetir la conciliación.`);
    if (r.data.length === 0) return filas;
    for (const d of r.data) {
      if (d?.id == null || ids.has(String(d.id))) throw new ErrorConciliacion(`Id ausente/repetido en ${endpoint}. Repetir con Alegra sin cambios.`);
      ids.add(String(d.id)); filas.push(d);
    }
    avisar(`${endpoint}: ${filas.length} documentos leídos`);
  }
  throw new ErrorConciliacion(`Demasiadas páginas en ${endpoint}; conciliación incompleta.`);
}

function indice(docs, nombre) {
  const mapa = new Map();
  for (const d of docs) {
    const clave = `${d.clase}:${d.alegra_id}`;
    if (mapa.has(clave)) throw new ErrorConciliacion(`Id de Alegra duplicado en ${nombre}.`);
    mapa.set(clave, d);
  }
  return mapa;
}

/** Recibe filas normalizadas: importes en centavos y líneas con ESCALAS. */
function conciliar(alegra, base, p) {
  periodo(p.desde, p.hasta);
  const remotas = indice(alegra, 'Alegra');
  const importadas = indice(base.filter(d => d.alegra_id != null), 'la base');
  const diferencias = [], mensual = new Map();
  let coinciden = 0;
  for (const clave of new Set([...remotas.keys(), ...importadas.keys()])) {
    const a = remotas.get(clave), b = importadas.get(clave);
    // Si una fuente movió la fecha FUERA del tramo, se sigue comparando el
    // par: filtrar las dos antes de unir ocultaría justamente ese cambio.
    if (!((a && enPeriodo(a, p)) || (b && enPeriodo(b, p)))) continue;
    const d = a || b, cambios = [];
    if (a && b) {
      for (const campo of [...CABECERA, ...IMPORTES]) if (a[campo] !== b[campo]) cambios.push({ campo, alegra: IMPORTES.includes(campo) ? a[campo] / 100 : a[campo], base: IMPORTES.includes(campo) ? b[campo] / 100 : b[campo] });
      const lineasA = new Map(a.lineas.map(l => [l.numero_linea, l])), lineasB = new Map(b.lineas.map(l => [l.numero_linea, l]));
      for (const n of new Set([...lineasA.keys(), ...lineasB.keys()])) {
        const la = lineasA.get(n), lb = lineasB.get(n);
        if (!la || !lb) cambios.push({ campo: `lineas.${n}`, alegra: la ? 'presente' : 'ausente', base: lb ? 'presente' : 'ausente' });
        else for (const campo of ['alegra_item_id', 'cabys', ...Object.keys(ESCALAS)]) {
          if (la[campo] !== lb[campo]) cambios.push({ campo: `lineas.${n}.${campo}`, alegra: ESCALAS[campo] ? la[campo] / 10 ** ESCALAS[campo] : la[campo], base: ESCALAS[campo] ? lb[campo] / 10 ** ESCALAS[campo] : lb[campo] });
        }
      }
    }
    if (!a || !b || cambios.length) diferencias.push({ clase: d.clase, alegra_id: d.alegra_id, id_propio: b?.id || null, numero: d.numero, tipo: !b ? 'falta_en_base' : !a ? 'solo_en_base' : 'datos_distintos', cambios });
    else coinciden++;
  }
  const cero = () => ({ documentos: 0, subtotal: 0, descuento: 0, impuesto: 0, total: 0 });
  for (const [fuente, docs] of [['alegra', alegra], ['base_importada', base.filter(d => d.alegra_id != null)], ['base_nativa', base.filter(d => d.alegra_id == null)]]) {
    for (const d of docs.filter(d => enPeriodo(d, p))) {
      const mes = d.fecha.slice(0, 7), clave = `${mes}:${d.tipo_documento}:${d.estado}:${d.moneda}`;
      if (!mensual.has(clave)) mensual.set(clave, { mes, tipo_documento: d.tipo_documento, estado: d.estado, moneda: d.moneda, alegra: cero(), base_importada: cero(), base_nativa: cero() });
      const grupo = mensual.get(clave)[fuente]; grupo.documentos++;
      for (const campo of IMPORTES) {
        grupo[campo] += d[campo];
        if (!Number.isSafeInteger(grupo[campo])) throw new ErrorConciliacion('Suma mensual fuera del rango seguro.');
      }
    }
  }
  const meses = [...mensual.values()].sort((a,b) => `${a.mes}:${a.tipo_documento}:${a.estado}:${a.moneda}`.localeCompare(`${b.mes}:${b.tipo_documento}:${b.estado}:${b.moneda}`));
  for (const m of meses) {
    m.diferencia_base_menos_alegra = { documentos: m.base_importada.documentos - m.alegra.documentos };
    for (const campo of IMPORTES) {
      m.diferencia_base_menos_alegra[campo] = (m.base_importada[campo] - m.alegra[campo]) / 100;
      for (const fuente of ['alegra', 'base_importada', 'base_nativa']) m[fuente][campo] /= 100;
    }
  }
  return {
    version: 1, periodo: p, alcance: 'Facturas/tiquetes y notas de crédito: cabeceras, importes y líneas. Sin cobros, aplicaciones, saldos, compras ni existencias.',
    advertencia: 'Alegra se lee con GET sucesivos, sin instantánea transaccional. Repetir con el origen congelado antes del corte. Cero diferencias aquí no certifica el corte completo.',
    sin_diferencias: diferencias.length === 0,
    resumen: { coinciden, faltan_en_base: diferencias.filter(d => d.tipo === 'falta_en_base').length, solo_en_base: diferencias.filter(d => d.tipo === 'solo_en_base').length, datos_distintos: diferencias.filter(d => d.tipo === 'datos_distintos').length, nativos_excluidos: base.filter(d => d.alegra_id == null && enPeriodo(d, p)).length },
    mensual: meses, diferencias
  };
}

/** Instantánea propia consistente y con escrituras rechazadas por PostgreSQL. */
async function leerBase(pool, p, ids) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const docs = [];
    for (const [tabla, fk] of [['factura', 'factura_id'], ['nota_credito', 'nota_credito_id']]) {
      // Nombres constantes; solo fechas/ids son parámetros. También traemos
      // pares cuya fecha propia quedó fuera del período para no esconderlos.
      const r = await client.query(`SELECT d.*, d.fecha::text AS fecha,
        ${tabla === 'nota_credito' ? "'CRC'::text AS moneda, 'nota_credito'::text AS tipo_documento," : ''}
        COALESCE((SELECT jsonb_agg(l ORDER BY l.numero_linea) FROM ${tabla}_linea l WHERE l.${fk} = d.id), '[]'::jsonb) AS lineas
        FROM ${tabla} d WHERE d.fecha BETWEEN $1::date AND $2::date OR d.alegra_id = ANY($3::text[]) ORDER BY d.id`, [p.desde, p.hasta, ids[tabla] || []]);
      docs.push(...r.rows.map(d => normalizarBase({ ...d, clase: tabla })));
    }
    await client.query('COMMIT');
    return docs;
  } catch (e) {
    await client.query('ROLLBACK'); throw e;
  } finally { client.release(); }
}

module.exports = { ErrorConciliacion, periodo, fechaValida, normalizarBase, normalizarAlegra, leerPaginas, leerBase, conciliar };
