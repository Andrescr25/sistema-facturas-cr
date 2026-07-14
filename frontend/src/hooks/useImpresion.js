import { useState, useEffect, useRef } from 'react'
import { alegraService } from '../services/alegraService'
import {
  getReferenceFromInvoiceItem,
  getDescriptionFromSearchProduct,
  getReferenceFromSearchProduct,
  getPriceValue,
  getTaxesArray,
  puntuarCoincidenciaProducto,
  normalizarItemsFactura,
  construirPayloadItems,
  validarItemsParaGuardar
} from '../utils/impresionUtils'
import { useDialog } from './useDialog'

/**
 * Estado y lógica de negocio del centro de impresión: listado de
 * pendientes/procesadas, edición de una factura antes de reimprimir
 * (incluyendo el buscador de productos nuevos en Alegra con caché y
 * debounce), y las acciones de guardar/procesar/recuperar. Extraído de
 * Impresion.jsx.
 *
 * Incluye confirm() (useDialog) para el único window.confirm. Los 2
 * alert(...) de validación se cambiaron a setError(...), reusando el
 * banner de error que ya existía en la página (no tenía toasts).
 */
export function useImpresion() {
  const { confirm, dialogProps } = useDialog()

  const [activeTab, setActiveTabState] = useState('pendientes')
  const [facturasSinCambios, setFacturasSinCambios] = useState([])
  const [facturasPendientes, setFacturasPendientes] = useState([]) // Ahora contiene TODAS las pendientes
  const [facturasProcesadas, setFacturasProcesadas] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Estado para edición
  const [facturaEditando, setFacturaEditando] = useState(null)
  const [itemsEditados, setItemsEditados] = useState([])
  const [modoEdicion, setModoEdicion] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [ajustandoPrecios, setAjustandoPrecios] = useState(false)
  const [mensajeAjuste, setMensajeAjuste] = useState('')
  const [productoBusqueda, setProductoBusqueda] = useState({
    index: null,
    termino: '',
    resultados: [],
    cargando: false,
    error: null
  })
  const debounceBusquedaRef = useRef(null)
  const cacheProductosRef = useRef(new Map())

  const loadFacturasPendientes = async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await alegraService.getFacturasPendientesReimpresion()

      if (result.success) {
        const sinCambios = result.data?.sin_cambios || []
        const requiereCambios = result.data?.requiere_cambios || []
        // Unificación: Mostrar todas las pendientes en una sola lista
        setFacturasPendientes([...requiereCambios, ...sinCambios])
        setFacturasSinCambios([])
      } else {
        setError(result.message || 'Error cargando facturas pendientes')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadFacturasProcesadas = async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await alegraService.getFacturasProcesadasReimpresion()

      if (result.success) {
        setFacturasProcesadas(result.data)
      } else {
        setError(result.message || 'Error cargando facturas procesadas')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'procesadas') {
      loadFacturasProcesadas()
    } else {
      loadFacturasPendientes()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    return () => {
      if (debounceBusquedaRef.current) {
        clearTimeout(debounceBusquedaRef.current)
      }
    }
  }, [])

  const handleSetActiveTab = (tabKey) => {
    setFacturaEditando(null)
    setModoEdicion(false)
    setActiveTabState(tabKey)
  }

  const obtenerProductoAlegra = async (alegraItemId) => {
    if (!alegraItemId) return null

    if (cacheProductosRef.current.has(alegraItemId)) {
      return cacheProductosRef.current.get(alegraItemId)
    }

    try {
      const response = await alegraService.getProductoInfoAlegra(alegraItemId)
      if (response.success && response.producto) {
        cacheProductosRef.current.set(alegraItemId, response.producto)
        return response.producto
      }
    } catch (error) {
      console.error('Error obteniendo información de producto Alegra:', error)
    }

    return null
  }

  const completarItemConReferencia = async (itemBase) => {
    let referencia = itemBase.reference?.trim() ? itemBase.reference : ''
    let descripcion = itemBase.description?.trim() ? itemBase.description : ''
    let referenciaTipo = itemBase.referencia_tipo || itemBase.reference_type || itemBase.referenceType || null
    const alegraItemId = itemBase.alegraItemId || itemBase.itemId || itemBase.item?.id || itemBase.id
    let price = getPriceValue(itemBase.price)

    if (alegraItemId) {
      const producto = await obtenerProductoAlegra(alegraItemId)
      if (producto) {
        const refNormalizada = getReferenceFromSearchProduct(producto)
        const descNormalizada = getDescriptionFromSearchProduct(producto)
        if (refNormalizada) {
          referencia = refNormalizada
        }
        if (!descripcion && (descNormalizada || producto.name)) {
          descripcion = descNormalizada || producto.name || descripcion
        }
        referenciaTipo = producto.reference?.type || referenciaTipo || 'CODE_OF_INTERNAL_USE'

        // Sincronizar con el precio de catálogo de Alegra (que tiene el precio actualizado de revisión de precios)
        const catalogPrice = getPriceValue(producto.price ?? producto.prices ?? producto.salePrice ?? 0)
        if (catalogPrice > 0) {
          price = catalogPrice
        }
      }
    }

    return {
      ...itemBase,
      reference: referencia,
      description: descripcion,
      price,
      alegraItemId,
      referencia_tipo: referenciaTipo || 'CODE_OF_INTERNAL_USE'
    }
  }

  const handleVerPDF = async (factura) => {
    try {
      setError(null)
      await alegraService.visualizarPDFFactura(factura.alegra_id)
    } catch (error) {
      setError(`Error abriendo PDF: ${error.message}`)
    }
  }

  const handleIniciarEdicion = (factura) => {
    setFacturaEditando(factura)

    const cargarFactura = async () => {
      try {
        const result = await alegraService.getInvoiceById(factura.alegra_id)
        if (result.success) {
          const items = Array.isArray(result.data.items) ? result.data.items : []
          const normalizados = normalizarItemsFactura(items, factura)
          const enriquecidos = await Promise.all(normalizados.map(completarItemConReferencia))
          setItemsEditados(enriquecidos)
        }
      } catch (error) {
        console.error('Error cargando factura desde Alegra:', error)
        setError(`No se pudo cargar la factura desde Alegra: ${error.message}`)
      }
    }

    cargarFactura()
    setModoEdicion(true)
  }

  const abrirRevision = (factura) => {
    setFacturaEditando(factura)
    setModoEdicion(false)
  }

  const handleCancelarEdicion = () => {
    setFacturaEditando(null)
    setItemsEditados([])
    setModoEdicion(false)
    setProductoBusqueda({
      index: null,
      termino: '',
      resultados: [],
      cargando: false,
      error: null
    })
    cacheProductosRef.current.clear()
  }

  const handleAgregarItem = () => {
    const nuevoIndice = itemsEditados.length
    const nuevoItem = {
      id: null,
      reference: '',
      description: '',
      quantity: 1,
      price: 0,
      tax: [],
      itemId: null,
      alegraItemId: null,
      esNuevo: true
    }

    setItemsEditados(prev => [...prev, nuevoItem])
    setProductoBusqueda({
      index: nuevoIndice,
      termino: '',
      resultados: [],
      cargando: false,
      error: null
    })
  }

  const handleGuardarFactura = async (imprimirDespues = false) => {
    if (!facturaEditando) return

    try {
      setProcesando(true)
      setAjustandoPrecios(true)
      setMensajeAjuste('Ajustando precios desde Alegra')

      if (modoEdicion && productoBusqueda.index !== null) {
        cerrarBusquedaProducto()
      }

      let itemsParaGuardar = null

      if (modoEdicion) {
        itemsParaGuardar = construirPayloadItems(itemsEditados)

        const mensajeValidacion = validarItemsParaGuardar(itemsParaGuardar, itemsEditados)
        if (mensajeValidacion) {
          setError(mensajeValidacion)
          setProcesando(false)
          setAjustandoPrecios(false)
          setMensajeAjuste('')
          return
        }
      }

      // Procesar factura (con items editados si hay, o ajustes automáticos)
      // Marcar como procesada porque viene desde Reimpresión (reimprimiendo)
      const facturaConFlag = {
        ...facturaEditando,
        marcar_como_procesada: true,
        actualizar_precios: true // Actualizar precios con los cargados en revisión de precios
      }

      setMensajeAjuste('Ya casi estamos listos')

      const result = await alegraService.procesarFacturaIndividual(
        facturaConFlag,
        modoEdicion ? itemsParaGuardar : null
      )

      if (result.success) {
        setMensajeAjuste('Precios actualizados correctamente')

        // Si pidió imprimir, abrir PDF
        if (imprimirDespues) {
          await alegraService.visualizarPDFFactura(facturaEditando.alegra_id)
        }

        // Limpiar estado
        handleCancelarEdicion()

        // Recargar lista
        loadFacturasPendientes()
      } else {
        throw new Error(result.message || 'Error procesando factura')
      }
    } catch (error) {
      setError(`Error: ${error.message}`)
    } finally {
      setProcesando(false)
      setAjustandoPrecios(false)
      setMensajeAjuste('')
    }
  }

  const handleProcesarSinCambios = async (factura, imprimirDespues = false) => {
    if (!factura) return

    // Determinar si es una factura de bodega sin faltantes (omitir ajuste de precios)
    const esSinPendientes = factura.categoria === 'sin_pendientes'

    const mensajeConfirmacion = esSinPendientes
      ? `¿Marcar la factura ${factura.numero_factura} como impresa${imprimirDespues ? ' e imprimir ahora' : ''}?`
      : `¿Marcar la factura ${factura.numero_factura} como impresa${imprimirDespues ? ' e imprimir ahora' : ''}?\n\nSe actualizarán los precios automáticamente desde Alegra.`

    const confirmado = await confirm(mensajeConfirmacion)
    if (!confirmado) return

    try {
      setProcesando(true)

      // Solo ajustar precios si NO es 'sin_pendientes' (viene de bodega sin faltantes)
      if (!esSinPendientes) {
        setAjustandoPrecios(true)
        setMensajeAjuste('Ajustando precios desde Alegra')

        await alegraService.procesarFacturaIndividual({
          alegra_id: factura.alegra_id,
          numero_factura: factura.numero_factura,
          cliente_nombre: factura.cliente_nombre,
          fecha_emision: factura.fecha_emision,
          ajustes: factura.ajustes_realizados || [],
          estado: 'resuelto',
          marcar_como_procesada: true,
          actualizar_precios: true // Sincronizar precios desde Alegra ya que el usuario procesó "sin cambios"
        })

        setMensajeAjuste('Precios actualizados correctamente')
      } else {
        // Para facturas sin_pendientes, solo marcar como procesada sin ajustar precios
        await alegraService.procesarFacturaIndividual({
          alegra_id: factura.alegra_id,
          numero_factura: factura.numero_factura,
          cliente_nombre: factura.cliente_nombre,
          fecha_emision: factura.fecha_emision,
          ajustes: [],
          estado: 'resuelto',
          marcar_como_procesada: true,
          omitir_ajuste_precios: true, // Flag para omitir ajuste de precios
          actualizar_precios: false
        })
      }

      if (imprimirDespues) {
        await alegraService.visualizarPDFFactura(factura.alegra_id)
      }

      await loadFacturasPendientes()
      loadFacturasProcesadas()
    } catch (error) {
      setError(`Error procesando factura: ${error.message}`)
    } finally {
      setProcesando(false)
      setAjustandoPrecios(false)
      setMensajeAjuste('')
    }
  }

  const handleRecuperarFactura = async (factura) => {
    try {
      setLoading(true)
      const result = await alegraService.recuperarFactura(factura.alegra_id)

      if (result.success) {
        loadFacturasProcesadas()
      } else {
        throw new Error(result.message || 'Error recuperando factura')
      }
    } catch (error) {
      setError(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const cerrarBusquedaProducto = () => {
    setProductoBusqueda({
      index: null,
      termino: '',
      resultados: [],
      cargando: false,
      error: null
    })
  }

  const buscarProductoRevision = async (index, termino) => {
    const item = itemsEditados[index]
    if (!item || !item.esNuevo) {
      return
    }
    const query = (termino || '').trim()

    if (query.length < 2) {
      setProductoBusqueda(prev => ({
        ...prev,
        index,
        termino,
        resultados: [],
        error: 'Ingresa al menos 2 caracteres.'
      }))
      return
    }

    setProductoBusqueda(prev => ({
      ...prev,
      index,
      termino: query,
      cargando: true,
      resultados: [],
      error: null
    }))

    try {
      const response = await alegraService.buscarProductosRevision(query)

      if (response.success) {
        const resultados = response.productos || response.data || []
        const terminoLower = query.toLowerCase()

        resultados.sort((a, b) => puntuarCoincidenciaProducto(b, terminoLower) - puntuarCoincidenciaProducto(a, terminoLower))

        setProductoBusqueda(prev => ({
          ...prev,
          cargando: false,
          resultados,
          error: resultados.length === 0 ? 'Sin coincidencias para ese código.' : null
        }))
      } else {
        setProductoBusqueda(prev => ({
          ...prev,
          cargando: false,
          resultados: [],
          error: response.message || 'No se pudieron obtener los productos.'
        }))
      }
    } catch (error) {
      setProductoBusqueda(prev => ({
        ...prev,
        cargando: false,
        resultados: [],
        error: error.message
      }))
    }
  }

  const iniciarBusquedaProducto = (index) => {
    const item = itemsEditados[index]
    if (!item || !item.esNuevo) {
      return
    }
    const referencia = getReferenceFromInvoiceItem(itemsEditados[index]) || ''
    setProductoBusqueda({
      index,
      termino: referencia,
      resultados: [],
      cargando: false,
      error: null
    })

    if (referencia && referencia.length >= 2) {
      buscarProductoRevision(index, referencia)
    }
  }

  const manejarCambioTerminoBusqueda = (index, valor) => {
    setProductoBusqueda(prev => {
      const next = {
        ...prev,
        index,
        termino: valor,
        error: null
      }

      if (debounceBusquedaRef.current) {
        clearTimeout(debounceBusquedaRef.current)
      }

      const terminoLimpio = valor.trim()
      if (terminoLimpio.length >= 2) {
        debounceBusquedaRef.current = setTimeout(() => {
          buscarProductoRevision(index, terminoLimpio)
        }, 350)
      } else {
        next.resultados = []
        next.cargando = false
        next.error = terminoLimpio.length === 0 ? null : 'Ingresa al menos 2 caracteres.'
      }

      return next
    })
  }

  const seleccionarProductoBusqueda = async (index, productoBase) => {
    let producto = productoBase
    const referenciaNormalizada = getReferenceFromSearchProduct(producto)
    const referencia = referenciaNormalizada || productoBusqueda.termino || ''

    const requiereDetalles = (!producto.taxes || producto.taxes.length === 0) && (producto.id || referencia)

    if (requiereDetalles) {
      try {
        const query = referencia || producto.id?.toString() || ''
        const resultado = await alegraService.buscarProductosAlegra(query)

        if (resultado?.success) {
          const lista = resultado.data || resultado.productos || []
          const match = lista.find(item => item.id?.toString() === producto.id?.toString()) || lista[0]
          if (match) {
            producto = { ...match }
          }
        }
      } catch (error) {
        console.error('No se pudo obtener detalle del producto desde Alegra:', error)
      }
    }

    const descripcion = getDescriptionFromSearchProduct(producto) || referencia || 'Producto sin descripción'
    const precio = getPriceValue(producto.price ?? producto.prices ?? producto.salePrice ?? 0)
    const taxes = getTaxesArray(producto.taxes ?? producto.tax)

    setItemsEditados(prev => prev.map((item, idx) => {
      if (idx !== index) return item
      return {
        ...item,
        reference: referencia,
        description: descripcion,
        quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
        price: Number(precio) || 0,
        tax: taxes,
        itemId: producto.id ?? null,
        alegraItemId: producto.id ?? null,
        item: producto.id ? { id: producto.id } : item.item,
        referencia_tipo: producto.reference?.type || item.referencia_tipo || 'CODE_OF_INTERNAL_USE',
        esNuevo: false
      }
    }))

    cerrarBusquedaProducto()
  }

  const handleItemChange = (index, field, value) => {
    const newItems = [...itemsEditados]
    const itemActual = { ...newItems[index] }

    if (!itemActual.esNuevo && (field === 'reference' || field === 'description')) {
      return
    }

    if (field === 'quantity') {
      const numero = parseFloat(value)
      itemActual.quantity = Number.isFinite(numero) && numero >= 0 ? numero : 0
    } else if (field === 'price') {
      const numero = parseFloat(value)
      itemActual.price = Number.isFinite(numero) ? numero : 0
    } else if (field === 'description') {
      itemActual.description = value
    } else if (field === 'reference') {
      itemActual.reference = value
      itemActual.itemId = null
      itemActual.alegraItemId = null
      if (itemActual.referencia_tipo) {
        delete itemActual.referencia_tipo
      }
      if (itemActual.item) delete itemActual.item
    } else {
      itemActual[field] = value
    }

    newItems[index] = itemActual
    setItemsEditados(newItems)
  }

  const handleEliminarItem = (index) => {
    const newItems = itemsEditados.filter((_, i) => i !== index)
    setItemsEditados(newItems)

    if (productoBusqueda.index !== null) {
      if (productoBusqueda.index === index) {
        cerrarBusquedaProducto()
      } else if (productoBusqueda.index > index) {
        setProductoBusqueda(prev => ({
          ...prev,
          index: prev.index - 1
        }))
      }
    }

    if (newItems.length === 0) {
      setModoEdicion(false)
    }
  }

  return {
    activeTab,
    setActiveTab: handleSetActiveTab,
    facturasPendientes,
    facturasProcesadas,
    loading,
    error,

    facturaEditando,
    itemsEditados,
    modoEdicion,
    procesando,
    ajustandoPrecios,
    mensajeAjuste,
    productoBusqueda,

    handleVerPDF,
    handleIniciarEdicion,
    abrirRevision,
    handleCancelarEdicion,
    handleAgregarItem,
    handleGuardarFactura,
    handleProcesarSinCambios,
    handleRecuperarFactura,
    iniciarBusquedaProducto,
    manejarCambioTerminoBusqueda,
    seleccionarProductoBusqueda,
    handleItemChange,
    handleEliminarItem,

    dialogProps
  }
}
