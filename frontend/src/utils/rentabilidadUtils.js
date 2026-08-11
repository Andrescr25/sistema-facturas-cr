/**
 * Formateo y etiquetas puras del Tablero de Rentabilidad. Reusa formatCurrency
 * de pagosProveedoresUtils en vez de crear una quinta copia — ya hay 4
 * duplicados de formato de moneda en el repo.
 */

export { formatCurrency } from './pagosProveedoresUtils'

export const CLASIFICACION_INFO = {
  SIN_COSTO: { label: 'Sin costo', color: 'gray', descripcion: 'No tiene costo registrado en Alegra' },
  UNIDAD_SOSPECHOSA: { label: 'Unidad sospechosa', color: 'orange', descripcion: 'El costo no cuadra con la unidad de venta — probable error de factor de conversión' },
  MARGEN_NEGATIVO: { label: 'Margen negativo', color: 'red', descripcion: 'Se vende por debajo del costo' },
  OK: { label: 'OK', color: 'green', descripcion: 'Costo y margen consistentes' }
}

export const ESTILO_CLASIFICACION = {
  SIN_COSTO: 'bg-gray-100 text-gray-700 border-gray-200',
  UNIDAD_SOSPECHOSA: 'bg-orange-100 text-orange-700 border-orange-200',
  MARGEN_NEGATIVO: 'bg-red-100 text-red-700 border-red-200',
  OK: 'bg-green-100 text-green-700 border-green-200'
}

export const ESTILO_CLASE_ROTACION = {
  A: 'bg-blue-100 text-blue-700',
  B: 'bg-indigo-100 text-indigo-700',
  C: 'bg-gray-100 text-gray-500'
}

export function claseRotacionLabel(clase) {
  if (clase === 'A') return 'A — núcleo'
  if (clase === 'B') return 'B'
  if (clase === 'C') return 'C — cola larga'
  return 'Sin ventas'
}

export function mesesSinVentaLabel(meses) {
  if (meses === null || meses === undefined) return 'Nunca se ha vendido'
  if (meses === 0) return 'Vendido este mes'
  return `${meses} mes${meses === 1 ? '' : 'es'} sin venderse`
}

export function margenLabel(margen) {
  if (margen === null || margen === undefined) return '—'
  return `${margen.toFixed(1)}%`
}
