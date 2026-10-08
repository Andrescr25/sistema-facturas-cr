/**
 * Las promociones son parte de la ficha, no un segundo catálogo arriba.
 * Reutiliza las listas ya cruzadas con los ids de ESTA rama por el hook.
 * Solo adjunta datos: el precio base ya rebajado nunca se descuenta aquí.
 */
export function conPromocionesDelCatalogo(productos, rebajados = [], liquidacion = []) {
  const bajas = new Map(rebajados.map((p) => [String(p.id), p]))
  const excesos = new Map(liquidacion.map((p) => [String(p.id), p]))

  return productos.map((p) => {
    const baja = bajas.get(String(p.id))
    const exceso = excesos.get(String(p.id))
    // Conservar la referencia de las fichas normales evita volver a pintar
    // cientos de tarjetas memoizadas cuando cambian solo unas ofertas.
    if (!baja && !exceso) return p
    return {
      ...p,
      ...(baja ? { precioAntes: baja.precioAntes, bajaPorcentaje: baja.bajaPorcentaje } : {}),
      ...(exceso ? { descuentoPorcentaje: exceso.descuentoPorcentaje } : {})
    }
  })
}
