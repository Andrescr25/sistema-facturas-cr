import { useState, useEffect, useCallback, useRef } from 'react'
import { useContextoConsulta } from './useContextoConsulta'
import { useFiltroRutaReporteCliente } from './useFiltroRutaReporteCliente'
import { alegraService } from '../services/alegraService'
import { colaImpresionService } from '../services/colaImpresionService'
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
  const filtroRuta = useFiltroRutaReporteCliente()
  const [vista, cambiarVista] = useState('activos')
  const { vigente, esActual, confirmar: confirmarLectura } = useContextoConsulta(JSON.stringify({ ...filtroRuta.params, vista }))
  const peticion = useRef(0)
  const { confirm, dialogProps } = useDialog()
  const { toasts, showToast, removeToast } = useToast()

  const [clientes, setClientes] = useState([])
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setErrorActual] = useState(null)
  const setError = useCallback(valor => { if (esActual()) setErrorActual(valor) }, [esActual])
  // También el rollback de un ajuste pertenece a su ruta. Un fallo tardío
  // no puede reemplazar las respuestas que ya llegaron para otra selección.
  const [entregasAjustadas, setEntregasAjustadasActual] = useState(new Map())
  const entregasActuales = useRef(entregasAjustadas)
  const entregasConfirmadas = useRef(new Map())
  const versionesAjuste = useRef(new Map())
  const guardadosPendientes = useRef(new Map())
  const setEntregasAjustadas = useCallback(valor => {
    if (!esActual()) return
    // La referencia también recoge cambios del mismo clic, antes del render.
    // Cada operación modifica su línea sobre el mapa más reciente.
    const siguiente = typeof valor === 'function' ? valor(entregasActuales.current) : valor
    entregasActuales.current = siguiente
    setEntregasAjustadasActual(siguiente)
  }, [esActual])
  const [historialCambios, setHistorialCambiosActual] = useState(new Map())
  const setHistorialCambios = useCallback(valor => { if (esActual()) setHistorialCambiosActual(valor) }, [esActual])
  const [facturasEstado, setFacturasEstadoActual] = useState(new Map())
  const setFacturasEstado = useCallback(valor => { if (esActual()) setFacturasEstadoActual(valor) }, [esActual])

  const loadReporte = useCallback(async () => {
    if (!esActual()) return
    const actual = ++peticion.current
    try {
      setLoading(true)
      setError(null)
      const result = await alegraService.getReporteFaltantesCliente({ ...filtroRuta.params, vista })
      if (!esActual() || actual !== peticion.current) return

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
        entregasConfirmadas.current = new Map(ajustesMap)
        setEntregasAjustadas(ajustesMap)
      } else {
        setClientes([])
        setResumen(null)
        setFacturasEstado(new Map())
        setEntregasAjustadas(new Map())
        entregasConfirmadas.current = new Map()
        setHistorialCambios(new Map())
        setError(result.message || 'Error cargando reporte')
      }
    } catch (err) {
      if (esActual() && actual === peticion.current) {
        setClientes([]); setResumen(null)
        setFacturasEstado(new Map()); setEntregasAjustadas(new Map()); setHistorialCambios(new Map())
        entregasConfirmadas.current = new Map()
        setError(err.message)
      }
    } finally {
      if (esActual() && actual === peticion.current) { confirmarLectura(); setLoading(false) }
    }
  }, [filtroRuta.params, vista, esActual, confirmarLectura, setError, setFacturasEstado, setEntregasAjustadas, setHistorialCambios])

  useEffect(() => {
    loadReporte()
  }, [loadReporte])

  // ==================== ACCIONES SOBRE FACTURAS ====================

  const esperarGuardados = useCallback(async factura => {
    while (esActual()) {
      const pendientes = factura.productos_faltantes.map(p => guardadosPendientes.current.get(p.faltante_id)).filter(Boolean)
      if (!pendientes.length) return
      const resultados = await Promise.allSettled(pendientes)
      const fallo = resultados.find(r => r.status === 'rejected')
      if (fallo) throw fallo.reason
    }
  }, [esActual])

  const handleFacturaLista = useCallback(async (clienteNombre, factura) => {
    try { await esperarGuardados(factura) }
    catch (e) { if (esActual()) showToast(`No se pudo guardar la revisión: ${e.message}`, 'error'); return }
    if (!esActual()) return
    const confirmadas = entregasConfirmadas.current
    if (!facturaListaParaImprimir(factura, confirmadas)) {
      const progreso = getFacturaProgreso(factura, confirmadas)
      showToast(`Falta revisar ${progreso.porRevisar} producto(s) antes de enviar a impresión`, 'warning')
      return
    }

    const ajustesFactura = []
    factura.productos_faltantes.forEach((producto) => {
      const key = getProductKey(factura, producto)
      const ajuste = confirmadas.get(key)
      if (ajuste) {
        ajustesFactura.push({ producto_codigo: producto.codigo, producto_nombre: producto.nombre, cantidad_faltante: producto.cantidad_faltante, cantidad_entregada: ajuste.cantidadEntregada, estado: ajuste.estado, requiere_actualizacion: ajuste.requiereActualizacion })
      } else {
        ajustesFactura.push({ producto_codigo: producto.codigo, producto_nombre: producto.nombre, cantidad_faltante: producto.cantidad_faltante, cantidad_entregada: 0, estado: 'pendiente', requiere_actualizacion: true })
      }
    })

    const ajustesHechos = ajustesFactura.filter(aj => aj.cantidad_entregada > 0).length
    const faltantesPendientes = ajustesFactura.filter(aj => aj.cantidad_entregada === 0).length
    const requiereReimpresion = ajustesFactura.some(aj => aj.requiere_actualizacion)

    const resumenMsg = `Cliente: ${clienteNombre}\nTotal productos con faltantes: ${ajustesFactura.length}\n  • Ajustados: ${ajustesHechos}\n  • Pendientes: ${faltantesPendientes}\n\n${requiereReimpresion ? '🖨️ Se enviará a Impresión para hacer cambios' : '✅ Sin cambios necesarios'}`
    const confirmado = await confirm(resumenMsg, {
      title: `Procesar Factura #${factura.numero_factura}`,
      confirmLabel: 'Procesar'
    })
    if (!confirmado || !esActual()) return

    try {
      await esperarGuardados(factura)
      if (!esActual()) return
      if (!facturaListaParaImprimir(factura, entregasConfirmadas.current)) {
        showToast('La revisión cambió. Confirma los productos antes de enviarla a Impresión.', 'warning')
        return
      }
      // Por el id PROPIO de la factura. El servidor arma los ajustes con lo
      // que esta pantalla fue guardando producto por producto; los de acá
      // son solo para el resumen de la confirmación.
      await colaImpresionService.enviarDesdeReporte(factura.factura_id)
      if (!esActual()) return
      const facturaKey = getFacturaKey(factura)
      // El mismo estado con que vuelve al recargar: en la cola de Impresión.
      setFacturasEstado(prev => new Map(prev).set(facturaKey, { estado: 'en_cola_impresion', timestamp: new Date().toISOString(), ajustes: ajustesFactura, requiere_reimpresion: true, origen: 'cola_impresion' }))

      showToast(`Factura #${factura.numero_factura} enviada a Impresión (${ajustesFactura.length} productos${requiereReimpresion ? ', requiere cambios' : ''}). Usa "Recuperar" si necesitas editarla.`, 'success')
    } catch (error) {
      showToast(`Error procesando factura: ${error.message}`, 'error')
    }
  }, [confirm, showToast, esActual, setFacturasEstado, esperarGuardados])

  const handleRecuperarFactura = useCallback(async (factura) => {
    const facturaKey = getFacturaKey(factura)
    const confirmado = await confirm(`¿Recuperar factura #${factura.numero_factura} para editarla?`, { title: 'Recuperar factura' })
    if (!confirmado || !esActual()) return
    try {
      await colaImpresionService.recuperarDesdeReporte(factura.factura_id)
      if (!esActual()) return
      setFacturasEstado(prev => { const nuevosEstados = new Map(prev); nuevosEstados.delete(facturaKey); return nuevosEstados })
      // Solo se recupera desde Activos: el historial ya pasó las 24 h (2026-10-24).
      await loadReporte()
      showToast(`Factura #${factura.numero_factura} recuperada.`, 'success')
    } catch (error) {
      showToast(`Error recuperando factura: ${error.message}`, 'error')
    }
  }, [confirm, showToast, esActual, setFacturasEstado, loadReporte])

  // ==================== AJUSTES DE ENTREGA POR PRODUCTO ====================

  const guardarHistorial = useCallback((key, accion, valorAnterior, valorNuevo) => {
    setHistorialCambios(prev => {
      const newHistorial = new Map(prev)
      newHistorial.set(`${key}-${Date.now()}`, { key, accion, valorAnterior, valorNuevo, timestamp: new Date() })
      return newHistorial
    })
  }, [setHistorialCambios])

  const serializarGuardado = useCallback((producto, trabajo) => {
    const id = producto?.faltante_id
    if (!id) return Promise.reject(new Error('Recarga el reporte: el producto no tiene un faltante válido.'))
    // Elegir otra respuesta o confirmar puede ocurrir antes del primer POST.
    // Una línea va en orden; distintas líneas siguen guardándose en paralelo.
    const anterior = guardadosPendientes.current.get(id) || Promise.resolve()
    const siguiente = anterior.catch(() => {}).then(() => {
      if (!esActual()) throw new Error('La selección cambió; recarga el reporte.')
      return trabajo()
    })
    guardadosPendientes.current.set(id, siguiente)
    const retirar = () => { if (guardadosPendientes.current.get(id) === siguiente) guardadosPendientes.current.delete(id) }
    siguiente.then(retirar, retirar)
    return siguiente
  }, [esActual])

  const guardarAjusteEnBD = useCallback(async (producto, ajuste) => {
    try {
      await serializarGuardado(producto, () => alegraService.guardarAjusteFaltante({
        faltanteId: producto.faltante_id,
        cantidadEntregada: ajuste.cantidad_entregada,
        estado: ajuste.estado,
        requiereActualizacion: ajuste.requiere_actualizacion,
        revisado: ajuste.revisado
      }))
    } catch (error) {
      setError(`Error guardando ajuste: ${error.message}`)
      throw error
    }
  }, [setError, serializarGuardado])

  const eliminarAjusteDeBD = useCallback(async (producto) => {
    try {
      await serializarGuardado(producto, () => alegraService.eliminarAjusteFaltante(producto.faltante_id))
    } catch (error) {
      setError(`Error eliminando ajuste: ${error.message}`)
      throw error
    }
  }, [setError, serializarGuardado])

  const cambiarEntrega = useCallback(async (key, producto, nueva) => {
    const version = Symbol()
    versionesAjuste.current.set(key, version)
    const poner = (mapa, entrega) => { const siguiente = new Map(mapa); if (entrega) siguiente.set(key, entrega); else siguiente.delete(key); return siguiente }
    setEntregasAjustadas(prev => poner(prev, nueva))
    try {
      if (nueva) await guardarAjusteEnBD(producto, {
        cantidad_entregada: nueva.cantidadEntregada, estado: nueva.estado,
        requiere_actualizacion: nueva.requiereActualizacion, revisado: nueva.revisado
      })
      else await eliminarAjusteDeBD(producto)
      if (esActual()) entregasConfirmadas.current = poner(entregasConfirmadas.current, nueva)
    } catch (e) {
      // Volver solo esta línea a lo persistido. Un fallo viejo tampoco puede
      // pisar una respuesta más nueva, ni borrar éxitos de otras líneas.
      if (versionesAjuste.current.get(key) === version) {
        setEntregasAjustadas(prev => poner(prev, entregasConfirmadas.current.get(key)))
      }
      throw e
    } finally {
      if (versionesAjuste.current.get(key) === version) versionesAjuste.current.delete(key)
    }
  }, [setEntregasAjustadas, guardarAjusteEnBD, eliminarAjusteDeBD, esActual])

  const handleCantidadEntregadaChange = useCallback(async (key, cantidadEntregada, producto) => {
    setError(null)
    const cantidadNumerica = Number.parseInt(cantidadEntregada ?? 0, 10)
    const cantidadFaltante = producto.cantidad_faltante
    const cantidadNormalizada = Number.isNaN(cantidadNumerica) ? 0 : Math.min(Math.max(cantidadNumerica, 0), cantidadFaltante)
    const entregaAnterior = getEntregaInfo(key, producto, entregasActuales.current)
    if (cantidadNormalizada === (entregaAnterior.cantidadEntregada ?? 0) && entregaAnterior.estado === 'parcial' && entregaAnterior.revisado === false) return
    if (entregaAnterior.tieneAjuste) guardarHistorial(key, 'cambio_cantidad', entregaAnterior.cantidadEntregada, cantidadNormalizada)
    const nuevoAjuste = cantidadNormalizada === 0 ? null : {
      faltanteId: producto.faltante_id,
      cantidadFaltante,
      cantidadEntregada: cantidadNormalizada,
      cantidadAReducir: Math.max(cantidadFaltante - cantidadNormalizada, 0),
      estado: cantidadNormalizada >= cantidadFaltante ? 'completo' : 'parcial',
      tieneAjuste: true,
      requiereActualizacion: cantidadNormalizada < cantidadFaltante,
      revisado: false
    }
    try { await cambiarEntrega(key, producto, nuevoAjuste) } catch { /* el banner explica el fallo */ }
  }, [guardarHistorial, cambiarEntrega, setError])

  const handleMarcarCompleto = useCallback(async (key, producto) => {
    guardarHistorial(key, 'marcar_completo', getEntregaInfo(key, producto, entregasActuales.current).cantidadEntregada, producto.cantidad_faltante)
    try {
      await cambiarEntrega(key, producto, {
        faltanteId: producto.faltante_id,
        cantidadFaltante: producto.cantidad_faltante,
        cantidadEntregada: producto.cantidad_faltante,
        cantidadAReducir: 0,
        estado: 'completo',
        tieneAjuste: true,
        requiereActualizacion: false,
        revisado: false
      })
    } catch { /* el banner explica el fallo */ }
  }, [guardarHistorial, cambiarEntrega])

  const handleNoLlegoNada = useCallback(async (key, producto) => {
    guardarHistorial(key, 'no_llego_nada', getEntregaInfo(key, producto, entregasActuales.current).cantidadEntregada, -1)
    try {
      await cambiarEntrega(key, producto, {
        faltanteId: producto.faltante_id,
        cantidadFaltante: producto.cantidad_faltante,
        cantidadEntregada: 0,
        cantidadAReducir: producto.cantidad_faltante,
        estado: 'no_llego',
        tieneAjuste: true,
        requiereActualizacion: true,
        revisado: false
      })
    } catch { /* el banner explica el fallo */ }
  }, [guardarHistorial, cambiarEntrega])

  const handleMarcarRevisado = useCallback(async (key, producto) => {
    const entrega = entregasActuales.current.get(key)
    if (!entrega) return
    guardarHistorial(key, 'marcar_revisado', false, true)
    try { await cambiarEntrega(key, producto, { ...entrega, revisado: true }) } catch { /* el banner explica el fallo */ }
  }, [guardarHistorial, cambiarEntrega])

  const handleReabrirRevision = useCallback(async (key, producto) => {
    const entrega = entregasActuales.current.get(key)
    if (!entrega) return
    guardarHistorial(key, 'reabrir_revision', true, false)
    try { await cambiarEntrega(key, producto, { ...entrega, revisado: false }) } catch { /* el banner explica el fallo */ }
  }, [guardarHistorial, cambiarEntrega])

  const handleQuitarRespuesta = useCallback(async (key, producto) => {
    guardarHistorial(key, 'quitar_respuesta', getEntregaInfo(key, producto, entregasActuales.current).cantidadEntregada, 0)
    try { await cambiarEntrega(key, producto, null) } catch { /* el banner explica el fallo */ }
  }, [guardarHistorial, cambiarEntrega])

  const handleMarcarFacturaRevisada = useCallback(async (factura) => {
    const promesasGuardado = []
    factura.productos_faltantes.forEach(producto => {
      const key = getProductKey(factura, producto)
      const entrega = entregasActuales.current.get(key)
      if (entrega && !entrega.revisado) promesasGuardado.push(cambiarEntrega(key, producto, { ...entrega, revisado: true }))
    })
    if (!promesasGuardado.length) return
    // Cada resultado conserva o revierte su propia línea, incluso si otra falla.
    const resultados = await Promise.allSettled(promesasGuardado)
    if (!esActual()) return
    const fallo = resultados.find(r => r.status === 'rejected')
    if (fallo) showToast(`Error confirmando revisión de la factura: ${fallo.reason.message}`, 'error')
    else showToast(`Factura #${factura.numero_factura} revisada correctamente`, 'success')
  }, [cambiarEntrega, showToast, esActual])

  // ==================== CONTADORES ====================

  const contarAjustes = useCallback(() => entregasAjustadas.size, [entregasAjustadas])
  const contarFacturasProcesadas = useCallback(() => Array.from(facturasEstado.values()).filter(e => e.estado === 'procesado').length, [facturasEstado])
  const contarClientesSinCaja = useCallback(() => clientes.filter(c => clienteTieneSinCaja(c, facturasEstado)).length, [clientes, facturasEstado])

  return {
    filtroRuta, vista, cambiarVista,
    clientes: vigente ? clientes : [],
    resumen: vigente ? resumen : null,
    loading: loading || !vigente,
    error: vigente ? error : null,
    entregasAjustadas: vigente ? entregasAjustadas : new Map(),
    historialCambios: vigente ? historialCambios : new Map(),
    facturasEstado: vigente ? facturasEstado : new Map(),
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
