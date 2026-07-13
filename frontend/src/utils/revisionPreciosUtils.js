/**
 * Cálculos puros de la revisión de precios: redondeo, análisis de
 * costo/precio/margen de un producto, info de cantidad con factor de
 * conversión, y el factor de conversión mismo. Extraído de
 * RevisionPrecios.jsx.
 */

// Redondear a la decena más cercana terminada en 5 o 0
export function redondearPrecio(precio) {
  return Math.round(precio / 5) * 5
}

export function analizarProducto(producto, { productosAlegra, preciosAjustados }) {
  const alegraData = productosAlegra[producto.alegraItemId] || {}

  // Usar el porcentaje de IVA real del producto (viene del backend)
  const IVA_PORCENTAJE = alegraData.taxPercentage || 13 // Default 13% si no viene

  // Costo Anterior: último costo en Alegra (antes de esta factura)
  const costoAnterior = alegraData.cost || 0

  // Aplicar factor de conversión a la cantidad
  // SIEMPRE aplicar el factor para convertir cantidad del proveedor a tu sistema
  // Ejemplo: Proveedor 1 → Yo 100 → Factor 100 → 1 × 100 = 100 ✓
  // Ejemplo: Proveedor 50 → Yo 1 → Factor 0.02 → 50 × 0.02 = 1 ✓
  const factorConversion = producto.mapeo?.factorConversion || 1
  const cantidadReal = producto.cantidad * factorConversion

  // Costo Nuevo: precio REAL considerando descuentos Y factor de conversión
  // totalLinea ya incluye descuentos e impuestos aplicados
  const costoNuevoConIva = cantidadReal > 0
    ? (producto.totalLinea / cantidadReal)
    : producto.precioUnitario || 0
  const costoNuevoSinIva = costoNuevoConIva / (1 + IVA_PORCENTAJE / 100)

  // Precio de venta ACTUAL (CON IVA desde el backend)
  const precioVentaConIva = alegraData.price || 0
  const precioVentaSinIva = precioVentaConIva / (1 + IVA_PORCENTAJE / 100)

  // Precio AJUSTADO por el usuario (si existe)
  const precioAjustadoInput = preciosAjustados[producto.id]
  const precioAjustadoSinIva = precioAjustadoInput || precioVentaSinIva
  const precioAjustadoConIva = precioAjustadoSinIva * (1 + IVA_PORCENTAJE / 100)

  // MARGEN sobre precio SIN IVA (como debe ser)
  // Margen = (Precio - Costo) / Precio * 100
  const margenActual = precioVentaSinIva > 0
    ? ((precioVentaSinIva - costoNuevoSinIva) / precioVentaSinIva) * 100
    : 0

  const margenNuevo = precioAjustadoSinIva > 0
    ? ((precioAjustadoSinIva - costoNuevoSinIva) / precioAjustadoSinIva) * 100
    : 0

  // Cambio de costo: cuánto aumentó/disminuyó respecto al anterior
  const cambioCosto = costoAnterior > 0
    ? ((costoNuevoConIva - costoAnterior) / costoAnterior) * 100
    : 0

  // Precio sugerido (margen 20% sobre precio SIN IVA)
  const precioSugeridoSinIva = costoNuevoSinIva > 0 ? costoNuevoSinIva / 0.80 : 0
  const precioSugeridoConIva = precioSugeridoSinIva * (1 + IVA_PORCENTAJE / 100)

  const alertas = []
  if (cambioCosto > 30) {
    alertas.push({
      tipo: 'warning',
      mensaje: `Costo aumentó ${Math.round(cambioCosto)}%`
    })
  }
  if (margenNuevo < 15 && margenNuevo > 0) {
    alertas.push({
      tipo: 'danger',
      mensaje: `Margen muy bajo: ${Math.round(margenNuevo)}% (sugerido 20%: ₡${Math.round(precioSugeridoSinIva)} sin IVA)`
    })
  } else if (margenNuevo >= 15 && margenNuevo < 20 && margenNuevo > 0) {
    alertas.push({
      tipo: 'warning',
      mensaje: `Margen ajustado: ${Math.round(margenNuevo)}% (recomendado 20%: ₡${Math.round(precioSugeridoSinIva)} sin IVA)`
    })
  }

  return {
    // Cantidades
    cantidadReal,
    factorConversion,

    // Costos
    costoAnterior,
    costoNuevoConIva,
    costoNuevoSinIva,

    // Precios actuales
    precioVentaSinIva,
    precioVentaConIva,

    // Precios ajustados
    precioAjustadoSinIva,
    precioAjustadoConIva,

    // Precio sugerido
    precioSugeridoSinIva,
    precioSugeridoConIva,

    // Márgenes y cambios
    margenActual,
    margenNuevo,
    cambioCosto,

    // Otros
    alertas,
    nombre: alegraData.name || producto.descripcion,
    precioModificado: preciosAjustados[producto.id] !== undefined,
    ivaPorcentaje: IVA_PORCENTAJE
  }
}

// Cantidad real (con factor de conversión aplicado) + texto de tooltip descriptivo
export function calcularInfoCantidad(producto) {
  const factorConversion = producto.mapeo?.factorConversion || 1
  const cantidadReal = producto.cantidad * factorConversion
  const hayConversion = factorConversion !== 1
  const cantidadRealFormateada = Number.isInteger(cantidadReal) ? cantidadReal : cantidadReal.toFixed(2)

  let tooltipText = `Proveedor factura: ${producto.cantidad}\n`
  if (factorConversion >= 1) {
    tooltipText += `Factor: ×${factorConversion.toFixed(2)} (${factorConversion.toFixed(2)} tuyos por cada 1 del proveedor)`
  } else {
    tooltipText += `Factor: ×${factorConversion.toFixed(4)} (${producto.cantidad} del proveedor = ${cantidadReal} tuyo)`
  }
  tooltipText += `\nTú registras: ${cantidadRealFormateada}`

  return { factorConversion, cantidadReal, hayConversion, cantidadRealFormateada, tooltipText }
}

export function calcularFactorConversion(cantidadProveedor, cantidadMia) {
  return parseFloat(cantidadMia) / parseFloat(cantidadProveedor)
}

// Solo debe llamarse cuando factorConversion existe y es distinto de 1.
export function inferirCantidadesDesdeFactor(factorConversion) {
  if (factorConversion < 1) {
    return { cantidadProveedor: Math.round(1 / factorConversion), cantidadMia: 1 }
  }
  return { cantidadProveedor: 1, cantidadMia: Math.round(factorConversion) }
}
