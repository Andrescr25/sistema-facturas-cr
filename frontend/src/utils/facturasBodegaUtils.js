/**
 * Funciones puras del despacho de bodega: formateo, normalización de
 * referencias de producto, filtros de fecha/búsqueda, y construcción del
 * borrador de faltantes por factura. Extraído de FacturasBodega.jsx.
 */

export const formatCurrency = (value) =>
  new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(Number(value || 0))

export const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('es-CR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
    : 'Fecha no disponible'

export const normalizeReferenceValue = (value) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' || typeof value === 'bigint') return value.toString()
  if (typeof value === 'object' && value !== null) {
    if (typeof value.reference === 'string' && value.reference.trim()) return value.reference.trim()
    if (typeof value.code === 'string' && value.code.trim()) return value.code.trim()
    if (typeof value.value === 'string' && value.value.trim()) return value.value.trim()
  }
  return ''
}

export const filtrarPendientesPorFecha = (lista = [], filtros = {}) => {
  if (!Array.isArray(lista) || lista.length === 0) return []
  const {
    fechaInicio = '',
    mostrarSinFecha = true
  } = filtros || {}

  if (!fechaInicio && mostrarSinFecha) {
    return lista
  }

  return lista.filter((factura) => {
    if (!factura.fecha_emision) {
      return Boolean(mostrarSinFecha)
    }

    const fechaFactura = new Date(factura.fecha_emision)
    if (Number.isNaN(fechaFactura.getTime())) {
      return Boolean(mostrarSinFecha)
    }

    if (fechaInicio) {
      const inicio = new Date(fechaInicio)
      inicio.setHours(0, 0, 0, 0)
      if (fechaFactura < inicio) return false
    }

    // No filtramos por fecha fin - mostramos desde fechaInicio hasta hoy
    return true
  })
}

export const getItemIdFromFacturaItem = (item) => {
  // Usar prefijos para evitar confusión entre referencia "100" y alegra_id 100
  const referencia = normalizeReferenceValue(
    item?.referencia ?? item?.reference ?? ''
  )
  if (referencia) return `REF-${referencia}`

  const codigoAlegra = item?.codigo_alegra ? item.codigo_alegra.toString() : ''
  if (codigoAlegra) return `ALG-${codigoAlegra}`

  const alegraId = item?.alegra_id ? item.alegra_id.toString() : ''
  if (alegraId) return `ALG-${alegraId}`

  const fallback = item?.id ? item.id.toString() : ''
  return fallback ? `ID-${fallback}` : ''
}

export const buildDraftForFactura = (factura) => {
  if (!factura || !Array.isArray(factura.items)) return {}
  const draft = {}
  factura.items.forEach((item, index) => {
    const key = getItemIdFromFacturaItem(item) || `item-${index}`

    // Extraer el valor sin prefijo para enviar al backend
    const referencia = normalizeReferenceValue(item?.referencia ?? item?.reference ?? '')
    const rawItemId = referencia ||
      item?.codigo_alegra ||
      item?.alegra_id ||
      item?.id ||
      null

    draft[key] = {
      key,
      itemId: rawItemId, // Solo para mostrar/depurar — NUNCA mandar esto al backend, ver referenciaReal/alegra_id
      nombre: item.nombre || item.name || item.description || 'Producto sin nombre',
      // Mostrar referencia real o codigo_alegra como fallback (NO codigo_producto/CABYS)
      referencia:
        normalizeReferenceValue(
          item?.referencia ?? item?.reference ?? ''
        ) || item?.codigo_alegra || item?.alegra_id || 'N/A',
      // Estos dos SÍ son seguros para mandar al backend: nunca se mezclan
      // entre sí, cada uno queda null si no se conoce con certeza.
      referenciaReal: referencia || null,
      alegra_id: item.alegra_id || item.id || null,
      cantidadFactura: Number(item?.cantidad ?? item?.quantity ?? 0),
      tipo: factura.estado_bodega === 'procesado' ? 'ninguno' : null,
      cantidadFaltante: 0,
      observaciones: ''
    }
  })
  return draft
}

export const filtrarPorBusqueda = (lista, searchQuery) => {
  if (!searchQuery.trim()) return lista

  const query = searchQuery.toLowerCase().trim()
  return lista.filter((factura) => {
    const numeroFactura = (factura.numero_completo || factura.numero_factura || '').toLowerCase()
    const clienteNombre = (factura.cliente_nombre || '').toLowerCase()
    const total = (factura.total || 0).toString()

    return numeroFactura.includes(query) ||
      clienteNombre.includes(query) ||
      total.includes(query)
  })
}

// Calcula cuántos días de historial pedirle al backend y el límite de
// facturas, según el filtro de fecha de inicio. Antes duplicado entre
// fetchFacturas y handleFilterChange.
export const calcularDiasYLimite = (fechaInicio) => {
  if (!fechaInicio) {
    return { dias: 30, limit: 40 }
  }
  const inicio = new Date(fechaInicio)
  const hoy = new Date()
  const diferenciaDias = Math.ceil((hoy - inicio) / (1000 * 60 * 60 * 24))
  const dias = Math.min(Math.max(diferenciaDias + 1, 30), 365)
  return { dias, limit: 120 }
}
