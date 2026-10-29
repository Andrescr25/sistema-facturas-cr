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
  const id = Number(item.productoId ?? item.id)
  // `aplica` llega en lugar de los costos a quien factura a precio de lista:
  // el servidor ya resolvió el margen, y no hace falta mostrarle el costo.
  const automatico = condiciones?.aplica
    ? (condiciones.aplica.has(id) ? Number(condiciones.porcentaje) || 0 : 0)
    : descuentoDelCliente(item.price, condiciones?.costos?.get(id), condiciones?.porcentaje)
  return { ...item, descuentoBase: base, descuentoCliente: automatico, discount: Math.max(base, automatico) }
}
