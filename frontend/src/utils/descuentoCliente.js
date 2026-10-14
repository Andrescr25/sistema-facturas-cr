/** El margen se mide sobre el precio SIN IVA, antes de cualquier descuento. */
export function descuentoDelCliente(precio, costoSinIva, porcentaje) {
  const p = Number(precio)
  const c = Number(costoSinIva)
  return Number.isFinite(c) && c > 0 && p > 0 && c / p >= 0.05 &&
    p * 0.79 - c > 1e-9 * Math.max(1, p) ? Number(porcentaje) || 0 : 0
}

/** Conservar la rebaja original permite cambiar cliente o precio sin acumular. */
export function lineaConDescuentoCliente(item, condiciones) {
  const base = Math.max(Number(item.descuentoBase ?? item.discount) || 0, Number(item.ofertaExceso) || 0)
  const automatico = descuentoDelCliente(item.price,
    condiciones?.costos?.get(Number(item.productoId ?? item.id)), condiciones?.porcentaje)
  return { ...item, descuentoBase: base, descuentoCliente: automatico, discount: Math.max(base, automatico) }
}
