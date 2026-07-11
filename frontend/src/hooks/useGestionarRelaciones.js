import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import { calcularFactorConversion, inferirCantidadesDesdeFactor } from '../utils/gestionarRelacionesUtils'
import { useToast } from './useToast'

/**
 * Estado y lógica de negocio de la gestión de relaciones producto↔Alegra:
 * listado paginado con filtros, edición de relación, factor de conversión,
 * eliminación y consulta de relaciones cruzadas. Extraído de
 * GestionarRelaciones.jsx.
 *
 * Usa showToast() (useToast) en vez de window.alert. La página debe
 * renderizar <ToastContainer toasts={toasts} onRemove={removeToast} />.
 */
export function useGestionarRelaciones() {
  const { toasts, showToast, removeToast } = useToast()

  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Filtros
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [proveedores, setProveedores] = useState([])

  // Modales
  const [modalEditar, setModalEditar] = useState(false)
  const [modalEliminar, setModalEliminar] = useState(false)
  const [modalFactor, setModalFactor] = useState(false)
  const [modalRelaciones, setModalRelaciones] = useState(false)
  const [productoSeleccionado, setProductoSeleccionado] = useState(null)
  const [relacionesProducto, setRelacionesProducto] = useState(null)
  const [cargandoRelaciones, setCargandoRelaciones] = useState(false)

  // Factor de conversión
  const [cantidadProveedor, setCantidadProveedor] = useState(1)
  const [cantidadMia, setCantidadMia] = useState(1)

  // Búsqueda de nuevo producto
  const [terminoBusqueda, setTerminoBusqueda] = useState('')
  const [resultadosBusqueda, setResultadosBusqueda] = useState([])
  const [buscando, setBuscando] = useState(false)

  // Paginación
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const loadProductos = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        page: page,
        limit: 20,
        estado: 'RELACIONADO',
        proveedor: filtroProveedor,
        busqueda: busqueda
      })

      const response = await api.get(`/productos-revision/relacionados?${params}`)
      const result = response.data

      if (result.success) {
        setProductos(result.productos)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, filtroProveedor, busqueda])

  const loadProveedores = useCallback(async () => {
    try {
      const response = await api.get('/proveedores')
      if (response.data.success) {
        setProveedores(response.data.proveedores)
      }
    } catch (err) {
      console.error('Error cargando proveedores:', err)
    }
  }, [])

  useEffect(() => {
    loadProductos()
    loadProveedores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const aplicarFiltros = useCallback(() => {
    setPage(1)
    loadProductos()
  }, [loadProductos])

  const limpiarFiltros = useCallback(() => {
    setFiltroProveedor('')
    setBusqueda('')
    setPage(1)
    setTimeout(loadProductos, 100)
  }, [loadProductos])

  // Editar relación
  const abrirEditar = useCallback((producto) => {
    setProductoSeleccionado(producto)
    setModalEditar(true)
    setTerminoBusqueda('')
    setResultadosBusqueda([])
  }, [])

  const cerrarEditar = useCallback(() => setModalEditar(false), [])

  const abrirFactor = useCallback((producto) => {
    setProductoSeleccionado(producto)

    // Si ya tiene un factor, calcularlo en reversa
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

  const cerrarFactor = useCallback(() => setModalFactor(false), [])

  // Ver todas las relaciones de un producto
  const abrirRelaciones = useCallback(async (producto) => {
    if (!producto.alegraItemId) {
      showToast('Este producto no tiene un ID de Alegra asociado', 'warning')
      return
    }

    setProductoSeleccionado(producto)
    setModalRelaciones(true)
    setCargandoRelaciones(true)
    setRelacionesProducto(null)

    try {
      const response = await api.get(`/productos-revision/producto/${producto.alegraItemId}/relaciones`)
      if (response.data.success) {
        setRelacionesProducto(response.data)
      } else {
        throw new Error(response.data.error || 'Error cargando relaciones')
      }
    } catch (err) {
      showToast('Error cargando relaciones: ' + err.message, 'error')
      setModalRelaciones(false)
    } finally {
      setCargandoRelaciones(false)
    }
  }, [showToast])

  const cerrarRelaciones = useCallback(() => setModalRelaciones(false), [])

  const guardarFactor = useCallback(async () => {
    if (!productoSeleccionado?.mapeo) return

    const cantProv = parseFloat(cantidadProveedor)
    const cantMia = parseFloat(cantidadMia)

    if (cantProv <= 0 || cantMia <= 0) {
      showToast('Las cantidades deben ser mayores a 0', 'warning')
      return
    }

    const factor = calcularFactorConversion(cantProv, cantMia)

    try {
      await api.post('/productos-revision/factor-conversion', {
        mapeoId: productoSeleccionado.mapeo.id,
        factorConversion: factor
      })

      showToast(`Factor guardado: ${cantProv} del proveedor = ${cantMia} en tu sistema`, 'success')
      setModalFactor(false)
      loadProductos()
    } catch (err) {
      showToast('Error guardando factor: ' + err.message, 'error')
    }
  }, [productoSeleccionado, cantidadProveedor, cantidadMia, showToast, loadProductos])

  const buscarNuevoProducto = useCallback(async (termino) => {
    if (!termino || termino.length < 2) {
      setResultadosBusqueda([])
      return
    }

    try {
      setBuscando(true)
      const response = await api.get(`/productos-revision/buscar?q=${encodeURIComponent(termino)}`)
      const result = response.data

      if (result.success) {
        setResultadosBusqueda(result.productos || [])
      }
    } catch (err) {
      console.error('Error buscando:', err)
    } finally {
      setBuscando(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (terminoBusqueda) {
        buscarNuevoProducto(terminoBusqueda)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [terminoBusqueda, buscarNuevoProducto])

  const cambiarRelacion = useCallback(async (nuevoAlegraId, nuevoNombre) => {
    try {
      const response = await api.put(`/productos-revision/${productoSeleccionado.id}/editar-relacion`, {
        nuevoAlegraItemId: nuevoAlegraId
      })

      if (response.data.success) {
        showToast(`Relación actualizada: ${nuevoNombre}`, 'success')
        setModalEditar(false)
        loadProductos()
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error')
    }
  }, [productoSeleccionado, showToast, loadProductos])

  // Eliminar relación
  const abrirEliminar = useCallback((producto) => {
    setProductoSeleccionado(producto)
    setModalEliminar(true)
  }, [])

  const cerrarEliminar = useCallback(() => setModalEliminar(false), [])

  const confirmarEliminacion = useCallback(async () => {
    try {
      const response = await api.delete(`/productos-revision/${productoSeleccionado.id}/relacion`)

      if (response.data.success) {
        showToast('Relación eliminada. El producto volvió a estado PENDIENTE', 'success')
        setModalEliminar(false)
        loadProductos()
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error')
    }
  }, [productoSeleccionado, showToast, loadProductos])

  return {
    productos,
    loading,
    error,
    filtroProveedor,
    setFiltroProveedor,
    busqueda,
    setBusqueda,
    proveedores,
    page,
    setPage,
    totalPages,
    total,
    loadProductos,
    aplicarFiltros,
    limpiarFiltros,

    modalEditar,
    abrirEditar,
    cerrarEditar,

    modalFactor,
    abrirFactor,
    cerrarFactor,
    cantidadProveedor,
    setCantidadProveedor,
    cantidadMia,
    setCantidadMia,
    guardarFactor,

    modalRelaciones,
    abrirRelaciones,
    cerrarRelaciones,
    relacionesProducto,
    cargandoRelaciones,

    modalEliminar,
    abrirEliminar,
    cerrarEliminar,
    confirmarEliminacion,

    productoSeleccionado,
    terminoBusqueda,
    setTerminoBusqueda,
    resultadosBusqueda,
    buscando,
    cambiarRelacion,

    toasts,
    removeToast
  }
}
