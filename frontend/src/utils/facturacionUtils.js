/**
 * Normalización de impuestos, cálculos de totales de la factura en curso, y
 * detección de dispositivo móvil. Extraído de Facturacion.jsx.
 */

import { redondearDinero as dinero } from './moneda.js'

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

/** La factura redondea descuento, base e IVA por línea, antes de sumarlos. */
export function montosLineaFacturacion(item, impuestoPrincipal = null, impuestos = []) {
  const bruto = (Number(item.quantity) || 0) * (Number(item.price) || 0)
  const descuento = dinero(bruto * (Number(item.discount) || 0) / 100)
  const base = dinero(bruto - descuento)
  const tarifa = obtenerPorcentajeImpuesto(item.tax?.[0], impuestos) ??
    (Number(impuestoPrincipal?.percentage) || 0)
  return { base, descuento, impuesto: dinero(base * tarifa / 100) }
}

export function calcularSubtotal(items) {
  return dinero(items.reduce((sum, item) => sum + montosLineaFacturacion(item).base, 0))
}

export function calcularImpuestos(items, impuestoPrincipal, impuestos) {
  return dinero(items.reduce((sum, item) => sum + montosLineaFacturacion(item, impuestoPrincipal, impuestos).impuesto, 0))
}

export function calcularDescuentoGlobal(items, descuentoGlobal) {
  const subtotal = calcularSubtotal(items)
  return (subtotal * descuentoGlobal) / 100
}

export function calcularTotal(items, descuentoGlobal, impuestoPrincipal, impuestos) {
  const subtotal = calcularSubtotal(items)
  const impuesto = calcularImpuestos(items, impuestoPrincipal, impuestos)
  const descuento = calcularDescuentoGlobal(items, descuentoGlobal)
  return dinero(subtotal + impuesto - descuento)
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
    // La cola mantiene el contrato con que se creó. Solo clienteId señala
    // una ficha propia: `client` en un pendiente antiguo es el id de Alegra.
    const clienteInfo = pendiente.clienteId == null ? null :
      clientes.find(c => String(c.id) === String(pendiente.clienteId))
    const total = cache?.total ?? (pendiente.items || []).reduce(
      (sum, item) => sum + (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0), 0)
    const items = Array.isArray(cache?.lineas) && cache.lineas.length > 0
      ? cache.lineas.map(l => ({ nombre: l.nombre || l.descripcion || `Referencia ${l.referencia || l.productoId}`,
        cantidad: Number(l.cantidad) || 0, precio: Number(l.precioUnitario) || 0 }))
      : (pendiente.items || []).map(item => ({
        nombre: item.name || item.description || `Referencia ${item.reference || item.id}`,
        cantidad: parseFloat(item.quantity) || 0, precio: parseFloat(item.price) || 0
      }))

    return {
      localId: pendiente.localId,
      // Solo la copia del documento conoce el recorrido. El maestro actual
      // o el ciclo activo no completan un dato faltante de una cola antigua.
      ciclo: cache?.ciclo,
      anticipado: cache?.anticipado,
      clienteNombre: cache?.cliente?.nombre || clienteInfo?.name || `Cliente #${pendiente.clienteId ?? pendiente.client}`,
      total,
      items,
      cantidadItems: items.length,
      timestamp: pendiente.timestamp,
      intentosSincronizacion: pendiente.intentosSincronizacion || 0,
      errorSincronizacion: pendiente.errorSincronizacion || null
    }
  })
}

/**
 * El id PROPIO del cliente (`cliente.id`), o null si no lo tiene.
 *
 * Es el que se usa para pedir lo que suele llevar. Nunca `alegraId`: los dos
 * son números y el servidor no puede distinguirlos — con el de Alegra
 * responde, sin error, las compras de OTRO cliente.
 */
export function idPropioDelCliente(cliente) {
  const id = Number(cliente?.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * Las sugerencias que esta tablet puede agregar a la factura.
 *
 * Llegan con `producto.id`, el mismo id de `productos` y de las líneas: no
 * hay nada que traducir, solo dejar las que están en el catálogo descargado
 * (la que no está no se podría agregar).
 *
 * Antes se "traducían" como si trajeran el id de Alegra. Con ids propios eso
 * cambiaba un producto por otro: el 12 propio pasaba a ser el producto cuyo
 * id de Alegra es 12.
 */
export function sugerenciasDelCatalogo(sugerencias, productos) {
  const enCatalogo = new Set((productos || []).map(p => String(p.id)))
  const delCatalogo = (lista) => (lista || []).filter(s => enCatalogo.has(String(s.id)))
  return {
    habituales: delCatalogo(sugerencias?.habituales),
    perdidos: delCatalogo(sugerencias?.perdidos)
  }
}
