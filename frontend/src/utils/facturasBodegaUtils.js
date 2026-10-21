/**
 * Funciones puras del despacho de bodega: formateo, normalización de
 * referencias de producto, filtros de fecha/búsqueda, y construcción del
 * borrador de faltantes por factura. Extraído de FacturasBodega.jsx.
 *
 * SIN IMPORTS A PROPÓSITO: backend/tests/bodegaUtils.test.js carga este
 * archivo con `new Function`.
 */

const ZONA_CR = 'America/Costa_Rica'

/**
 * Una fecha de calendario 'YYYY-MM-DD' como día LOCAL. `new Date('2026-09-20')`
 * es medianoche UTC, que en Costa Rica todavía es el 19: la lista mostraba
 * cada factura con un día menos, y el filtro "desde" incluía el día anterior.
 */
export function fechaLocal(value) {
  if (!value) return null
  const texto = String(value)
  const soloDia = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (soloDia) return new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3]))
  const d = new Date(texto)
  return Number.isNaN(d.getTime()) ? null : d
}

export const formatCurrency = (value) =>
  new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(Number(value || 0))

export const formatDate = (value) => {
  const d = fechaLocal(value)
  return d
    ? d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Fecha no disponible'
}

/** El día en Costa Rica de un instante, como 'YYYY-MM-DD'. */
function diaCR(fecha) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_CR, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha)
}

/**
 * Cuándo se despachó, en palabras: "hoy 3:42 p. m.", "ayer 5:10 p. m." o
 * "20 sept, 3:42 p. m.". Sin hora (despachadas antes del 25 de agosto), null.
 */
export function horaDespacho(iso, ahora = new Date()) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const hora = d.toLocaleTimeString('es-CR', { timeZone: ZONA_CR, hour: 'numeric', minute: '2-digit' })
  const ayer = new Date(ahora.getTime() - 24 * 60 * 60 * 1000)
  if (diaCR(d) === diaCR(ahora)) return `hoy ${hora}`
  if (diaCR(d) === diaCR(ayer)) return `ayer ${hora}`
  const dia = d.toLocaleDateString('es-CR', { timeZone: ZONA_CR, day: 'numeric', month: 'short' })
  return `${dia}, ${hora}`
}

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

    const fechaFactura = fechaLocal(factura.fecha_emision)
    if (!fechaFactura) {
      return Boolean(mostrarSinFecha)
    }

    if (fechaInicio) {
      const inicio = fechaLocal(fechaInicio)
      if (inicio && fechaFactura < inicio) return false
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
      // El id propio del producto (la línea de la factura propia lo trae).
      producto_id: item.producto_id || null,
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

/**
 * Pone sobre el borrador lo que bodega ya registró de la factura (de
 * GET /bodega/facturas-propias/:id/estados), producto por producto: primero
 * por el id propio del producto, después por referencia y, si no, por el id
 * de Alegra. Un producto sin nada registrado queda como vino en el borrador.
 */
export function aplicarEstadosGuardados(draft, estados = []) {
  const porProductoId = new Map()
  const porReferencia = new Map()
  const porAlegraId = new Map()
  for (const e of estados) {
    if (e.productoId) porProductoId.set(String(e.productoId), e)
    if (e.referencia) porReferencia.set(String(e.referencia).trim(), e)
    if (e.alegraItemId) porAlegraId.set(String(e.alegraItemId).trim(), e)
  }
  const salida = {}
  for (const [key, item] of Object.entries(draft || {})) {
    const e = (item.producto_id && porProductoId.get(String(item.producto_id))) ||
      (item.referenciaReal && porReferencia.get(String(item.referenciaReal).trim())) ||
      (item.alegra_id && porAlegraId.get(String(item.alegra_id).trim())) || null
    if (!e) { salida[key] = item; continue }
    // 'completo' en la base es "no faltó nada", que en la pantalla es 'ninguno'.
    const tipo = e.tipoFaltante === 'completo' ? 'ninguno' : e.tipoFaltante
    salida[key] = {
      ...item,
      tipo,
      cantidadFaltante: tipo === 'ninguno' ? 0 : Number(e.cantidadFaltante) || 0,
      observaciones: e.observaciones || ''
    }
  }
  return salida
}

// Las copias sin ruta descargada no se adivinan. Con ruta elegida, solo se muestra una pertenencia conocida de la ficha.
export function coincideRutaBodega(factura, rutaId) {
  if (!rutaId) return true
  if (factura.ruta_id === undefined) return false
  return rutaId === 'sin-ruta' ? factura.ruta_id === null : String(factura.ruta_id) === String(rutaId)
}
