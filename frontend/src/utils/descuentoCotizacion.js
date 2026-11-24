/**
 * El descuento de una cotización en pantalla (2026-11-24): un solo porcentaje
 * para toda la cotización. Quien manda es el servidor
 * (backend/src/modules/cotizaciones/descuentoCotizacion.js); esto solo
 * muestra lo que va a quedar.
 */

/** Lo escrito en el campo como número de 0 a 100, o `null` si no sirve. Vacío es 0. */
export function porcentajeEscrito(texto) {
  const n = Number(String(texto ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 1000) / 1000 : null
}

/** El monto ya rebajado. */
export function conDescuento(monto, porcentaje) {
  return (Number(monto) || 0) * (1 - (Number(porcentaje) || 0) / 100)
}

/** «5» o «2,5», como se escribe en Costa Rica. */
export function textoPorcentaje(porcentaje) {
  return String(Number(porcentaje) || 0).replace('.', ',')
}

/** Cuánto se rebajó en las líneas del enlace público (sin IVA). */
export function rebajaDeLineas(lineas) {
  return (lineas || []).reduce((s, l) => s + (Number(l.importeLista ?? l.importe) || 0) - (Number(l.importe) || 0), 0)
}
