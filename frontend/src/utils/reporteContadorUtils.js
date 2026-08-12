export { formatCurrency } from './pagosProveedoresUtils'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
]

export function mesNombre(numero) {
  return MESES[Number(numero) - 1] || ''
}

/** Mes anterior al actual — es lo que hay que declarar a principios de mes. */
export function periodoMesAnterior() {
  const hoy = new Date()
  const anterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  return { anio: anterior.getFullYear(), mes: anterior.getMonth() + 1 }
}

export function formatFecha(valor) {
  if (!valor) return '—'
  return new Date(valor).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })
}
