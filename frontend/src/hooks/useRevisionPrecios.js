import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import { redondearPrecio, calcularFactorConversion, inferirCantidadesDesdeFactor } from '../utils/revisionPreciosUtils'
import { useDialog } from './useDialog'

/**
 * Estado y lógica de negocio de la revisión de precios: navegación
 * lista↔revisión, pestañas por estado de factura, ajuste de precios,
 * factor de conversión, y envío a Alegra. Extraído de RevisionPrecios.jsx.
 *
 * El toast (array, con duración null para el mensaje "enviando" persistente
 * y remoción por tipo) se mantiene con su implementación local igual que en
 * el original — no usa useToast() porque necesita poder quitar un toast por
 * `type` en vez de por `id`. Los 2 window.confirm se migraron a confirm()
 * de useDialog(); la página debe renderizar <ConfirmModal {...dialogProps} />.
 */
export function useRevisionPrecios() {
  const { confirm, dialogProps } = useDialog()

  // Estados principales
  const [vista, setVista] = useState('lista')
  const [facturas, setFacturas] = useState([])
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)
  const [productos, setProductos] = useState([])
  const [productosAlegra, setProductosAlegra] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Pestaña activa y filtros
  const [tabActiva, setTabActiva] = useState('PENDIENTE_RELACIONAR') // PENDIENTE_RELACIONAR, LISTAS_REVISION, ENVIADAS

  // Precios ajustados por el usuario
  const [preciosAjustados, setPreciosAjustados] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [devolviendo, setDevolviendo] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)

  // Factor de conversión inline
  const [modalFactor, setModalFactor] = useState(false)
  const [productoSeleccionadoFactor, setProductoSeleccionadoFactor] = useState(null)
  const [cantidadProveedor, setCantidadProveedor] = useState(1)
  const [cantidadMia, setCantidadMia] = useState(1)
  const [guardandoFactor, setGuardandoFactor] = useState(false)

  // Toast notifications
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type, duration }])
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const loadFacturas = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      let response

      if (tabActiva === 'PENDIENTE_RELACIONAR') {
        // Facturas procesadas pero sin relacionar completamente
        response = await api.get('/revision-precios/facturas?estado=PROCESADA')
      } else if (tabActiva === 'LISTAS_REVISION') {
        // Facturas 100% relacionadas listas para revisión
        response = await api.get('/revision-precios/facturas-relacionadas')
      } else if (tabActiva === 'ENVIADAS') {
        // Facturas ya enviadas a Alegra
        response = await api.get('/revision-precios/facturas?estado=ENVIADA')
      }

      if (response && response.data.success) {
        setFacturas(response.data.facturas || [])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [tabActiva])

  useEffect(() => {
    if (vista === 'lista') {
      loadFacturas()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, tabActiva])

  const sincronizarProductos = useCallback(async () => {
    try {
      setSincronizando(true)
      showToast('Sincronizando productos desde Alegra...', 'info')

      const response = await api.post('/alegra/sincronizar/cache-productos')

      if (response.data.success) {
        showToast(
          `Sincronización exitosa: ${response.data.total} productos actualizados`,
          'success'
        )
      }
    } catch (err) {
      console.error('Error sincronizando productos:', err)
      showToast(
        `Error al sincronizar: ${err.message}`,
        'error'
      )
    } finally {
      setSincronizando(false)
    }
  }, [showToast])

  const abrirRevision = useCallback(async (factura) => {
    try {
      setLoading(true)
      setFacturaSeleccionada(factura)
      setProductos(factura.productos)
      setPreciosAjustados({})

      // Obtener datos de Alegra para comparación
      const alegraIds = factura.productos
        .map(p => p.alegraItemId)
        .filter(Boolean)

      if (alegraIds.length > 0) {
        const response = await api.post('/revision-precios/productos-batch', {
          alegraIds
        })

        if (response.data.success) {
          setProductosAlegra(response.data.productos)
        }
      }

      setVista('revision')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const volverALista = useCallback(() => {
    setVista('lista')
    setFacturaSeleccionada(null)
    setProductos([])
    setProductosAlegra({})
    setPreciosAjustados({})
  }, [])

  const devolverFactura = useCallback(async () => {
    if (!facturaSeleccionada) return

    const confirmacion = await confirm(
      `¿Devolver factura ${facturaSeleccionada.numeroConsecutivo} a PROCESADA?\n\n` +
      `Esta acción permitirá revisar y corregir las relaciones de productos.`
    )

    if (!confirmacion) return

    try {
      setDevolviendo(true)
      const response = await api.post('/revision-precios/devolver-factura', {
        facturaId: facturaSeleccionada.id
      })

      if (response.data.success) {
        showToast('Factura devuelta a estado PROCESADA correctamente', 'success')
        volverALista()
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error')
    } finally {
      setDevolviendo(false)
    }
  }, [facturaSeleccionada, confirm, showToast, volverALista])

  const ajustarPrecio = useCallback((productoId, nuevoPrecio) => {
    setPreciosAjustados(prev => ({
      ...prev,
      [productoId]: parseFloat(nuevoPrecio) || 0
    }))
  }, [])

  const aplicarPrecioSugerido = useCallback((productoId, precioSugerido) => {
    const precioRedondeado = redondearPrecio(precioSugerido)
    ajustarPrecio(productoId, precioRedondeado)
  }, [ajustarPrecio])

  const abrirFactor = useCallback((producto) => {
    setProductoSeleccionadoFactor(producto)

    if (producto.mapeo?.factorConversion && producto.mapeo.factorConversion !== 1) {
      const { cantidadProveedor: cp, cantidadMia: cm } = inferirCantidadesDesdeFactor(producto.mapeo.factorConversion)
      setCantidadProveedor(cp)
      setCantidadMia(cm)
    } else {
      setCantidadProveedor(1)
      setCantidadMia(1)
    }

    setModalFactor(true)
  }, [])

  const guardarFactor = useCallback(async () => {
    if (!productoSeleccionadoFactor?.mapeo) return

    const cantProv = parseFloat(cantidadProveedor)
    const cantMia = parseFloat(cantidadMia)

    if (cantProv <= 0 || cantMia <= 0) {
      showToast('Las cantidades deben ser mayores a 0', 'error')
      return
    }

    const factor = calcularFactorConversion(cantProv, cantMia)

    try {
      setGuardandoFactor(true)
      const response = await api.post('/productos-revision/factor-conversion', {
        mapeoId: productoSeleccionadoFactor.mapeo.id,
        factorConversion: factor
      })

      if (response.data.success) {
        setProductos(prev => prev.map(p => {
          if (p.id === productoSeleccionadoFactor.id) {
            return {
              ...p,
              mapeo: {
                ...p.mapeo,
                factorConversion: factor
              }
            }
          }
          return p
        }))

        showToast('Factor de conversión guardado correctamente', 'success')
        setModalFactor(false)
      }
    } catch (err) {
      showToast('Error guardando factor: ' + err.message, 'error')
    } finally {
      setGuardandoFactor(false)
    }
  }, [productoSeleccionadoFactor, cantidadProveedor, cantidadMia, showToast])

  const enviarAlegra = useCallback(async () => {
    if (!facturaSeleccionada) return

    // Contar cuántos precios se van a actualizar
    const preciosQueActualizar = Object.keys(preciosAjustados).filter(
      id => preciosAjustados[id] > 0
    ).length

    const confirmacion = await confirm(
      `¿Enviar factura ${facturaSeleccionada.numeroConsecutivo} a Alegra?\n\n` +
      `Se realizará:\n` +
      `✅ Actualizar ${productos.length} costos\n` +
      `💰 Actualizar ${preciosQueActualizar} precios de venta\n` +
      `📄 Crear factura de proveedor\n` +
      `🔄 Marcar como ENVIADA`
    )

    if (!confirmacion) return

    // Guardar info de la factura para el toast
    const facturaNumero = facturaSeleccionada.numeroConsecutivo
    const facturaId = facturaSeleccionada.id

    // Mostrar toast de "enviando" y volver a la lista inmediatamente
    showToast(`📤 Enviando factura ${facturaNumero} a Alegra...`, 'loading', null)
    volverALista()

    // Enviar en segundo plano
    try {
      const response = await api.post('/revision-precios/enviar-alegra', {
        facturaId: facturaId,
        preciosAjustados: preciosAjustados
      })

      if (response.data.success) {
        const resultado = response.data.resultado
        const facturaCreada = response.data.facturaCreada

        // Remover toast de "enviando"
        setToasts(prev => prev.filter(t => t.type !== 'loading'))

        // Mostrar resultado apropiado
        if (facturaCreada) {
          showToast(
            `✅ Factura ${facturaNumero} enviada exitosamente\n` +
            `📄 ID Alegra: ${resultado.alegraFacturaId}\n` +
            `💰 Costos actualizados: ${resultado.costosActualizados}/${resultado.totalProductos}\n` +
            `🔄 Precios ajustados: ${resultado.preciosActualizados || 0}`,
            'success',
            8000
          )
        } else {
          showToast(
            `⚠️ Factura ${facturaNumero} procesada parcialmente\n` +
            `✅ Costos actualizados: ${resultado.costosActualizados}/${resultado.totalProductos}\n` +
            `✅ Precios ajustados: ${resultado.preciosActualizados || 0}\n` +
            `❌ Factura NO creada en Alegra (sin permisos)\n` +
            `💡 Contacta soporte de Alegra para habilitar facturas de compra`,
            'warning',
            12000
          )
        }

        // Recargar la lista para actualizar estados
        loadFacturas()
      }
    } catch (err) {
      // Remover toast de "enviando"
      setToasts(prev => prev.filter(t => t.type !== 'loading'))

      // Mostrar error
      showToast(
        `❌ Error enviando factura ${facturaNumero}\n${err.message}`,
        'error',
        10000
      )
    }
  }, [facturaSeleccionada, preciosAjustados, productos.length, confirm, showToast, volverALista, loadFacturas])

  return {
    vista,
    facturas,
    facturaSeleccionada,
    productos,
    productosAlegra,
    loading,
    error,
    tabActiva,
    setTabActiva,
    preciosAjustados,
    enviando,
    devolviendo,
    sincronizando,
    sincronizarProductos,
    abrirRevision,
    volverALista,
    devolverFactura,
    ajustarPrecio,
    aplicarPrecioSugerido,
    enviarAlegra,

    modalFactor,
    productoSeleccionadoFactor,
    cantidadProveedor,
    setCantidadProveedor,
    cantidadMia,
    setCantidadMia,
    guardandoFactor,
    abrirFactor,
    guardarFactor,
    cerrarModalFactor: () => setModalFactor(false),

    toasts,
    removeToast,
    dialogProps
  }
}
