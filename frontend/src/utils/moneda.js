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
