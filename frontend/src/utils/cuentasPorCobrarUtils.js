/**
 * Lo que solo usa Cuentas por Cobrar.
 *
 * Todo lo que comparte con Pagos a Proveedores —moneda, fechas, el texto de
 * "vence en N días", los colores de cada estado— se mudó a utils/pagos.js
 * cuando las dos pantallas pasaron a armarse con los mismos componentes.
 * Acá quedan los métodos de pago, que son de cobrar y de nadie más.
 *
 * Se sigue re-exportando el formateo para no tocar ModalAbono y CuadreCajaDia,
 * que ya lo importaban de acá.
 */

export { formatCurrency, formatDate, diasLabel } from './pagos'

// Métodos de pago fijos para Costa Rica — mismos valores que ya acepta
// Alegra en este proyecto (ver facturacion.service.js:getPaymentMethods).
export const METODOS_PAGO = [
  { id: 'cash', label: 'Efectivo' },
  { id: 'transfer', label: 'Transferencia Bancaria' },
  { id: 'credit-card', label: 'Tarjeta de Crédito' },
  { id: 'debit-card', label: 'Tarjeta de Débito' },
  { id: 'check', label: 'Cheque' }
]
