/**
 * Formateo puro para la página de Pagos a Proveedores: moneda, fechas, y el
 * texto descriptivo de días para vencer/vencidos.
 */

// maximumFractionDigits explícito: sin él toLocaleString permite hasta 3
// decimales, así que cualquier valor calculado (un techo de precio, un
// prorrateo) se imprimía como "₡1 133,333". Dinero siempre 2 decimales.
export function formatCurrency(value) {
  return `₡${(Number(value) || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(value) {
  return new Date(value).toLocaleDateString('es-CR', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function diasLabel(dias) {
  if (dias === 0) return 'Vence hoy'
  if (dias > 0) return `Vence en ${dias} día${dias === 1 ? '' : 's'}`
  const abs = Math.abs(dias)
  return `Vencida hace ${abs} día${abs === 1 ? '' : 's'}`
}

// Calcula el payload a enviar al PATCH según el tipo de pago registrado.
export function calcularPayloadPago(cuenta, { tipo, monto, notas }) {
  if (tipo === 'completo') {
    return { estado: 'PAGADA', saldoPendiente: 0, notas }
  }

  const montoAbonado = Math.max(0, Number(monto) || 0)
  const nuevoSaldo = Math.max(0, cuenta.saldoPendiente - montoAbonado)
  const estado = nuevoSaldo === 0 ? 'PAGADA' : 'PARCIAL'

  return { estado, saldoPendiente: nuevoSaldo, notas }
}
