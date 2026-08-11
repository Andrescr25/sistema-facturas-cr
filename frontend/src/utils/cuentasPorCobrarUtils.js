/**
 * Formateo y helpers puros de Cuentas por Cobrar. Reutiliza formatCurrency/
 * formatDate/diasLabel de pagosProveedoresUtils (mismo formato de moneda y
 * de "vence en N días" que ya usa Pagos Proveedores, el módulo hermano) en
 * vez de duplicarlos.
 */

export { formatCurrency, formatDate, diasLabel } from './pagosProveedoresUtils'

// Métodos de pago fijos para Costa Rica — mismos valores que ya acepta
// Alegra en este proyecto (ver facturacion.service.js:getPaymentMethods).
export const METODOS_PAGO = [
  { id: 'cash', label: 'Efectivo' },
  { id: 'transfer', label: 'Transferencia Bancaria' },
  { id: 'credit-card', label: 'Tarjeta de Crédito' },
  { id: 'debit-card', label: 'Tarjeta de Débito' },
  { id: 'check', label: 'Cheque' }
]

export const ESTADO_FACTURA_ESTILO = {
  PENDIENTE: { badge: 'bg-gray-100 text-gray-700', borde: 'border-l-gray-300' },
  PARCIAL: { badge: 'bg-blue-100 text-blue-800', borde: 'border-l-blue-400' },
  VENCIDA: { badge: 'bg-red-100 text-red-800', borde: 'border-l-red-400' }
}
