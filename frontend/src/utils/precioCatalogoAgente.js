import { redondearDinero } from './moneda.js'

/** El mismo precio en ficha, presentación y vista previa; IVA de cada producto. */
export function precioCatalogoAgente(producto) {
  const descuento = Number(producto.descuentoPorcentaje) > 0 ? Number(producto.descuentoPorcentaje) : 0
  const precioAntes = Number(producto.precioAntes) > 0 ? Number(producto.precioAntes) : 0
  const base = Number.parseFloat(String(producto.price?.[0]?.price || 0).replace(/,/g, '')) || 0
  const iva = (producto.tax || []).reduce((s, t) => s + (Number.parseFloat(t.percentage) || 0), 0)
  // Igual que el catálogo de clientes: primero céntimos, después el formato.
  // 1.650 × 1,13 queda 1.864,499999…; formatearlo directo mostraba ₡1.864.
  const conIva = redondearDinero(base * (1 + iva / 100))
  const final = descuento > 0 ? redondearDinero(conIva * (1 - descuento / 100)) : conIva
  // La oferta por baja YA está en el precio; no descontarla otra vez.
  const tachado = descuento > 0 ? conIva : (precioAntes > conIva ? precioAntes : 0)
  const rebaja = descuento > 0 ? descuento : (tachado > 0 ? Math.round((tachado - conIva) / tachado * 100) : 0)
  return { final, tachado, rebaja, esOferta: descuento === 0 && tachado > 0, descuento }
}
