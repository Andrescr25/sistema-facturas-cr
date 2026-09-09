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

/**
 * Qué mandarle al PATCH según el tipo de pago registrado.
 *
 * Ya no lleva nota. El modal tenía un campo "Nota (opcional)" que sí se
 * guardaba en la base, pero no había dónde leerla: la única pantalla que la
 * mostraba era la tarjeta vieja de cuenta, que desapareció al unificar el
 * diseño con Cuentas por Cobrar. Quedó escribiendo a un lugar del que nada
 * la sacaba. En 311 cuentas nadie escribió una sola, así que se quitó el
 * campo en vez de sostener la ilusión de que alguien la iba a leer.
 *
 * La columna `notas` sigue en la base, intacta: no se borró nada.
 */
export function calcularPayloadPago(cuenta, { tipo, monto }) {
  if (tipo === 'completo') {
    return { estado: 'PAGADA', saldoPendiente: 0 }
  }

  const montoAbonado = Math.max(0, Number(monto) || 0)
  const nuevoSaldo = Math.max(0, cuenta.saldoPendiente - montoAbonado)
  const estado = nuevoSaldo === 0 ? 'PAGADA' : 'PARCIAL'

  return { estado, saldoPendiente: nuevoSaldo }
}
