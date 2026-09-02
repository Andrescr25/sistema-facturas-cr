import { useState, useEffect, useCallback } from 'react'
import { alegraService } from '../services/alegraService'
import api from '../services/api'
import { construirProductosParaOrden } from '../utils/reporteProveedoresUtils'
import { useDialog } from './useDialog'
import { useToast } from './useToast'

/**
 * Estado y lógica de negocio del reporte de faltantes por proveedor: carga,
 * edición de cantidades a pedir, generación de PDF/envío por WhatsApp,
 * reasignación de productos a otro proveedor, y edición manual de la orden
 * (agregar/eliminar productos). Extraído de ReporteProveedores.jsx.
 *
 * Incluye prompt() (useDialog) y showToast() (useToast) en vez de
 * window.prompt/alert. La página debe renderizar
 * <ConfirmModal {...dialogProps} /> y <ToastContainer toasts={toasts} onRemove={removeToast} />.
 */
export function useReporteProveedores() {
  const { prompt, dialogProps } = useDialog()
  const { toasts, showToast, removeToast } = useToast()

  const [proveedores, setProveedores] = useState([])
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [cantidadesModificadas, setCantidadesModificadas] = useState(new Map())
  const [cantidadesGuardadas, setCantidadesGuardadas] = useState(new Map())
  const [fechaInicio, setFechaInicio] = useState('')

  // Estados Modal Asignar Lotes
  const [modalAsignarVisible, setModalAsignarVisible] = useState(false)
  const [proveedoresAlegra, setProveedoresAlegra] = useState([])
  const [busquedaProveedor, setBusquedaProveedor] = useState('')
  const [loadingProveedores, setLoadingProveedores] = useState(false)
  const [modalCrearProveedor, setModalCrearProveedor] = useState(false)
  const [productosSeleccionados, setProductosSeleccionados] = useState(new Set())
  const [preferenciasDatosProveedor, setPreferenciasDatosProveedor] = useState({})

  // Estados Edición Manual
  const [productosEliminados, setProductosEliminados] = useState(new Set())
  const [productosAgregados, setProductosAgregados] = useState(new Map())
  const [modalAgregarProducto, setModalAgregarProducto] = useState(false)
  const [proveedorParaAgregar, setProveedorParaAgregar] = useState(null)
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [productosAlegra, setProductosAlegra] = useState([])
  const [loadingProductos, setLoadingProductos] = useState(false)

  // Estados WhatsApp
  const [modalWhatsAppVisible, setModalWhatsAppVisible] = useState(false)
  const [proveedorParaWhatsApp, setProveedorParaWhatsApp] = useState(null)
  const [telefonoProveedor, setTelefonoProveedor] = useState('')
  const [mensajeWhatsApp, setMensajeWhatsApp] = useState('Hola buenas, adjunto el pedido\ngracias')

  const loadReporte = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await alegraService.getReporteFaltantesProveedor(fechaInicio)

      if (result.success) {
        // Filtrar proveedores que NO tienen productos para limpiar la vista principal
        const proveedoresConProductos = result.data.filter(p => p.productos_faltantes && p.productos_faltantes.length > 0)
        setProveedores(proveedoresConProductos)
        setResumen(result.resumen)
      } else {
        setError(result.message || 'Error cargando reporte')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [fechaInicio])

  const loadCantidadesGuardadas = useCallback(async () => {
    try {
      const result = await alegraService.getCantidadesModificadas()
      if (result.success) {
        const cantidadesMap = new Map()
        result.data?.modificadas?.forEach(item => {
          const key = `${item.proveedor_nombre}-${item.producto_codigo}`
          cantidadesMap.set(key, {
            cantidad_original: item.cantidad_original,
            cantidad_modificada: item.cantidad_modificada
          })
        })
        setCantidadesGuardadas(cantidadesMap)

        const eliminados = new Set()
        result.data?.eliminadas?.forEach(item => {
          const key = `${item.proveedor_nombre}-${item.producto_codigo}`
          eliminados.add(key)
        })
        setProductosEliminados(eliminados)

        const agregados = new Map()
        result.data?.agregadas?.forEach(item => {
          const proveedorNombre = item.proveedor_nombre
          const productosDelProveedor = agregados.get(proveedorNombre) || []
          productosDelProveedor.push({
            codigo: item.producto_codigo,
            nombre: item.producto_nombre,
            cantidad: item.cantidad_modificada,
            agregadoManual: true
          })
          agregados.set(proveedorNombre, productosDelProveedor)
        })
        setProductosAgregados(agregados)
      }
    } catch (err) {
      console.warn('Error cargando cantidades guardadas:', err)
    }
  }, [])

  useEffect(() => {
    loadReporte()
    loadCantidadesGuardadas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaInicio])

  const usaDatosProveedor = useCallback((proveedorNombre) => {
    const preferencia = preferenciasDatosProveedor[proveedorNombre]
    return preferencia === undefined ? true : preferencia
  }, [preferenciasDatosProveedor])

  const togglePreferenciaProveedor = useCallback((proveedorNombre, value) => {
    setPreferenciasDatosProveedor(prev => ({
      ...prev,
      [proveedorNombre]: value
    }))
  }, [])

  const handleCantidadChange = useCallback((proveedorNombre, productoCodigo, nuevaCantidad) => {
    const key = `${proveedorNombre}-${productoCodigo}`
    const cantidadNum = parseInt(nuevaCantidad) || 0
    setCantidadesModificadas(prev => {
      const nuevasCantidades = new Map(prev)
      nuevasCantidades.set(key, cantidadNum)
      return nuevasCantidades
    })
  }, [])

  const handleGuardarCantidades = useCallback(async () => {
    if (cantidadesModificadas.size === 0) {
      showToast('No hay cantidades modificadas para guardar.', 'info')
      return
    }

    try {
      setLoading(true)
      const cantidadesParaGuardar = []
      proveedores.forEach(proveedor => {
        proveedor.productos_faltantes.forEach(producto => {
          const key = `${proveedor.nombre}-${producto.codigo}`
          const cantidadModificada = cantidadesModificadas.get(key)
          if (cantidadModificada !== undefined) {
            cantidadesParaGuardar.push({
              proveedor_nombre: proveedor.nombre,
              producto_codigo: producto.codigo,
              producto_nombre: producto.nombre,
              cantidad_original: producto.cantidad_faltante,
              cantidad_modificada: cantidadModificada
            })
          }
        })
      })

      const result = await alegraService.guardarCantidadesModificadas(cantidadesParaGuardar)
      if (result.success) {
        await loadCantidadesGuardadas()
        setCantidadesModificadas(new Map())
        showToast(`Cantidades guardadas correctamente\n\n• ${result.data?.cantidades_guardadas ?? 0} productos actualizados`, 'success')
      } else {
        showToast(`Error guardando cantidades: ${result.message}`, 'error')
      }
    } catch (error) {
      showToast(`Error guardando cantidades: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [cantidadesModificadas, proveedores, loadCantidadesGuardadas, showToast])

  const handleGenerarPDF = useCallback(async (proveedor) => {
    try {
      setLoading(true)
      const preferirDatosProveedor = usaDatosProveedor(proveedor.nombre)
      const productosParaPDF = construirProductosParaOrden(proveedor, {
        productosEliminados, cantidadesModificadas, cantidadesGuardadas, productosAgregados
      })

      if (productosParaPDF.length === 0) {
        showToast('No hay productos para generar la orden de compra', 'warning')
        return
      }

      const blob = await alegraService.generarPDFOrdenCompra(proveedor.nombre, productosParaPDF, preferirDatosProveedor)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `orden-${proveedor.nombre.replace(/\s+/g, '-')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      showToast(`PDF generado para ${proveedor.nombre}`, 'success')
    } catch (error) {
      showToast(`Error generando PDF: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [usaDatosProveedor, productosEliminados, cantidadesModificadas, cantidadesGuardadas, productosAgregados, showToast])

  const abrirModalWhatsApp = useCallback(async (proveedor) => {
    setProveedorParaWhatsApp(proveedor)
    setMensajeWhatsApp('Hola buenas, adjunto el pedido\ngracias')
    setModalWhatsAppVisible(true)
    try {
      const telefonoDB = await alegraService.getTelefonoProveedor(proveedor.nombre)
      if (telefonoDB) {
        setTelefonoProveedor(telefonoDB)
      } else {
        const telefonoLocal = localStorage.getItem(`whatsapp_tel_${proveedor.nombre}`)
        setTelefonoProveedor(telefonoLocal || proveedor.telefono || '')
      }
    } catch (error) {
      const telefonoLocal = localStorage.getItem(`whatsapp_tel_${proveedor.nombre}`)
      setTelefonoProveedor(telefonoLocal || proveedor.telefono || '')
    }
  }, [])

  const enviarWhatsApp = useCallback(async () => {
    if (!telefonoProveedor.trim()) {
      showToast('Ingresa el número de teléfono del proveedor', 'warning')
      return
    }

    try {
      setLoading(true)
      const proveedor = proveedorParaWhatsApp
      const preferirDatosProveedor = usaDatosProveedor(proveedor.nombre)

      const productosParaPDF = construirProductosParaOrden(proveedor, {
        productosEliminados, cantidadesModificadas, cantidadesGuardadas, productosAgregados
      })

      if (productosParaPDF.length === 0) {
        showToast('No hay productos para enviar', 'warning')
        return
      }

      // Guardar/Actualizar teléfono del proveedor de una vez
      try {
        await alegraService.guardarTelefonoProveedor(proveedor.nombre, telefonoProveedor, proveedor.cedula)
        localStorage.setItem(`whatsapp_tel_${proveedor.nombre}`, telefonoProveedor)
      } catch (e) {
        localStorage.setItem(`whatsapp_tel_${proveedor.nombre}`, telefonoProveedor)
      }

      // Enviar directamente mediante el backend + Evolution API
      const result = await alegraService.enviarOrdenCompraWhatsApp(
        proveedor.nombre,
        telefonoProveedor,
        productosParaPDF,
        preferirDatosProveedor,
        mensajeWhatsApp
      )

      if (result.success) {
        showToast(`Orden de compra enviada con éxito a ${proveedor.nombre} por WhatsApp.`, 'success')
        setModalWhatsAppVisible(false)
      } else {
        showToast(`Error enviando por WhatsApp: ${result.message}`, 'error')
      }
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [telefonoProveedor, proveedorParaWhatsApp, usaDatosProveedor, productosEliminados, cantidadesModificadas, cantidadesGuardadas, productosAgregados, mensajeWhatsApp, showToast])

  // Selección de Múltiples Productos
  const toggleProductoSeleccionado = useCallback((codigo) => {
    setProductosSeleccionados(prev => {
      const nuevaSeleccion = new Set(prev)
      if (nuevaSeleccion.has(codigo)) nuevaSeleccion.delete(codigo); else nuevaSeleccion.add(codigo)
      return nuevaSeleccion
    })
  }, [])

  const toggleTodosProductos = useCallback((proveedor) => {
    const todosCodigos = proveedor.productos_faltantes.map(p => p.codigo)
    setProductosSeleccionados(prev => {
      const todosSeleccionados = todosCodigos.every(codigo => prev.has(codigo))
      const nuevaSeleccion = new Set(prev)
      if (todosSeleccionados) {
        todosCodigos.forEach(codigo => nuevaSeleccion.delete(codigo))
      } else {
        todosCodigos.forEach(codigo => nuevaSeleccion.add(codigo))
      }
      return nuevaSeleccion
    })
  }, [])

  const cargarProveedoresAlegra = useCallback(async (busqueda) => {
    try {
      setLoadingProveedores(true)
      const response = await api.get(`/alegra/proveedores`, { params: { busqueda } })
      if (response.data.success) {
        setProveedoresAlegra(response.data.data)
      } else {
        showToast('Error cargando proveedores: ' + response.data.message, 'error')
      }
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error')
    } finally {
      setLoadingProveedores(false)
    }
  }, [showToast])

  const abrirModalAsignar = useCallback(async () => {
    if (productosSeleccionados.size === 0) {
      showToast('Selecciona al menos un producto', 'warning')
      return
    }
    setModalAsignarVisible(true)
    setBusquedaProveedor('')
    await cargarProveedoresAlegra('')
  }, [productosSeleccionados, cargarProveedoresAlegra])

  const asignarProveedorManual = useCallback(async (proveedorId) => {
    if (productosSeleccionados.size === 0) return
    try {
      setLoading(true)
      const productosAAsignar = []
      proveedores.forEach(proveedor => {
        const prod = proveedor.productos_faltantes.filter(p => productosSeleccionados.has(p.codigo))
        prod.forEach(p => productosAAsignar.push({ producto: p, proveedorActual: proveedor.nombre }))
      })

      if (productosAAsignar.length === 0) return

      const BATCH_SIZE = 3
      const resultados = []

      for (let i = 0; i < productosAAsignar.length; i += BATCH_SIZE) {
        const lote = productosAAsignar.slice(i, i + BATCH_SIZE)
        const promesasLote = lote.map(({ producto, proveedorActual }) => {
          const body = {
            alegraReference: producto.codigo,
            alegraItemId: producto.alegra_item_id || null,
            alegraName: producto.nombre,
            [proveedorActual !== 'Sin_Proveedor' ? 'nuevoProveedorId' : 'proveedorId']: proveedorId
          }
          const endpoint = proveedorActual !== 'Sin_Proveedor' ? '/alegra/faltantes/reasignar-proveedor' : '/alegra/faltantes/asignar-proveedor-manual'
          return api.post(endpoint, body).catch(err => ({ data: { success: false } }))
        })
        resultados.push(...(await Promise.all(promesasLote)))
      }

      const exitosos = resultados.filter(r => r.data?.success).length
      if (exitosos > 0) {
        showToast(`${exitosos} producto(s) asignado(s)`, 'success')
        setModalAsignarVisible(false)
        setProductosSeleccionados(new Set())
        await loadReporte()
      }
    } catch (error) {
      showToast('Error asignando proveedor: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [productosSeleccionados, proveedores, loadReporte, showToast])

  const crearNuevoProveedor = useCallback(async (datosProveedor) => {
    try {
      setLoading(true)
      const response = await api.post('/alegra/proveedores', datosProveedor)
      if (response.data.success) {
        showToast(`Proveedor creado: ${response.data.data.name}`, 'success')
        setModalCrearProveedor(false)
        await asignarProveedorManual(response.data.data.id)
      } else {
        showToast(`Error: ${response.data.message}`, 'error')
      }
    } catch (error) {
      showToast('Error creando proveedor: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [asignarProveedorManual, showToast])

  const eliminarProductoDeOrden = useCallback(async (proveedorNombre, productoCodigo, productoNombre, cantidadOriginal) => {
    const key = `${proveedorNombre}-${productoCodigo}`
    setProductosEliminados(prev => new Set(prev).add(key))

    try {
      await api.post('/alegra/orden-compra/producto-eliminado', { proveedorNombre, productoCodigo, productoNombre, cantidadOriginal: cantidadOriginal || 0 })
    } catch (error) {
      console.error('Error:', error)
    }
  }, [])

  const restaurarProducto = useCallback(async (proveedorNombre, productoCodigo) => {
    const key = `${proveedorNombre}-${productoCodigo}`
    setProductosEliminados(prev => {
      const nuevosEliminados = new Set(prev)
      nuevosEliminados.delete(key)
      return nuevosEliminados
    })

    try {
      await api.delete('/alegra/orden-compra/producto-eliminado', { data: { proveedorNombre, productoCodigo } })
    } catch (error) {
      console.error('No se pudo restaurar el producto:', error)
      showToast('El producto se restauró en pantalla, pero NO se guardó. Recargue antes de enviar el pedido.', 'error')
    }
  }, [])

  const abrirModalAgregarProducto = useCallback((proveedor) => {
    setProveedorParaAgregar(proveedor)
    setModalAgregarProducto(true)
    setBusquedaProducto('')
    setProductosAlegra([])
  }, [])

  const buscarProductosAlegra = useCallback(async (query) => {
    if (!query || query.length < 2) { setProductosAlegra([]); return }
    try {
      setLoadingProductos(true)
      const res = await api.get('/alegra/productos/buscar', { params: { query } })
      if (res.data.success) setProductosAlegra(res.data.data || [])
    } catch (e) {
      // Búsqueda mientras se escribe: no se avisa —una petición cortada por
      // la siguiente tecla no es un problema— pero sí queda en consola.
      console.warn('Búsqueda de productos falló:', e.message)
    } finally { setLoadingProductos(false) }
  }, [])

  const agregarProductoAOrden = useCallback(async (producto, cantidad) => {
    if (!proveedorParaAgregar || cantidad <= 0) return
    const keyProv = proveedorParaAgregar.nombre
    const nuevosAgregados = new Map(productosAgregados)
    const list = nuevosAgregados.get(keyProv) || []
    list.push({ codigo: producto.reference, nombre: producto.name, cantidad: parseInt(cantidad), agregadoManual: true })
    nuevosAgregados.set(keyProv, list)
    setProductosAgregados(nuevosAgregados)

    try {
      await api.post('/alegra/orden-compra/producto-agregado', { proveedorNombre: keyProv, productoCodigo: producto.reference, productoNombre: producto.name, cantidad: parseInt(cantidad) })
    } catch (error) {
      console.error('No se pudo registrar el producto agregado:', error)
      showToast('El producto se agregó en pantalla, pero NO se guardó. Recargue antes de enviar el pedido.', 'error')
    }
    setModalAgregarProducto(false)
  }, [proveedorParaAgregar, productosAgregados])

  const solicitarCantidadYAgregar = useCallback(async (producto, reference) => {
    const q = await prompt(`${producto.name}\n¿Cantidad a añadir a la orden?`, { inputDefaultValue: '1' })
    if (q && parseInt(q) > 0) {
      await agregarProductoAOrden({ ...producto, reference }, q)
    }
  }, [prompt, agregarProductoAOrden])

  const eliminarProductoAgregado = useCallback(async (proveedorNombre, index) => {
    const nuevos = new Map(productosAgregados)
    const list = nuevos.get(proveedorNombre) || []
    const prod = list[index]
    list.splice(index, 1)
    if (list.length === 0) nuevos.delete(proveedorNombre); else nuevos.set(proveedorNombre, list)
    setProductosAgregados(nuevos)

    try {
      await api.delete('/alegra/orden-compra/producto-agregado', { data: { proveedorNombre, productoCodigo: prod.codigo } })
    } catch (e) {
      console.error('No se pudo quitar el producto agregado:', e)
      showToast('El cambio NO se guardó. Recargue antes de enviar el pedido.', 'error')
    }
  }, [productosAgregados])

  const actualizarCantidadAgregado = useCallback(async (proveedorNombre, index, nuevaCantidad) => {
    const cant = parseInt(nuevaCantidad)
    if (isNaN(cant) || cant <= 0) return
    const nuevos = new Map(productosAgregados)
    const list = nuevos.get(proveedorNombre) || []
    if (list[index]) {
      list[index] = { ...list[index], cantidad: cant }
      nuevos.set(proveedorNombre, list)
      setProductosAgregados(nuevos)

      try {
        await api.post('/alegra/orden-compra/producto-agregado', { proveedorNombre, productoCodigo: list[index].codigo, productoNombre: list[index].nombre, cantidad: cant })
      } catch (e) {
        console.error('No se pudo guardar la cantidad:', e)
        showToast('La cantidad NO se guardó. Recargue antes de enviar el pedido.', 'error')
      }
    }
  }, [productosAgregados])

  return {
    proveedores,
    resumen,
    loading,
    error,
    fechaInicio,
    setFechaInicio,
    loadReporte,

    cantidadesModificadas,
    cantidadesGuardadas,
    handleCantidadChange,
    handleGuardarCantidades,

    preferenciasDatosProveedor,
    usaDatosProveedor,
    togglePreferenciaProveedor,

    handleGenerarPDF,

    modalWhatsAppVisible,
    setModalWhatsAppVisible,
    proveedorParaWhatsApp,
    telefonoProveedor,
    setTelefonoProveedor,
    mensajeWhatsApp,
    setMensajeWhatsApp,
    abrirModalWhatsApp,
    enviarWhatsApp,

    productosSeleccionados,
    toggleProductoSeleccionado,
    toggleTodosProductos,

    modalAsignarVisible,
    setModalAsignarVisible,
    proveedoresAlegra,
    setProveedoresAlegra,
    busquedaProveedor,
    setBusquedaProveedor,
    loadingProveedores,
    abrirModalAsignar,
    cargarProveedoresAlegra,
    asignarProveedorManual,

    modalCrearProveedor,
    setModalCrearProveedor,
    crearNuevoProveedor,

    productosEliminados,
    eliminarProductoDeOrden,
    restaurarProducto,

    productosAgregados,
    modalAgregarProducto,
    setModalAgregarProducto,
    proveedorParaAgregar,
    busquedaProducto,
    setBusquedaProducto,
    productosAlegra,
    loadingProductos,
    abrirModalAgregarProducto,
    buscarProductosAlegra,
    solicitarCantidadYAgregar,
    eliminarProductoAgregado,
    actualizarCantidadAgregado,

    dialogProps,
    toasts,
    removeToast
  }
}
