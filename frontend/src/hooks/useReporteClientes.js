import { useState, useEffect, useCallback } from 'react'
import { alegraService } from '../services/alegraService'
import {
  getFacturaKey,
  getProductKey,
  getEntregaInfo,
  clienteTieneSinCaja,
  getFacturaProgreso,
  facturaListaParaImprimir
} from '../utils/reporteClientesUtils'
import { useDialog } from './useDialog'
import { useToast } from './useToast'

/**
 * Estado y lógica de negocio del reporte de faltantes por cliente: carga,
 * ajustes de entrega por producto, y acciones sobre facturas (procesar,
 * recuperar). Extraído de ReporteClientes.jsx.
 *
 * Incluye confirm() (useDialog) y showToast() (useToast) en vez de
 * window.confirm/window.alert. La página debe renderizar
 * <ConfirmModal {...dialogProps} /> y <ToastContainer toasts={toasts} onRemove={removeToast} />.
 */
export function useReporteClientes() {
  const { confirm, dialogProps } = useDialog()
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

            // La hora de la nota es la de la BASE: cuándo se mandó a Impresión
            // o cuándo se procesó. Antes "en impresión" llevaba la hora de
            // cargar la pantalla, y todos los pedidos salían con la misma.
            if (factura.estado_procesamiento === 'procesado') {
              estadosMap.set(facturaKey, { estado: 'procesado', timestamp: factura.fecha_procesamiento || null, ajustes: [], requiere_reimpresion: false, origen: 'procesado' })
            } else if (factura.en_cola_impresion) {
              estadosMap.set(facturaKey, { estado: 'en_cola_impresion', timestamp: factura.enviada_a_impresion_en || null, ajustes: [], requiere_reimpresion: true, origen: 'cola_impresion' })
            }

            factura.productos_faltantes.forEach((producto) => {
              const key = getProductKey(factura, producto)
              if (producto.cantidad_entregada > 0 || producto.ajuste_estado !== 'pendiente') {
                const cantidadEntregada = producto.cantidad_entregada || 0
                const cantidadAReducir = Math.max(producto.cantidad_faltante - cantidadEntregada, 0)
                ajustesMap.set(key, {
                  faltanteId: producto.faltante_id,
                  cantidadFaltante: producto.cantidad_faltante,
                  cantidadEntregada,
                  cantidadAReducir,
                  estado: producto.ajuste_estado,
                  tieneAjuste: true,
                  requiereActualizacion: producto.requiere_actualizacion,
                  revisado: producto.ajuste_revisado === true
                })
              }
            })
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
    if (!facturaListaParaImprimir(factura, entregasAjustadas)) {
      const progreso = getFacturaProgreso(factura, entregasAjustadas)
      showToast(`Falta revisar ${progreso.porRevisar} producto(s) antes de enviar a impresión`, 'warning')
      return
    }

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
      showToast(`Factura #${factura.numero_factura} recuperada.`, 'success')
    } catch (error) {
      showToast(`Error recuperando factura: ${error.message}`, 'error')
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
      await alegraService.guardarAjusteFaltante({
        faltanteId: producto.faltante_id,
        cantidadEntregada: ajuste.cantidad_entregada,
        estado: ajuste.estado,
        requiereActualizacion: ajuste.requiere_actualizacion,
        revisado: ajuste.revisado
      })
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
    if (cantidadNormalizada === (entregaAnterior.cantidadEntregada ?? 0) && entregaAnterior.estado === 'parcial' && entregaAnterior.revisado === false) return
    if (entregaAnterior.tieneAjuste) guardarHistorial(key, 'cambio_cantidad', entregaAnterior.cantidadEntregada, cantidadNormalizada)
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    let estado = 'pendiente', cantidadAReducir = 0, requiereActualizacion = false
    if (cantidadNormalizada >= cantidadFaltante) { estado = 'completo' }
    else if (cantidadNormalizada > 0) { estado = 'parcial'; cantidadAReducir = Math.max(cantidadFaltante - cantidadNormalizada, 0); requiereActualizacion = true }
    if (cantidadNormalizada === 0) {
      newMap.delete(key)
      setEntregasAjustadas(newMap)
      try { await eliminarAjusteDeBD(producto) } catch (e) { setEntregasAjustadas(prevMap) }
      return
    }
    const nuevoAjuste = {
      faltanteId: producto.faltante_id,
      cantidadFaltante,
      cantidadEntregada: cantidadNormalizada,
      cantidadAReducir,
      estado,
      tieneAjuste: true,
      requiereActualizacion,
      revisado: false
    }
    newMap.set(key, nuevoAjuste)
    setEntregasAjustadas(newMap)
    try {
      await guardarAjusteEnBD(producto, {
        cantidad_entregada: cantidadNormalizada,
        estado,
        requiere_actualizacion: requiereActualizacion,
        revisado: false
      })
    } catch (e) {
      setEntregasAjustadas(prevMap)
    }
  }, [entregasAjustadas, guardarHistorial, guardarAjusteEnBD, eliminarAjusteDeBD])

  const handleMarcarCompleto = useCallback(async (key, producto) => {
    guardarHistorial(key, 'marcar_completo', getEntregaInfo(key, producto, entregasAjustadas).cantidadEntregada, producto.cantidad_faltante)
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    const nuevoAjuste = {
      faltanteId: producto.faltante_id,
      cantidadFaltante: producto.cantidad_faltante,
      cantidadEntregada: producto.cantidad_faltante,
      cantidadAReducir: 0,
      estado: 'completo',
      tieneAjuste: true,
      requiereActualizacion: false,
      revisado: false
    }
    newMap.set(key, nuevoAjuste)
    setEntregasAjustadas(newMap)
    try {
      await guardarAjusteEnBD(producto, {
        cantidad_entregada: producto.cantidad_faltante,
        estado: 'completo',
        requiere_actualizacion: false,
        revisado: false
      })
    } catch (e) {
      setEntregasAjustadas(prevMap)
    }
  }, [entregasAjustadas, guardarHistorial, guardarAjusteEnBD])

  const handleNoLlegoNada = useCallback(async (key, producto) => {
    guardarHistorial(key, 'no_llego_nada', getEntregaInfo(key, producto, entregasAjustadas).cantidadEntregada, -1)
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    const nuevoAjuste = {
      faltanteId: producto.faltante_id,
      cantidadFaltante: producto.cantidad_faltante,
      cantidadEntregada: 0,
      cantidadAReducir: producto.cantidad_faltante,
      estado: 'no_llego',
      tieneAjuste: true,
      requiereActualizacion: true,
      revisado: false
    }
    newMap.set(key, nuevoAjuste)
    setEntregasAjustadas(newMap)
    try {
      await guardarAjusteEnBD(producto, {
        cantidad_entregada: 0,
        estado: 'no_llego',
        requiere_actualizacion: true,
        revisado: false
      })
    } catch (e) {
      setEntregasAjustadas(prevMap)
    }
  }, [entregasAjustadas, guardarHistorial, guardarAjusteEnBD])

  const handleMarcarRevisado = useCallback(async (key, producto) => {
    const entrega = entregasAjustadas.get(key)
    if (!entrega) return
    guardarHistorial(key, 'marcar_revisado', false, true)
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    const actualizado = { ...entrega, revisado: true }
    newMap.set(key, actualizado)
    setEntregasAjustadas(newMap)
    try {
      await guardarAjusteEnBD(producto, {
        cantidad_entregada: entrega.cantidadEntregada,
        estado: entrega.estado,
        requiere_actualizacion: entrega.requiereActualizacion,
        revisado: true
      })
    } catch (e) {
      setEntregasAjustadas(prevMap)
    }
  }, [entregasAjustadas, guardarHistorial, guardarAjusteEnBD])

  const handleReabrirRevision = useCallback(async (key, producto) => {
    const entrega = entregasAjustadas.get(key)
    if (!entrega) return
    guardarHistorial(key, 'reabrir_revision', true, false)
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    const actualizado = { ...entrega, revisado: false }
    newMap.set(key, actualizado)
    setEntregasAjustadas(newMap)
    try {
      await guardarAjusteEnBD(producto, {
        cantidad_entregada: entrega.cantidadEntregada,
        estado: entrega.estado,
        requiere_actualizacion: entrega.requiereActualizacion,
        revisado: false
      })
    } catch (e) {
      setEntregasAjustadas(prevMap)
    }
  }, [entregasAjustadas, guardarHistorial, guardarAjusteEnBD])

  const handleQuitarRespuesta = useCallback(async (key, producto) => {
    guardarHistorial(key, 'quitar_respuesta', getEntregaInfo(key, producto, entregasAjustadas).cantidadEntregada, 0)
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    newMap.delete(key)
    setEntregasAjustadas(newMap)
    try {
      await eliminarAjusteDeBD(producto)
    } catch (e) {
      setEntregasAjustadas(prevMap)
    }
  }, [entregasAjustadas, guardarHistorial, eliminarAjusteDeBD])

  const handleMarcarFacturaRevisada = useCallback(async (factura) => {
    const prevMap = new Map(entregasAjustadas)
    const newMap = new Map(entregasAjustadas)
    const promesasGuardado = []

    factura.productos_faltantes.forEach((producto) => {
      const key = getProductKey(factura, producto)
      const entrega = newMap.get(key)
      if (entrega && !entrega.revisado) {
        const actualizado = { ...entrega, revisado: true }
        newMap.set(key, actualizado)
        promesasGuardado.push(
          guardarAjusteEnBD(producto, {
            cantidad_entregada: entrega.cantidadEntregada,
            estado: entrega.estado,
            requiere_actualizacion: entrega.requiereActualizacion,
            revisado: true
          })
        )
      }
    })

    if (promesasGuardado.length === 0) return

    setEntregasAjustadas(newMap)
    try {
      await Promise.all(promesasGuardado)
      showToast(`Factura #${factura.numero_factura} revisada correctamente`, 'success')
    } catch (e) {
      setEntregasAjustadas(prevMap)
      showToast(`Error confirmando revisión de la factura: ${e.message}`, 'error')
    }
  }, [entregasAjustadas, guardarAjusteEnBD, showToast])

  // ==================== CONTADORES ====================

  const contarAjustes = useCallback(() => entregasAjustadas.size, [entregasAjustadas])
  const contarFacturasProcesadas = useCallback(() => Array.from(facturasEstado.values()).filter(e => e.estado === 'procesado').length, [facturasEstado])
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
    handleCantidadEntregadaChange,
    handleMarcarCompleto,
    handleDeshacer: handleQuitarRespuesta,
    handleQuitarRespuesta,
    handleNoLlegoNada,
    handleMarcarRevisado,
    handleMarcarFacturaRevisada,
    handleReabrirRevision,
    contarAjustes,
    contarFacturasProcesadas,
    contarClientesSinCaja,
    dialogProps,
    toasts,
    removeToast
  }
}
