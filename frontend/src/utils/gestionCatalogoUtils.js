/**
 * Formateo de moneda y generación de referencia al duplicar un producto por
 * marca. Extraído de GestionCatalogo.jsx.
 */

export function formatCRC(value) {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    minimumFractionDigits: 2
  }).format(value)
}

export function generarReferenciaMarca(brandNameValue, productReference) {
  // Limpia espacios y caracteres especiales, y pasa a mayúsculas para el código de referencia
  const cleanBrand = brandNameValue.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  const cleanRef = (productReference || 'REF').replace(/[^a-zA-Z0-9-]/g, '').toUpperCase()

  return cleanBrand ? `${cleanRef}-${cleanBrand}` : `${cleanRef}-`
}
