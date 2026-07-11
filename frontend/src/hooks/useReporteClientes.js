import { useState, useEffect, useCallback } from 'react'
import { alegraService } from '../services/alegraService'
import { getFacturaKey, getProductKey, getEntregaInfo, clienteTieneSinCaja } from '../utils/reporteClientesUtils'
import { useDialog } from './useDialog'
import { useToast } from './useToast'

/**
 * Estado y lógica de negocio del reporte de faltantes por cliente: carga,
 * ajustes de entrega por producto, y acciones sobre facturas (procesar,
 * recuperar, marcar/quitar pendiente). Extraído de ReporteClientes.jsx.
 *
 * Incluye confirm()/prompt() (useDialog) y showToast() (useToast) en vez de
 * window.confirm/window.prompt/window.alert. La página debe renderizar
 * <ConfirmModal {...dialogProps} /> y <ToastContainer toasts={toasts} onRemove={removeToast} />.
 */
export function useReporteClientes() {
  const { confirm, prompt, dialogProps } = useDialog()
  const { toasts, showToast, removeToast } = useToast()

  const [clientes, setClientes] = useState([])
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [entregasAjustadas, setEntregasAjustadas] = useState(new Map())
  const [historialCambios, setHistorialCambios] = useState(new Map())
  const [facturasEstado, setFacturasEstado] = useState(new Map())

  const loadReporte = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await alegraService.getReporteFaltantesCliente()

      if (result.success) {
        setClientes(result.data)
        setResumen(result.resumen)

        const estadosMap = new Map()
        const ajustesMap = new Map()

        result.data.forEach((cliente) => {
          cliente.facturas_con_faltantes.forEach((factura) => {
            const facturaKey = getFacturaKey(factura)

            if (factura.estado_procesamiento === 'procesado') {
              estadosMap.set(facturaKey, { estado: 'procesado', timestamp: factura.fecha_procesamiento || new Date().toISOString(), ajustes: [], requiere_reimpresion: false, origen: 'procesado' })
            } else if (factura.en_cola_impresion) {
              estadosMap.set(facturaKey, { estado: 'en_cola_impresion', timestamp: new Date().toISOString(), ajustes: [], requiere_reimpresion: true, origen: 'cola_impresion' })
            }

            factura.productos_faltantes.forEach((producto) => {
              const key = getProductKey(factura, producto)
              if (producto.cantidad_entregada > 0 || producto.ajuste_estado !== 'pendiente') {
                const cantidadEntregada = producto.cantidad_entregada || 0
                const cantidadAReducir = Math.max(producto.cantidad_faltante - cantidadEntregada, 0)
                ajustesMap.set(key, { faltanteId: producto.faltante_id, cantidadFaltante: producto.cantidad_faltante, cantidadEntregada, cantidadAReducir, estado: producto.ajuste_estado, tieneAjuste: true, requiereActualizacion: producto.requiere_actualizacion })
              }
            })

            if (factura.es_pendiente_manual && !estadosMap.has(facturaKey)) {
              estadosMap.set(facturaKey, { estado: 'pendiente', timestamp: factura.pendiente_desde || new Date().toISOString(), ajustes: [], requiere_reimpresion: false, origen: 'manual', motivo: factura.pendiente_motivo || '' })
            }
          })
        })

        setFacturasEstado(estadosMap)
        setEntregasAjustadas(ajustesMap)
      } else {
        setError(result.message || 'Error cargando reporte')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReporte()
  }, [loadReporte])

  // ==================== ACCIONES SOBRE FACTURAS ====================

  const handleFacturaLista = useCallback(async (clienteNombre, factura) => {
    const ajustesFactura = []
    factura.productos_faltantes.forEach((producto) => {
      const key = getProductKey(factura, producto)
      const ajuste = entregasAjustadas.get(key)
      if (ajuste) {
        ajustesFactura.push({ producto_codigo: producto.codigo, producto_nombre: producto.nombre, cantidad_faltante: producto.cantidad_faltante, cantidad_entregada: ajuste.cantidadEntregada, estado: ajuste.estado, requiere_actualizacion: ajuste.requiereActualizacion })
      } else {
        ajustesFactura.push({ producto_codigo: producto.codigo, producto_nombre: producto.nombre, cantidad_faltante: producto.cantidad_faltante, cantidad_entregada: 0, estado: 'pendiente', requiere_actualizacion: true })
      }
    })

    const facturaData = {
      alegra_id: factura.alegra_id, numero_factura: factura.numero_factura, cliente_nombre: clienteNombre, fecha_emision: factura.fecha_emision, ajustes: ajustesFactura,
      estado: ajustesFactura.length > 0 ? (ajustesFactura.some(aj => aj.requiere_actualizacion) ? 'requiere_reimpresion_con_ajustes' : 'requiere_reimpresion_solo_precios') : 'requiere_reimpresion_solo_precios',
      marcar_como_procesada: false
    }

    const ajustesHechos = ajustesFactura.filter(aj => aj.cantidad_entregada > 0).length
    const faltantesPendientes = ajustesFactura.filter(aj => aj.cantidad_entregada === 0).length
    const requiereReimpresion = ajustesFactura.some(aj => aj.requiere_actualizacion)

    const resumenMsg = `Cliente: ${clienteNombre}\nTotal productos con faltantes: ${ajustesFactura.length}\n  • Ajustados: ${ajustesHechos}\n  • Pendientes: ${faltantesPendientes}\n\n${requiereReimpresion ? '🖨️ Se enviará a Impresión para hacer cambios' : '✅ Sin cambios necesarios'}`
    const confirmado = await confirm(resumenMsg, {
      title: `Procesar Factura #${factura.numero_factura}`,
      confirmLabel: 'Procesar'
    })
    if (!confirmado) return

    try {
      await alegraService.procesarFacturaIndividual(facturaData)
      const facturaKey = getFacturaKey(factura)
      const nuevosEstados = new Map(facturasEstado)
      nuevosEstados.set(facturaKey, { estado: 'procesado', timestamp: new Date().toISOString(), ajustes: ajustesFactura, requiere_reimpresion: requiereReimpresion, origen: 'procesado' })
      setFacturasEstado(nuevosEstados)

      setClientes(prev => prev.map(cliente => {
        if (cliente.nombre !== clienteNombre) return cliente
        const facturasActualizadas = cliente.facturas_con_faltantes.map(f => { if (getFacturaKey(f) !== facturaKey) return f; return { ...f, es_pendiente_manual: false, pendiente_desde: null, pendiente_motivo: null } })
        return { ...cliente, facturas_con_faltantes: facturasActualizadas }
      }))

      showToast(`Factura #${factura.numero_factura} enviada a Impresión (${ajustesFactura.length} productos${requiereReimpresion ? ', requiere cambios' : ''}). Usa "Recuperar" si necesitas editarla.`, 'success')
    } catch (error) {
      showToast(`Error procesando factura: ${error.message}`, 'error')
    }
  }, [entregasAjustadas, facturasEstado, confirm, showToast])

  const handleRecuperarFactura = useCallback(async (factura) => {
    const facturaKey = getFacturaKey(factura)
    const confirmado = await confirm(`¿Recuperar factura #${factura.numero_factura} para editarla?`, { title: 'Recuperar factura' })
    if (!confirmado) return
    try {
      await alegraService.recuperarFactura(factura.alegra_id)
      const nuevosEstados = new Map(facturasEstado)
      nuevosEstados.delete(facturaKey)
      setFacturasEstado(nuevosEstados)
      setClientes(prev => prev.map(cliente => {
        const facturasActualizadas = cliente.facturas_con_faltantes.map(f => { if (getFacturaKey(f) !== facturaKey) return f; return { ...f, es_pendiente_manual: false, pendiente_desde: null, pendiente_motivo: null } })
        return { ...cliente, facturas_con_faltantes: facturasActualizadas }
      }))
      showToast(`Factura #${factura.numero_factura} recuperada.`, 'success')
    } catch (error) {
      showToast(`Error recuperando factura: ${error.message}`, 'error')
    }
  }, [facturasEstado, confirm, showToast])

  const handleMarcarFacturaPendiente = useCallback(async (factura, clienteNombre) => {
    const facturaKey = getFacturaKey(factura)
    const motivo = await prompt(`Notas para la factura #${factura.numero_factura} (opcional):`, {
      title: 'Marcar como pendiente',
      inputPlaceholder: 'Ej: esperando entrega del proveedor...',
      confirmLabel: 'Marcar pendiente'
    })
    try {
      await alegraService.marcarFacturaPendiente(factura.alegra_id, motivo)
      const timestamp = new Date().toISOString()
      const nuevosEstados = new Map(facturasEstado)
      nuevosEstados.set(facturaKey, { estado: 'pendiente', timestamp, ajustes: [], requiere_reimpresion: false, origen: 'manual', motivo: motivo || '' })
      setFacturasEstado(nuevosEstados)
      setClientes(prev => prev.map(cliente => {
        if (cliente.nombre !== clienteNombre) return cliente
        const facturasActualizadas = cliente.facturas_con_faltantes.map(f => { if (getFacturaKey(f) !== facturaKey) return f; return { ...f, es_pendiente_manual: true, pendiente_desde: timestamp, pendiente_motivo: motivo } })
        return { ...cliente, facturas_con_faltantes: facturasActualizadas }
      }))
      showToast(`Factura #${factura.numero_factura} marcada como pendiente.`, 'info')
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error')
    }
  }, [facturasEstado, prompt, showToast])

  const handleQuitarFacturaPendiente = useCallback(async (factura, clienteNombre) => {
    const facturaKey = getFacturaKey(factura)
    const confirmado = await confirm(`¿Quitar estado pendiente de #${factura.numero_factura}?`, { title: 'Quitar pendiente' })
    if (!confirmado) return
    try {
      await alegraService.quitarFacturaPendiente(factura.alegra_id)
      const nuevosEstados = new Map(facturasEstado)
      nuevosEstados.delete(facturaKey)
      setFacturasEstado(nuevosEstados)
      setClientes(prev => prev.map(cliente => {
        if (cliente.nombre !== clienteNombre) return cliente
        const facturasActualizadas = cliente.facturas_con_faltantes.map(f => { if (getFacturaKey(f) !== facturaKey) return f; return { ...f, es_pendiente_manual: false, pendiente_desde: null, pendiente_motivo: null } })
        return { ...cliente, facturas_con_faltantes: facturasActualizadas }
      }))
      showToast('Estado pendiente removido.', 'success')
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error')
    }
  }, [facturasEstado, confirm, showToast])

  // ==================== AJUSTES DE ENTREGA POR PRODUCTO ====================

  const guardarHistorial = useCallback((key, accion, valorAnterior, valorNuevo) => {
    setHistorialCambios(prev => {
      const newHistorial = new Map(prev)
      newHistorial.set(`${key}-${Date.now()}`, { key, accion, valorAnterior, valorNuevo, timestamp: new Date() })
      return newHistorial
    })
  }, [])

  const guardarAjusteEnBD = useCallback(async (producto, ajuste) => {
    if (!producto?.faltante_id) return
    try {
      await alegraService.guardarAjusteFaltante({ faltanteId: producto.faltante_id, cantidadEntregada: ajuste.cantidad_entregada, estado: ajuste.estado, requiereActualizacion: ajuste.requiere_actualizacion })
    } catch (error) {
      setError(`Error guardando ajuste: ${error.message}`)
      throw error
    }
  }, [])

  const eliminarAjusteDeBD = useCallback(async (producto) => {
    if (!producto?.faltante_id) return
    try {
      await alegraService.eliminarAjusteFaltante(producto.faltante_id)
    } catch (error) {
      setError(`Error eliminando ajuste: ${error.message}`)
      throw error
    }
  }, [])

  const handleCantidadEntregadaChange = useCallback(async (key, cantidadEntregada, producto) => {
    setError(null)
    const cantidadNumerica = Number.parseInt(cantidadEntregada ?? 0, 10)
    const cantidadFaltante = producto.cantidad_faltante
    const cantidadNormalizada = Number.isNaN(cantidadNumerica) ? 0 : Math.min(Math.max(cantidadNumerica, 0), cantidadFaltante)
    const entregaAnterior = getEntregaInfo(key, producto, entregasAjustadas)
    if (cantidadNormalizada === (entregaAnterior.cantidadEntregada ?? 0)) return
    if (entregaAnterior.tieneAjuste) guardarHistorial(key, 'cambio_cantidad', entregaAnterior.cantidadEntregada, cantidadNormalizada)
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    let estado = 'pendiente', cantidadAReducir = 0, requiereActualizacion = false
    if (cantidadNormalizada >= cantidadFaltante) { estado = 'completo' }
    else if (cantidadNormalizada > 0) { estado = 'parcial'; cantidadAReducir = Math.max(cantidadFaltante - cantidadNormalizada, 0); requiereActualizacion = true }
    if (cantidadNormalizada === 0) { newMap.delete(key); setEntregasAjustadas(newMap); try { await eliminarAjusteDeBD(producto) } catch (e) { setEntregasAjustadas(prevMap) }; return }
    newMap.set(key, { faltanteId: producto.faltante_id, cantidadFaltante, cantidadEntregada: cantidadNormalizada, cantidadAReducir, estado, tieneAjuste: true, requiereActualizacion })
    setEntregasAjustadas(newMap)
    try { await guardarAjusteEnBD(producto, { cantidad_entregada: cantidadNormalizada, estado, requiere_actualizacion: requiereActualizacion }) } catch (e) { setEntregasAjustadas(prevMap) }
  }, [entregasAjustadas, guardarHistorial, guardarAjusteEnBD, eliminarAjusteDeBD])

  const handleMarcarCompleto = useCallback(async (key, producto) => {
    guardarHistorial(key, 'marcar_completo', getEntregaInfo(key, producto, entregasAjustadas).cantidadEntregada, producto.cantidad_faltante)
    await handleCantidadEntregadaChange(key, producto.cantidad_faltante, producto)
  }, [entregasAjustadas, guardarHistorial, handleCantidadEntregadaChange])

  const handleDeshacer = useCallback(async (key, producto) => {
    guardarHistorial(key, 'deshacer', getEntregaInfo(key, producto, entregasAjustadas).cantidadEntregada, 0)
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    newMap.delete(key)
    setEntregasAjustadas(newMap)
    try { await eliminarAjusteDeBD(producto) } catch (e) { setEntregasAjustadas(prevMap) }
  }, [entregasAjustadas, guardarHistorial, eliminarAjusteDeBD])

  const handleNoLlegoNada = useCallback(async (key, producto) => {
    guardarHistorial(key, 'no_llego_nada', getEntregaInfo(key, producto, entregasAjustadas).cantidadEntregada, -1)
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    newMap.set(key, { faltanteId: producto.faltante_id, cantidadFaltante: producto.cantidad_faltante, cantidadEntregada: 0, cantidadAReducir: producto.cantidad_faltante, estado: 'no_llego', tieneAjuste: true, requiereActualizacion: true })
    setEntregasAjustadas(newMap)
    try { await guardarAjusteEnBD(producto, { cantidad_entregada: 0, estado: 'no_llego', requiere_actualizacion: true }) } catch (e) { setEntregasAjustadas(prevMap) }
  }, [entregasAjustadas, guardarHistorial, guardarAjusteEnBD])

  // ==================== CONTADORES ====================

  const contarAjustes = useCallback(() => entregasAjustadas.size, [entregasAjustadas])
  const contarFacturasProcesadas = useCallback(() => Array.from(facturasEstado.values()).filter(e => e.estado === 'procesado').length, [facturasEstado])
  const contarFacturasPendientes = useCallback(() => Array.from(facturasEstado.values()).filter(e => e.estado === 'pendiente' && e.origen === 'manual').length, [facturasEstado])
  const contarClientesSinCaja = useCallback(() => clientes.filter(c => clienteTieneSinCaja(c, facturasEstado)).length, [clientes, facturasEstado])

  return {
    clientes,
    resumen,
    loading,
    error,
    entregasAjustadas,
    historialCambios,
    facturasEstado,
    loadReporte,
    handleFacturaLista,
    handleRecuperarFactura,
    handleMarcarFacturaPendiente,
    handleQuitarFacturaPendiente,
    handleCantidadEntregadaChange,
    handleMarcarCompleto,
    handleDeshacer,
    handleNoLlegoNada,
    contarAjustes,
    contarFacturasProcesadas,
    contarFacturasPendientes,
    contarClientesSinCaja,
    dialogProps,
    toasts,
    removeToast
  }
}
