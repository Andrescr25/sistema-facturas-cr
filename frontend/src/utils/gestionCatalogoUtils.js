/**
 * Formateo de moneda. Extraído de GestionCatalogo.jsx.
 */

export function formatCRC(value) {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    minimumFractionDigits: 2
  }).format(value)
}
