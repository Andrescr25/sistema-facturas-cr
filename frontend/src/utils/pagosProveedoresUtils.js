/**
 * Formateo puro para la página de Pagos a Proveedores: moneda, fechas, y el
 * texto descriptivo de días para vencer/vencidos.
 */
import { fechaEnPalabras } from './fechaCR.js'

// maximumFractionDigits explícito: sin él toLocaleString permite hasta 3
// decimales, así que cualquier valor calculado (un techo de precio, un
// prorrateo) se imprimía como "₡1 133,333". Dinero siempre 2 decimales.
export function formatCurrency(value) {
  return `₡${(Number(value) || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Vencimientos, abonos y movimientos son fechas de CALENDARIO: llegan como
// «AAAA-MM-DD» o a medianoche UTC, y `new Date(valor)` en Costa Rica las
// mostraba un día antes (el vencimiento del 4 de noviembre decía «3 nov»,
// 2026-10-23). fechaEnPalabras lee el día del texto.
export function formatDate(value) {
  return fechaEnPalabras(value, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function diasLabel(dias) {
  if (dias === 0) return 'Vence hoy'
  if (dias > 0) return `Vence en ${dias} día${dias === 1 ? '' : 's'}`
  const abs = Math.abs(dias)
  return `Vencida hace ${abs} día${abs === 1 ? '' : 's'}`
}

