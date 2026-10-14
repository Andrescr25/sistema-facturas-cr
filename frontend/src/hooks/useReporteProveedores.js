import { useState, useEffect, useCallback, useRef } from 'react'
import { useContextoConsulta } from './useContextoConsulta'
import { alegraService } from '../services/alegraService'
import api from '../services/api'
import { construirProductosParaOrden } from '../utils/reporteProveedoresUtils'
import { useDialog } from './useDialog'
import { useToast } from './useToast'
import { useEdicionFaltantesProveedor } from './useEdicionFaltantesProveedor'

/**
 * Estado y lógica de negocio del reporte de faltantes por proveedor: carga,
 * edición de cantidades a pedir, descarga de faltantes,
 * reasignación de productos a otro proveedor, y edición manual de la orden
 * (agregar/eliminar productos). Extraído de ReporteProveedores.jsx.
 *
 * Incluye prompt() (useDialog) y showToast() (useToast) en vez de
 * window.prompt/alert. La página debe renderizar
 * <ConfirmModal {...dialogProps} /> y <ToastContainer toasts={toasts} onRemove={removeToast} />.
 */
export function useReporteProveedores({activo=true}={}) {
  const peticion = useRef(0), peticionNotas = useRef(0)
  const { prompt, dialogProps } = useDialog()
  const { toasts, showToast, removeToast } = useToast()

  const [proveedores, setProveedores] = useState([])
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [cantidadesModificadas, setCantidadesModificadas] = useState(new Map())
  const [cantidadesGuardadas, setCantidadesGuardadas] = useState(new Map())
  const [fechaInicio, setFechaInicio] = useState('')
  const claveConsulta = JSON.stringify([activo, fechaInicio])
  const lectura = useContextoConsulta(claveConsulta)
  const notas = useContextoConsulta(claveConsulta)

  // Las notas que se escribieron al facturar, para leerlas al comprar. Se
  // piden APARTE del reporte: ambas lecturas son propias, pero agrupar las
  // notas no debe retrasar el listado. Si tardan o fallan, el reporte ya
  // está en pantalla.
  const [notasPorProducto, setNotasPorProducto] = useState({})
  const [cargandoNotas, setCargandoNotas] = useState(false)

  // Estados Modal Asignar Lotes
  const [modalAsignarVisible, setModalAsignarVisible] = useState(false)
  const [proveedoresDisponibles, setProveedoresDisponibles] = useState([])
  const [busquedaProveedor, setBusquedaProveedor] = useState('')
  const [loadingProveedores, setLoadingProveedores] = useState(false)
  const [modalCrearProveedor, setModalCrearProveedor] = useState(false)
  const [productosSeleccionados, setProductosSeleccionados] = useState(new Set())
  const [preferenciasDatosProveedor, setPreferenciasDatosProveedor] = useState({})

  const { productosEliminados, setProductosEliminados, productosAgregados, setProductosAgregados,
    modalAgregarProducto, setModalAgregarProducto, proveedorParaAgregar, busquedaProducto,
    setBusquedaProducto, productosEncontrados, loadingProductos, eliminarProductoDeOrden,
    restaurarProducto, abrirModalAgregarProducto, buscarProductos, solicitarCantidadYAgregar,
    eliminarProductoAgregado, actualizarCantidadAgregado } = useEdicionFaltantesProveedor({ prompt, showToast })

  // Marca de órdenes pendientes y envíos históricos. Viene del
  // registro de envíos del servidor y no del navegador, para que la marca la
  // vea también quien abra el reporte desde otra máquina.
  const [pedidosEnviados, setPedidosEnviados] = useState(new Map())
  const loadReporte = useCallback(async () => {
    if (!activo || !lectura.esActual()) return
    const actual = ++peticion.current
    try {
      setLoading(true)
      setError(null)
      const result = await alegraService.getReporteFaltantesProveedor(fechaInicio)
      if (!lectura.esActual() || actual !== peticion.current) return

      if (result.success) {
        // Filtrar proveedores que NO tienen productos para limpiar la vista principal
        const proveedoresConProductos = result.data.filter(p => p.productos_faltantes && p.productos_faltantes.length > 0)
        setProveedores(proveedoresConProductos)
        setResumen(result.resumen)
      } else {
        setProveedores([])
        setResumen(null)
        setError(result.message || 'Error cargando reporte')
      }
    } catch (err) {
      if (lectura.esActual() && actual === peticion.current) { setProveedores([]); setResumen(null); setError(err.message) }
    } finally {
      if (lectura.esActual() && actual === peticion.current) { lectura.confirmar(); setLoading(false) }
    }
  }, [activo, fechaInicio, lectura.esActual, lectura.confirmar])

  const loadNotas = useCallback(async () => {
    if (!activo || !notas.esActual()) return
    const actual = ++peticionNotas.current
    setCargandoNotas(true)
    try {
      const r = await alegraService.getNotasDeFaltantes(fechaInicio)
      if (!notas.esActual() || actual !== peticionNotas.current) return
      setNotasPorProducto(r?.data?.porProducto || {})
    } catch {
      // Sin notas se compra como se compraba hasta ayer: no se estorba.
      if (notas.esActual() && actual === peticionNotas.current) setNotasPorProducto({})
    } finally {
      if (notas.esActual() && actual === peticionNotas.current) { notas.confirmar(); setCargandoNotas(false) }
    }
  }, [activo, fechaInicio, notas.esActual, notas.confirmar])

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

  /** El estado sale de órdenes persistidas: una enviada antigua no oculta
   * que este mismo proveedor ya tenga una nueva pendiente de envío. */
  const loadPedidosEnviados = useCallback(async () => {
    try {
      const { data: result } = await api.get('/orden-compra/proveedor/estados')
      if (!result?.success) return
      const mapa = new Map()
      for (const fila of result.data || []) {
        const estado = { ultimoEnvio: fila.ultimoEnvio, veces: fila.veces, pendientes: fila.pendientes }
        mapa.set(fila.proveedor, estado)
        if (fila.cedula) mapa.set(fila.cedula, estado)
      }
      setPedidosEnviados(mapa)
    } catch { setPedidosEnviados(new Map()) }
  }, [])

  useEffect(() => {
    setModalAsignarVisible(false)
    // El reporte legado puede asignar proveedores al abrirse. Las otras
    // vistas no deben dispararlo de fondo ni aplicar sus borradores globales.
    if(!activo){++peticion.current;++peticionNotas.current;return}
    loadReporte()
    loadNotas()
    loadCantidadesGuardadas(); loadPedidosEnviados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaInicio,activo])

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

  const cargarProveedores = useCallback(async (busqueda) => {
    try {
      setLoadingProveedores(true)
      // Las fichas PROPIAS de proveedor (`proveedor.id`), no los contactos de
      // Alegra. El modal las pinta con `name` e `identification`.
      const response = await api.get('/proveedores/fichas', { params: { buscar: busqueda || '', limite: 100 } })
      if (response.data.success) {
        setProveedoresDisponibles((response.data.data || []).map(f => ({
          id: f.id, name: f.nombre, identification: f.identificacion || ''
        })))
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
    await cargarProveedores('')
  }, [productosSeleccionados, cargarProveedores])

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
          // Los dos ids son PROPIOS: el producto del que cuelgan los faltantes
          // (migración 032) y la ficha del proveedor. Asignar y reasignar son
          // la misma operación.
          return api.post('/proveedores/asignaciones', { productoId: producto.producto_id, proveedorId })
            .catch(err => ({ data: { success: false } }))
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
      // Se crea la FICHA propia y se le asignan los productos elegidos.
      const response = await api.post('/proveedores/fichas', {
        nombre: datosProveedor.name,
        tipo_identificacion: datosProveedor.identificationType || undefined,
        identificacion: datosProveedor.identification || undefined
      })
      if (response.data.success) {
        showToast(`Proveedor creado: ${response.data.data.nombre}`, 'success')
        setModalCrearProveedor(false)
        await asignarProveedorManual(response.data.data.id)
      } else {
        showToast(`Error: ${response.data.message}`, 'error')
      }
    } catch (error) {
      showToast('Error creando proveedor: ' + (error.response?.data?.message || error.message), 'error')
    } finally {
      setLoading(false)
    }
  }, [asignarProveedorManual, showToast])

  return {
    notasPorProducto: notas.vigente ? notasPorProducto : {},
    cargandoNotas: activo && (cargandoNotas || !notas.vigente),
    proveedores: lectura.vigente ? proveedores : [],
    pedidosEnviados,
    resumen: lectura.vigente ? resumen : null,
    loading: activo && (loading || !lectura.vigente),
    error: lectura.vigente ? error : null,
    fechaInicio,
    setFechaInicio,
    loadReporte: async () => { await loadReporte(); await loadPedidosEnviados() },

    cantidadesModificadas,
    cantidadesGuardadas,
    handleCantidadChange,
    handleGuardarCantidades,

    preferenciasDatosProveedor,
    usaDatosProveedor,
    togglePreferenciaProveedor,

    handleGenerarPDF,

    productosSeleccionados,
    toggleProductoSeleccionado,
    toggleTodosProductos,

    modalAsignarVisible,
    setModalAsignarVisible,
    proveedoresDisponibles,
    setProveedoresDisponibles,
    busquedaProveedor,
    setBusquedaProveedor,
    loadingProveedores,
    abrirModalAsignar,
    cargarProveedores,
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
    productosEncontrados,
    loadingProductos,
    abrirModalAgregarProducto,
    buscarProductos,
    solicitarCantidadYAgregar,
    eliminarProductoAgregado,
    actualizarCantidadAgregado,

    dialogProps,
    toasts,
    showToast,
    removeToast
  }
}
