/**
 * Formatos y textos de Rentabilidad.
 *
 * SIN IMPORTS A PROPÓSITO: backend/tests/rentabilidadFormato.test.js carga
 * este archivo con `new Function`, y un `import` lo rompería.
 */

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']
export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
export const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
export const DIAS_SEMANA_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

const numeroCR = (v, decimales = 0) =>
  Number(v || 0).toLocaleString('es-CR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })

/** Hasta `decimales`, sin ceros de relleno: 3 → "3", 2,5 → "2,5" (no "3,00"). */
const numeroCorto = (v, decimales) =>
  Number(v || 0).toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: decimales })

/** ₡18,4 M · ₡850 mil · ₡12 345. Para ejes y tarjetas: el exacto va en la tabla. */
export function colonesCorto(v) {
  const n = Number(v) || 0
  const abs = Math.abs(n)
  if (abs >= 1e6) return `₡${numeroCorto(n / 1e6, abs >= 1e7 ? 1 : 2)} M`
  if (abs >= 1e3) return `₡${numeroCorto(n / 1e3, abs >= 1e5 ? 0 : 1)} mil`
  return `₡${numeroCR(n)}`
}

export function colonesExactos(v) {
  return `₡${numeroCR(v)}`
}

/** Unidades: enteras si lo son, con un decimal si no (los promedios). */
export function unidades(v) {
  const n = Number(v) || 0
  return numeroCR(n, Number.isInteger(n) ? 0 : 1)
}

export function porcentaje(v) {
  return v === null || v === undefined ? '—' : `${numeroCR(v, 1)} %`
}

/** AAAA-MM-DD sin pasar por la zona del dispositivo. */
function partes(fecha) {
  const [a, m, d] = String(fecha).slice(0, 10).split('-').map(Number)
  return { a, m, d }
}

export function etiquetaSemana(inicio) {
  const { m, d } = partes(inicio)
  return `${d} ${MESES_CORTOS[m - 1]}`
}

export function tituloSemana(inicio) {
  const { a, m, d } = partes(inicio)
  const fin = new Date(Date.UTC(a, m - 1, d + 6))
  const mf = fin.getUTCMonth() + 1
  return mf === m
    ? `Semana del ${d} al ${fin.getUTCDate()} de ${MESES[m - 1]}`
    : `Semana del ${d} de ${MESES[m - 1]} al ${fin.getUTCDate()} de ${MESES[mf - 1]}`
}

export function etiquetaMes(inicio) {
  const { a, m } = partes(inicio)
  return `${MESES_CORTOS[m - 1]} ${String(a).slice(2)}`
}

export function tituloMes(inicio) {
  const { a, m } = partes(inicio)
  return `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${a}`
}

/** "2024 (del 3 jun al 30 dic)" cuando el año no está completo. */
export function tituloAnio({ anio, desde, hasta }) {
  const i = partes(desde)
  const f = partes(hasta)
  const completo = i.m === 1 && i.d <= 7 && f.m === 12 && f.d >= 24
  return completo ? String(anio) : `${anio} (del ${i.d} ${MESES_CORTOS[i.m - 1]} al ${f.d} ${MESES_CORTOS[f.m - 1]})`
}

/** "a, b y c" */
function enumerar(lista) {
  if (lista.length <= 1) return lista.join('')
  return `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`
}

/**
 * La frase que responde la pregunta de cada gráfico: "Se vende más los días
 * 2, 15 y 30". `nombre(d)` dice cómo se llama cada barra. Sin ventas, null.
 */
export function lasMasAltas(datos, n, nombre) {
  const conVenta = datos.filter((d) => d.valor > 0)
  if (conVenta.length === 0) return null
  const top = [...conVenta].sort((a, b) => b.valor - a.valor).slice(0, n)
  // En el orden natural (día 2, 15, 30), no en el de la venta.
  const ordenados = datos.filter((d) => top.includes(d))
  return enumerar(ordenados.map(nombre))
}
