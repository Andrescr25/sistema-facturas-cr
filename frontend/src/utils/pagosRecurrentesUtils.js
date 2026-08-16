/**
 * Formateo y etiquetas puras de Pagos Recurrentes. Reusa formatCurrency
 * de pagosProveedoresUtils en vez de crear otra copia.
 */

export { formatCurrency } from './pagosProveedoresUtils'

export const CATEGORIA_INFO = {
  servicios: { label: 'Servicios', estilo: 'bg-blue-100 text-blue-700' },
  alquiler: { label: 'Alquiler', estilo: 'bg-purple-100 text-purple-700' },
  insumos: { label: 'Insumos', estilo: 'bg-amber-100 text-amber-700' },
  planilla: { label: 'Planilla', estilo: 'bg-emerald-100 text-emerald-700' },
  impuestos: { label: 'Impuestos', estilo: 'bg-red-100 text-red-700' },
  otros: { label: 'Otros', estilo: 'bg-gray-100 text-gray-600' }
}

export const FRECUENCIA_LABEL = {
  quincenal: 'Quincenal',
  mensual: 'Mensual',
  bimensual: 'Cada 2 meses',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual'
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
]

export function categoriaInfo(categoria) {
  return CATEGORIA_INFO[categoria] || CATEGORIA_INFO.otros
}

export function mesNombre(numero) {
  return MESES[Number(numero) - 1] || ''
}

/** 'YYYY-MM' → 'agosto 2026' */
export function periodoLabel(periodo) {
  const [anio, mes] = String(periodo || '').split('-')
  const nombre = mesNombre(mes)
  return nombre ? `${nombre} ${anio}` : periodo
}

/**
 * Etiqueta corta del período de un pago. Los quincenales llegan como
 * 'YYYY-MM-Q1' y hay que distinguirlos en la lista del mes, porque si no
 * se ven dos filas de "Planilla" idénticas.
 */
export function quincenaLabel(periodo) {
  if (String(periodo).endsWith('-Q1')) return '1ª quincena'
  if (String(periodo).endsWith('-Q2')) return '2ª quincena'
  return null
}

export function periodoActual() {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

export function moverPeriodo(periodo, delta) {
  const [anio, mes] = periodo.split('-').map(Number)
  const d = new Date(anio, mes - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatFecha(valor) {
  if (!valor) return '—'
  return new Date(valor).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })
}

/**
 * Cuándo se consultó por última vez, en lenguaje llano. La hora importa acá:
 * "consultado hace 10 minutos" y "consultado hace 3 días" llevan a decisiones
 * distintas cuando el recibo todavía no aparece.
 */
export function formatFechaHora(valor) {
  if (!valor) return '—'
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return '—'

  const minutos = Math.round((Date.now() - fecha.getTime()) / 60000)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  if (minutos < 60 * 24) return `hace ${Math.round(minutos / 60)} h`

  const dias = Math.round(minutos / (60 * 24))
  if (dias <= 7) return `hace ${dias} día${dias === 1 ? '' : 's'}`
  return `el ${fecha.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })}`
}
