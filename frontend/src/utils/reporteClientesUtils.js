// Funciones puras de ReporteClientes.jsx: claves, formateo de fechas y
// lectura de estado de facturas/entregas a partir de los Maps del hook.

export function getFacturaKey(factura) {
  if (!factura) return 'factura-desconocida'
  const identifier = factura.alegra_id ?? factura.factura_local_id ?? factura.numero_factura ?? factura.id ?? 'sin-identificador'
  return `factura-${identifier}`
}

export function getProductKey(factura, producto) {
  if (producto?.faltante_id) return `faltante-${producto.faltante_id}`
  const facturaKey = getFacturaKey(factura)
  const productoId = producto?.producto_id ?? producto?.codigo ?? producto?.nombre ?? producto?.id ?? 'producto-sin-id'
  return `${facturaKey}::${productoId}`
}

export function getEntregaInfo(key, producto, entregasAjustadas) {
  const ajuste = entregasAjustadas.get(key)
  if (!ajuste) {
    return {
      faltanteId: producto.faltante_id,
      cantidadFaltante: producto.cantidad_faltante,
      cantidadEntregada: 0,
      cantidadAReducir: 0,
      estado: 'pendiente',
      tieneAjuste: false,
      requiereActualizacion: false
    }
  }
  return { ...ajuste, tieneAjuste: true }
}

export function getFacturaEstado(factura, facturasEstado) {
  return facturasEstado.get(getFacturaKey(factura)) || { estado: 'pendiente', origen: 'default' }
}

export function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('es-CR', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function formatDateTime(dateString) {
  if (!dateString) return 'Fecha no disponible'
  try {
    const fecha = typeof dateString === 'string' ? new Date(dateString) : dateString
    if (isNaN(fecha.getTime())) return 'Fecha inválida'
    return fecha.toLocaleString('es-CR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    return 'Error en fecha'
  }
}

// Sin caja = TODOS los items originales de la factura son faltante total
export function clienteTieneSinCaja(cliente, facturasEstado) {
  return cliente.facturas_con_faltantes.some(factura => {
    const estadoFactura = getFacturaEstado(factura, facturasEstado)
    if (estadoFactura.estado === 'procesado') return false
    const totalItemsOriginal = factura.total_items_factura || 0
    if (totalItemsOriginal === 0) return false
    const productosValidos = factura.productos_faltantes.filter(p => Number(p.cantidad_faltante) > 0)
    const faltantesTotales = productosValidos.filter(p => p.tipo_faltante === 'total')
    // Solo es sin caja si la cantidad de faltantes totales == total de items originales
    return faltantesTotales.length >= totalItemsOriginal
  })
}
