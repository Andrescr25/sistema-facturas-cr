import { useState, useEffect, useCallback, useRef } from 'react'
import { useContextoConsulta } from './useContextoConsulta'
import { alegraService } from '../services/alegraService'
import api from '../services/api'
import { keyProductoProveedor, clavesProductoProveedor, productoAgregadoGuardado, cantidadEnteraValida, construirCantidadGuardada, proveedoresConRevisionCambiada, temporalVigenteProveedor, retirarEdicionesDeProveedores } from '../utils/reporteProveedoresUtils'
import { useDialog } from './useDialog'
import { useToast } from './useToast'
import { useEdicionFaltantesProveedor } from './useEdicionFaltantesProveedor'

/**
 * Estado y lógica de negocio del reporte de faltantes por proveedor: carga,
 * edición de cantidades a pedir,
 * reasignación de productos a otro proveedor, y edición manual de la orden
 * (agregar/eliminar productos). Extraído de ReporteProveedores.jsx.
 *
 * Incluye prompt() (useDialog) y showToast() (useToast) en vez de
 * window.prompt/alert. La página debe renderizar
 * <ConfirmModal {...dialogProps} /> y <ToastContainer toasts={toasts} onRemove={removeToast} />.
 */
export function useReporteProveedores({activo=true}={}) {
  const peticion = useRef(0), peticionNotas = useRef(0)
  const proveedoresActuales = useRef([]), peticionCantidades = useRef(0)
  const { prompt, confirm, dialogProps } = useDialog()
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

  const { productosEliminados, setProductosEliminados, setClavesEliminadasGuardadas, productosAgregados, setProductosAgregados,
    modalAgregarProducto, setModalAgregarProducto, proveedorParaAgregar, busquedaProducto,
    setBusquedaProducto, productosEncontrados, loadingProductos, quitarDeCompras,
    restaurarProducto, abrirModalAgregarProducto, buscarProductos, solicitarCantidadYAgregar,
    eliminarProductoAgregado, actualizarCantidadAgregado } = useEdicionFaltantesProveedor({ prompt, confirm, showToast, cantidadesModificadas, cantidadesGuardadas, setCantidadesModificadas, proveedores,
      onTemporalesGuardados: () => loadCantidadesGuardadas(),
      onQuitadoDeCompras: () => loadReporte(),
      onRevisionInvalida: nombre => { retirarBuffers(new Set([nombre]), proveedoresActuales.current); loadReporte() } })

  const retirarBuffers = (nombres, todos) => {
    setCantidadesModificadas(prev => retirarEdicionesDeProveedores(prev, nombres, todos))
    setCantidadesGuardadas(prev => retirarEdicionesDeProveedores(prev, nombres, todos))
    setProductosEliminados(prev => retirarEdicionesDeProveedores(prev, nombres, todos))
    setClavesEliminadasGuardadas(prev => retirarEdicionesDeProveedores(prev, nombres, todos))
    setProductosAgregados(prev => new Map([...prev].filter(([nombre]) => !nombres.has(nombre))))
    setProductosSeleccionados(prev => retirarEdicionesDeProveedores(prev, nombres, todos))
    setModalAgregarProducto(false)
  }

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
        const anteriores = proveedoresActuales.current
        const cambiados = proveedoresConRevisionCambiada(anteriores, proveedoresConProductos)
        if (cambiados.size) retirarBuffers(cambiados, [...anteriores, ...proveedoresConProductos])
        proveedoresActuales.current = proveedoresConProductos
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
    const actual = ++peticionCantidades.current
    try {
      const result = await alegraService.getCantidadesModificadas()
      if (actual !== peticionCantidades.current) return
      if (result.success) {
        const cantidadesMap = new Map()
        result.data?.modificadas?.forEach(item => {
          if (!item.producto_id || !item.clave_producto || !temporalVigenteProveedor(item, proveedoresActuales.current)) return
          const key = `${item.proveedor_nombre}-${item.clave_producto}`
          cantidadesMap.set(key, {
            cantidad_original: item.cantidad_original,
            cantidad_modificada: item.cantidad_modificada
          })
        })
        setCantidadesGuardadas(cantidadesMap)

        const eliminados = new Set()
        const clavesEliminadas = new Map()
        result.data?.eliminadas?.forEach(item => {
          if (!item.producto_id || !item.clave_producto || !temporalVigenteProveedor(item, proveedoresActuales.current)) return
          const key = `${item.proveedor_nombre}-${item.clave_producto}`
          eliminados.add(key)
          clavesEliminadas.set(key, item.producto_codigo)
        })
        setProductosEliminados(eliminados)
        setClavesEliminadasGuardadas(clavesEliminadas)

        const agregados = new Map()
        result.data?.agregadas?.forEach(item => {
          if (!temporalVigenteProveedor(item, proveedoresActuales.current)) return
          const proveedorNombre = item.proveedor_nombre
          const productosDelProveedor = agregados.get(proveedorNombre) || []
          productosDelProveedor.push(productoAgregadoGuardado(item))
          agregados.set(proveedorNombre, productosDelProveedor)
        })
        setProductosAgregados(agregados)
      }
    } catch (err) {
      console.warn('Error cargando cantidades guardadas:', err)
    }
  }, [])

  useEffect(() => {
    setModalAsignarVisible(false)
    // Las fichas no deben disparar el reporte ni aplicar su edición de faltantes.
    if(!activo){++peticion.current;++peticionNotas.current;return}
    loadReporte()
    loadNotas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaInicio,activo])

  useEffect(() => { if (activo) loadCantidadesGuardadas() }, [proveedores, activo, loadCantidadesGuardadas])

  const togglePreferenciaProveedor = useCallback((proveedorNombre, value) => {
    setPreferenciasDatosProveedor(prev => ({
      ...prev,
      [proveedorNombre]: value
    }))
  }, [])

  const handleCantidadChange = useCallback((proveedorNombre, productoCodigo, nuevaCantidad) => {
    const key = `${proveedorNombre}-${productoCodigo}`
    if (nuevaCantidad !== '' && !cantidadEnteraValida(nuevaCantidad)) { showToast('Ingresá una cantidad entera de 0 a 1000000.', 'error'); return }
    const cantidadNum = nuevaCantidad === '' ? '' : Number(nuevaCantidad)
    setCantidadesModificadas(prev => {
      const nuevasCantidades = new Map(prev)
      nuevasCantidades.set(key, cantidadNum)
      return nuevasCantidades
    })
  }, [showToast])

  const handleGuardarCantidades = useCallback(async () => {
    if (cantidadesModificadas.size === 0) {
      showToast('No hay cantidades modificadas para guardar.', 'info')
      return
    }

    try {
      setLoading(true)
      const cantidadesParaGuardar = []
      proveedores.filter(proveedor => !proveedor.enviada && !proveedor.orden_id).forEach(proveedor => {
        proveedor.productos_faltantes.forEach(producto => {
          const key = keyProductoProveedor(proveedor.nombre, producto)
          const cantidadModificada = cantidadesModificadas.get(key)
          if (cantidadModificada !== undefined && !clavesProductoProveedor(proveedor.nombre, producto, proveedor.productos_faltantes).some(k => productosEliminados.has(k))) {
            cantidadesParaGuardar.push(construirCantidadGuardada(proveedor, producto, cantidadModificada, productosAgregados, productosEliminados))
          }
        })
      })

      const { data: result } = await api.post('/orden-compra/cantidades', { cantidades: cantidadesParaGuardar })
      if (result.success) {
        await loadCantidadesGuardadas()
        setCantidadesModificadas(new Map())
        showToast(`Cantidades guardadas correctamente\n\n• ${result.data?.cantidades_guardadas ?? 0} productos actualizados`, 'success')
      } else {
        showToast(`Error guardando cantidades: ${result.message}`, 'error')
      }
    } catch (error) {
      if (error.response?.status === 409) {
        retirarBuffers(new Set(proveedores.filter(p => !p.enviada && !p.orden_id).map(p => p.nombre)), proveedores)
        await loadReporte()
        showToast('El reporte cambió. Se actualizó la compra; revisá las cantidades antes de continuar.', 'error')
      } else showToast(`Error guardando cantidades: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [cantidadesModificadas, proveedores, productosAgregados, productosEliminados, loadCantidadesGuardadas, loadReporte, showToast])

  // Selección de Múltiples Productos
  const toggleProductoSeleccionado = useCallback((codigo) => {
    setProductosSeleccionados(prev => {
      const nuevaSeleccion = new Set(prev)
      if (nuevaSeleccion.has(codigo)) nuevaSeleccion.delete(codigo); else nuevaSeleccion.add(codigo)
      return nuevaSeleccion
    })
  }, [])

  const toggleTodosProductos = useCallback((proveedor) => {
    const todosCodigos = proveedor.productos_faltantes.map(p => keyProductoProveedor(proveedor.nombre, p)).filter(Boolean)
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
      proveedores.filter(proveedor => !proveedor.enviada && !proveedor.orden_id).forEach(proveedor => {
        const prod = proveedor.productos_faltantes.filter(p => productosSeleccionados.has(keyProductoProveedor(proveedor.nombre, p)))
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

  const refrescarTrasEnvio = useCallback(async (proveedorNombre) => {
    if (proveedorNombre) {
      // El servidor retira la edición de la compra confirmada; una nueva
      // compra del mismo proveedor no puede heredar la cantidad anterior.
      const claves = new Set(proveedores.filter(p => !p.enviada && !p.orden_id && p.nombre === proveedorNombre).flatMap(p => p.productos_faltantes.flatMap(producto => clavesProductoProveedor(proveedorNombre, producto, p.productos_faltantes))))
      const sinProveedor = mapa => new Map([...mapa].filter(([key]) => !claves.has(key)))
      setCantidadesModificadas(sinProveedor)
      setCantidadesGuardadas(sinProveedor)
      setProductosEliminados(prev => new Set([...prev].filter(key => !claves.has(key))))
      setProductosAgregados(prev => { const nuevos = new Map(prev); nuevos.delete(proveedorNombre); return nuevos })
      setProductosSeleccionados(new Set())
      await loadCantidadesGuardadas()
    }
    await loadReporte()
  }, [proveedores, loadReporte, loadCantidadesGuardadas])

  return {
    notasPorProducto: notas.vigente ? notasPorProducto : {},
    cargandoNotas: activo && (cargandoNotas || !notas.vigente),
    proveedores: lectura.vigente ? proveedores : [],
    resumen: lectura.vigente ? resumen : null,
    loading: activo && (loading || !lectura.vigente),
    error: lectura.vigente ? error : null,
    fechaInicio,
    setFechaInicio,
    loadReporte,
    refrescarTrasEnvio,

    cantidadesModificadas,
    cantidadesGuardadas,
    handleCantidadChange,
    handleGuardarCantidades,

    preferenciasDatosProveedor,
    togglePreferenciaProveedor,

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
    quitarDeCompras,
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
