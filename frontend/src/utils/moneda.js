/**
 * Plata, con la precisión que tiene la plata.
 *
 * Quitarle el IVA a un precio es una división, y una división deja cola:
 * ₡536,75 / 1,13 da 475,00000000000006. Ese número entraba tal cual en el
 * campo de "nuevo precio" y se leía como una pantalla rota.
 *
 * No se redondea a múltiplos de 5 acá a propósito: eso cambiaría el precio
 * actual del producto solo por abrir la factura, y parecería que alguien
 * propuso un cambio que nadie hizo. Dos decimales es lo que vale un colón.
 *
 * La misma cuenta en Facturación, Impresión y Revisión de precios.
 */
export function redondearDinero(v) {
  return Math.round((Number(v) || 0) * 100) / 100
}

/** Código visible para que un costo en USD nunca parezca un importe en CRC. */
export function formatearMoneda(valor, moneda = 'CRC') {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return '—'
  const codigo = String(moneda || 'CRC').trim().toUpperCase()
  try {
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: codigo,
      currencyDisplay: 'code', maximumFractionDigits: 2 }).format(Number(valor))
  } catch {
    return `${codigo} ${new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2,
      maximumFractionDigits: 2 }).format(Number(valor))}`
  }
}
