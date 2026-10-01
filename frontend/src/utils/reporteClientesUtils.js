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

/**
 * Una fecha de calendario 'YYYY-MM-DD' como día LOCAL. `new Date('2026-09-10')`
 * es medianoche UTC, que en Costa Rica todavía es el 9: desde que el reporte
 * lee la factura propia (fecha de calendario, migración 032) mostraba cada
 * factura con un día menos. Lo demás (un instante) se lee tal cual.
 */
function fechaLocal(valor) {
  const soloDia = String(valor ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return soloDia ? new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3])) : new Date(valor)
}

export function formatDate(dateString) {
  return fechaLocal(dateString).toLocaleDateString('es-CR', { year: 'numeric', month: 'long', day: 'numeric' })
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

// ==================== CHECKLIST DE BODEGA ====================
// Un producto está "revisado" cuando ya se decidió qué llegó de él: todo,
// una parte, o nada. Mientras no haya decisión sigue "por revisar". Esto es
// lo que alimenta el progreso de la factura y el estado de la card del cliente.

export function productosValidosDe(factura) {
  return factura.productos_faltantes.filter(p => Number(p.cantidad_faltante) > 0)
}

export function productoEstaRevisado(factura, producto, entregasAjustadas) {
  const key = getProductKey(factura, producto)
  return entregasAjustadas.get(key)?.revisado === true
}

export function productoTieneRespuesta(factura, producto, entregasAjustadas) {
  const key = getProductKey(factura, producto)
  return entregasAjustadas.has(key)
}

export function getFacturaProgreso(factura, entregasAjustadas) {
  const productos = productosValidosDe(factura)
  const revisados = productos.filter(p => productoEstaRevisado(factura, p, entregasAjustadas)).length
  const conRespuesta = productos.filter(p => productoTieneRespuesta(factura, p, entregasAjustadas)).length
  return {
    total: productos.length,
    revisados,
    conRespuesta,
    porRevisar: productos.length - revisados,
    porcentaje: productos.length === 0 ? 100 : Math.round((revisados / productos.length) * 100)
  }
}

export function facturaListaParaImprimir(factura, entregasAjustadas) {
  const progreso = getFacturaProgreso(factura, entregasAjustadas)
  return progreso.total === 0 || progreso.porRevisar === 0
}

export const CLIENTE_ESTADO = {
  LISTA: 'lista',                            // todas las facturas ya procesadas
  LISTO_PARA_PROCESAR: 'listo_para_procesar', // todo revisado, falta enviar a impresión
  EN_PROGRESO: 'en_progreso',                // empezado, quedan productos por revisar
  SIN_EMPEZAR: 'sin_empezar'                 // nada revisado todavía
}

export function facturaEstaActiva(factura, facturasEstado) {
  const e = getFacturaEstado(factura, facturasEstado)
  return e.estado !== 'procesado' && e.estado !== 'en_cola_impresion'
}

/**
 * Estado agregado de un cliente para la card del listado. `esSinCaja` es una
 * alerta que se superpone al estado de progreso, no lo reemplaza.
 */
export function getClienteProgreso(cliente, facturasEstado, entregasAjustadas) {
  const facturasActivas = cliente.facturas_con_faltantes.filter(f => facturaEstaActiva(f, facturasEstado))

  let total = 0
  let revisados = 0
  let conRespuesta = 0
  facturasActivas.forEach(f => {
    const p = getFacturaProgreso(f, entregasAjustadas)
    total += p.total
    revisados += p.revisados
    conRespuesta += p.conRespuesta
  })
  const porRevisar = total - revisados

  let estado
  if (facturasActivas.length === 0) estado = CLIENTE_ESTADO.LISTA
  else if (porRevisar === 0) estado = CLIENTE_ESTADO.LISTO_PARA_PROCESAR
  else if (revisados > 0 || conRespuesta > 0) estado = CLIENTE_ESTADO.EN_PROGRESO
  else estado = CLIENTE_ESTADO.SIN_EMPEZAR

  return {
    estado,
    esSinCaja: clienteTieneSinCaja(cliente, facturasEstado),
    total,
    revisados,
    conRespuesta,
    porRevisar,
    facturasActivas: facturasActivas.length,
    facturasProcesadas: cliente.facturas_con_faltantes.length - facturasActivas.length
  }
}

// Orden en el listado: las alertas primero, lo terminado al fondo.
export function ordenClienteProgreso(progreso) {
  if (progreso.estado === CLIENTE_ESTADO.LISTA) return 4
  if (progreso.esSinCaja) return 0
  if (progreso.estado === CLIENTE_ESTADO.EN_PROGRESO) return 1
  if (progreso.estado === CLIENTE_ESTADO.LISTO_PARA_PROCESAR) return 2
  return 3
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
