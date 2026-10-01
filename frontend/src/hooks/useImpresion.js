import { useState, useEffect, useRef } from 'react'
import { colaImpresionService } from '../services/colaImpresionService'
import {
  aItemDeEdicion,
  lineasParaProcesar,
  validarItemsParaProcesar
} from '../utils/impresionUtils'
import { useDialog } from './useDialog'

/**
 * Estado y lógica del centro de impresión, sobre la factura PROPIA (rama
 * independencia-alegra, sección 11, paso 3): listado de pendientes y
 * procesadas, edición de una factura antes de reimprimirla (con el buscador
 * de productos del catálogo propio) y las acciones de guardar, procesar y
 * recuperar.
 *
 * Todo va por `factura_id`, el id propio. Hasta el 2026-09-30 las líneas se
 * leían de Alegra, el precio de cada una se le volvía a preguntar a Alegra
 * producto por producto, y procesar editaba la factura EN Alegra. Ahora el
 * servidor propone las líneas ya ajustadas (faltantes rebajados una sola vez y
 * precios del catálogo) y procesar edita la factura propia.
 *
 * Incluye confirm() (useDialog). Los errores van al banner de la página.
 */
export function useImpresion() {
  const { confirm, dialogProps } = useDialog()

  const [activeTab, setActiveTabState] = useState('pendientes')
  const [facturasPendientes, setFacturasPendientes] = useState([])
  const [cargandoItems, setCargandoItems] = useState(false)
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

  const loadFacturasPendientes = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await colaImpresionService.pendientes()
      // Todas las pendientes en una sola lista, las que requieren cambios primero.
      setFacturasPendientes([...(result.data?.requiere_cambios || []), ...(result.data?.sin_cambios || [])])
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
      const result = await colaImpresionService.procesadas()
      setFacturasProcesadas(result.data || [])
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

  const handleVerPDF = async (factura) => {
    try {
      setError(null)
      await colaImpresionService.abrirPdf(factura.factura_id)
    } catch (err) {
      setError(`No se pudo abrir el PDF: ${err.message}`)
    }
  }

  const handleIniciarEdicion = (factura) => {
    setFacturaEditando(factura)
    setItemsEditados([])
    // Las líneas tardan en llegar. Sin esta bandera el modal se abre con
    // "Productos (0)" y un total de ₡0 que la pantalla lee como una factura
    // vaciada: llegó a mostrar "−₡47.425 contra el original" mientras los
    // datos todavía venían en camino.
    setCargandoItems(true)

    colaImpresionService.detalle(factura.factura_id)
      .then((detalle) => setItemsEditados((detalle.lineas || []).map(aItemDeEdicion)))
      .catch((err) => setError(`No se pudo cargar la factura: ${err.message}`))
      .finally(() => setCargandoItems(false))

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
  }

  const handleAgregarItem = () => {
    const nuevoIndice = itemsEditados.length
    const nuevoItem = {
      productoId: null,
      reference: '',
      description: '',
      nota: null,
      quantity: 1,
      price: 0,
      descuento: 0,
      tarifa: 0,
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

  /** Procesa y, si se pidió, abre el PDF en una pestaña abierta en el clic (si no, el navegador la bloquea). */
  const procesarEImprimir = async (facturaId, opciones, imprimirDespues) => {
    const ventana = imprimirDespues ? window.open('', '_blank') : null
    try {
      await colaImpresionService.procesar(facturaId, opciones)
    } catch (err) {
      ventana?.close()
      throw err
    }
    if (imprimirDespues) await colaImpresionService.abrirPdf(facturaId, ventana)
  }

  const handleGuardarFactura = async (imprimirDespues = false) => {
    if (!facturaEditando) return

    if (modoEdicion && productoBusqueda.index !== null) {
      cerrarBusquedaProducto()
    }

    let opciones = {}
    if (modoEdicion) {
      const mensajeValidacion = validarItemsParaProcesar(itemsEditados)
      if (mensajeValidacion) {
        setError(mensajeValidacion)
        return
      }
      opciones = { lineas: lineasParaProcesar(itemsEditados) }
    }

    try {
      setProcesando(true)
      setAjustandoPrecios(true)
      setMensajeAjuste('Guardando la factura')
      await procesarEImprimir(facturaEditando.factura_id, opciones, imprimirDespues)
      handleCancelarEdicion()
      loadFacturasPendientes()
    } catch (err) {
      setError(err.message)
    } finally {
      setProcesando(false)
      setAjustandoPrecios(false)
      setMensajeAjuste('')
    }
  }

  const handleProcesarSinCambios = async (factura, imprimirDespues = false) => {
    if (!factura) return

    // Las que Bodega despachó completas solo se imprimen: ni faltantes ni precios.
    const soloImprimir = factura.categoria === 'sin_pendientes'
    const mensajeConfirmacion = soloImprimir
      ? `¿Marcar la factura ${factura.numero_factura} como impresa${imprimirDespues ? ' e imprimir ahora' : ''}?`
      : `¿Marcar la factura ${factura.numero_factura} como impresa${imprimirDespues ? ' e imprimir ahora' : ''}?\n\nSe le rebajan los faltantes y se le ponen los precios del catálogo.`

    const confirmado = await confirm(mensajeConfirmacion)
    if (!confirmado) return

    try {
      setProcesando(true)
      if (!soloImprimir) {
        setAjustandoPrecios(true)
        setMensajeAjuste('Aplicando los cambios')
      }
      await procesarEImprimir(factura.factura_id, { actualizarPrecios: !soloImprimir }, imprimirDespues)
      await loadFacturasPendientes()
      loadFacturasProcesadas()
    } catch (err) {
      setError(err.message)
    } finally {
      setProcesando(false)
      setAjustandoPrecios(false)
      setMensajeAjuste('')
    }
  }

  const handleRecuperarFactura = async (factura) => {
    try {
      setLoading(true)
      await colaImpresionService.recuperarProcesada(factura.factura_id)
      loadFacturasProcesadas()
    } catch (err) {
      setError(err.message)
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
      // El servidor ya los ordena: la referencia exacta primero.
      const resultados = await colaImpresionService.buscarProductos(query)
      setProductoBusqueda(prev => ({
        ...prev,
        cargando: false,
        resultados,
        error: resultados.length === 0 ? 'Sin coincidencias para ese código.' : null
      }))
    } catch (err) {
      setProductoBusqueda(prev => ({
        ...prev,
        cargando: false,
        resultados: [],
        error: err.message
      }))
    }
  }

  const iniciarBusquedaProducto = (index) => {
    const item = itemsEditados[index]
    if (!item || !item.esNuevo) {
      return
    }
    const referencia = (item.reference || '').toString().trim()
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

  /** El producto elegido en el buscador: su id PROPIO, su precio de catálogo y su tarifa. */
  const seleccionarProductoBusqueda = (index, producto) => {
    setItemsEditados(prev => prev.map((item, idx) => {
      if (idx !== index) return item
      return {
        ...item,
        productoId: producto.productoId ?? producto.id,
        reference: producto.reference || '',
        description: producto.name || producto.reference || 'Producto sin nombre',
        quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
        price: Number(producto.price) || 0,
        tarifa: Number(producto.tarifa) || 0,
        descuento: 0,
        nota: null,
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
      // Si se le vuelve a poner cantidad a una línea que se iba a quitar por
      // faltante, ya no se quita: manda lo que escribió la persona.
      if (itemActual.quantity > 0) itemActual.eliminar_por_faltante = false
    } else if (field === 'price') {
      const numero = parseFloat(value)
      itemActual.price = Number.isFinite(numero) ? numero : 0
    } else if (field === 'description') {
      itemActual.description = value
    } else if (field === 'reference') {
      // Cambió el texto: el producto que se había elegido ya no vale.
      itemActual.reference = value
      itemActual.productoId = null
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
    cargandoItems,
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
