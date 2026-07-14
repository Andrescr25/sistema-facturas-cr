/**
 * Normalización de impuestos, cálculos de totales de la factura en curso, y
 * detección de dispositivo móvil. Extraído de Facturacion.jsx.
 */

// Helper: Obtener reference como string (puede venir como objeto o string desde Alegra)
export function getReference(ref) {
  if (!ref) return ''
  if (typeof ref === 'object' && ref.reference) return String(ref.reference)
  return String(ref)
}

export function normalizarImpuestos(lista = []) {
  return lista.map((imp) => ({
    ...imp,
    percentage: Number(imp.percentage ?? imp.rate ?? imp.value ?? 0)
  }))
}

export function ordenarImpuestos(lista = []) {
  return [...lista].sort((a, b) => (Number(b.percentage) || 0) - (Number(a.percentage) || 0))
}

export function seleccionarImpuestoPrincipal(lista = []) {
  if (!lista.length) return null
  const preferidoIVA = lista.find(
    (imp) =>
      Number(imp.percentage) >= 13 &&
      (imp.type?.toUpperCase() === 'IVA' || /iva/i.test(imp.name || ''))
  )
  return preferidoIVA || lista.find((imp) => Number(imp.percentage) >= 13) || lista[0]
}

export function obtenerPorcentajeImpuesto(taxItem, impuestos) {
  if (!taxItem) return null
  if (taxItem.percentage !== undefined) return Number(taxItem.percentage) || 0
  const encontrado = impuestos.find((imp) => imp.id === taxItem.id)
  if (encontrado) return Number(encontrado.percentage) || 0
  return null
}

export function calcularSubtotal(items) {
  return items.reduce((sum, item) => {
    const cantidad = Number(item.quantity) || 0
    const precio = Number(item.price) || 0
    const descuento = Number(item.discount) || 0
    const subtotalItem = cantidad * precio
    const descuentoItem = (subtotalItem * descuento) / 100
    return sum + (subtotalItem - descuentoItem)
  }, 0)
}

export function calcularImpuestos(items, impuestoPrincipal, impuestos) {
  return items.reduce((sum, item) => {
    const cantidad = Number(item.quantity) || 0
    const precio = Number(item.price) || 0
    const descuento = Number(item.discount) || 0
    const base = cantidad * precio * (1 - descuento / 100)
    const porcentaje =
      obtenerPorcentajeImpuesto(item.tax?.[0], impuestos) ??
      (impuestoPrincipal ? Number(impuestoPrincipal.percentage) || 0 : 0)
    return sum + (base * porcentaje) / 100
  }, 0)
}

export function calcularDescuentoGlobal(items, descuentoGlobal) {
  const subtotal = calcularSubtotal(items)
  return (subtotal * descuentoGlobal) / 100
}

export function calcularTotal(items, descuentoGlobal, impuestoPrincipal, impuestos) {
  const subtotal = calcularSubtotal(items)
  const impuesto = calcularImpuestos(items, impuestoPrincipal, impuestos)
  const descuento = calcularDescuentoGlobal(items, descuentoGlobal)
  return subtotal + impuesto - descuento
}

// Detección de dispositivo móvil (sin el efecto secundario de las clases del body,
// eso se queda en el hook porque manipula el DOM directamente).
export function detectarEsMobile() {
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const isMobileUserAgent = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  const isSmallScreen = window.innerWidth < 768
  const isTablet = window.innerWidth >= 768 && window.innerWidth <= 1024

  return isSmallScreen || (isTouchDevice && isMobileUserAgent && !isTablet)
}

export function scrollElementIntoView(ref, block = 'center') {
  if (ref.current) {
    ref.current.scrollIntoView({ behavior: 'smooth', block })
  }
}

// Combina las facturas pendientes de envío (cola de sincronización, con el
// error real de Alegra si lo hay) con su copia legible en el cache local
// (nombre de cliente, total) para poder mostrarlas de forma identificable
// en la pestaña "Editar Facturas" y que el usuario pueda diagnosticarlas.
export function enriquecerFacturasPendientes(facturasPendientes, facturasPrecargadas, clientes) {
  return facturasPendientes.map(pendiente => {
    const cache = facturasPrecargadas.find(
      f => f.localId === pendiente.localId || f.id === `local-${pendiente.localId}`
    )
    const clienteInfo = clientes.find(c => String(c.id) === String(pendiente.client))
    const total = cache?.total ?? (pendiente.items || []).reduce(
      (sum, item) => sum + (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0),
      0
    )
    // El cache local (facturaVista) trae los items con nombre legible;
    // el registro crudo de facturas_pendientes solo trae id/referencia.
    const items = (cache?.items && cache.items.length > 0 ? cache.items : pendiente.items || [])
      .map(item => ({
        nombre: item.name || item.description || `Referencia ${item.reference || item.id}`,
        cantidad: parseFloat(item.quantity) || 0,
        precio: parseFloat(item.price) || 0
      }))

    return {
      localId: pendiente.localId,
      clienteNombre: cache?.client?.name || clienteInfo?.name || `Cliente #${pendiente.client}`,
      total,
      items,
      cantidadItems: items.length,
      timestamp: pendiente.timestamp,
      intentosSincronizacion: pendiente.intentosSincronizacion || 0,
      errorSincronizacion: pendiente.errorSincronizacion || null
    }
  })
}
