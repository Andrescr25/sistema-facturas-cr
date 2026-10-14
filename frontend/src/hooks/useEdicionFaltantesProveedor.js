import { useState, useCallback } from 'react'
import api from '../services/api'

/** Edición del reporte conservada de main, separada de las órdenes enviadas. */
export function useEdicionFaltantesProveedor({ prompt, showToast }) {
  // Estados Edición Manual
  const [productosEliminados, setProductosEliminados] = useState(new Set())
  const [productosAgregados, setProductosAgregados] = useState(new Map())
  const [modalAgregarProducto, setModalAgregarProducto] = useState(false)
  const [proveedorParaAgregar, setProveedorParaAgregar] = useState(null)
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [productosEncontrados, setProductosEncontrados] = useState([])
  const [loadingProductos, setLoadingProductos] = useState(false)

  const eliminarProductoDeOrden = useCallback(async (proveedorNombre, productoCodigo, productoNombre, cantidadOriginal) => {
    const key = `${proveedorNombre}-${productoCodigo}`
    setProductosEliminados(prev => new Set(prev).add(key))

    try {
      await api.post('/orden-compra/producto-eliminado', { proveedorNombre, productoCodigo, productoNombre, cantidadOriginal: cantidadOriginal || 0 })
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
      await api.delete('/orden-compra/producto-eliminado', { data: { proveedorNombre, productoCodigo } })
    } catch (error) {
      console.error('No se pudo restaurar el producto:', error)
      showToast('El producto se restauró en pantalla, pero NO se guardó. Recargue antes de enviar el pedido.', 'error')
    }
  }, [])

  const abrirModalAgregarProducto = useCallback((proveedor) => {
    setProveedorParaAgregar(proveedor)
    setModalAgregarProducto(true)
    setBusquedaProducto('')
    setProductosEncontrados([])
  }, [])

  const buscarProductos = useCallback(async (query) => {
    if (!query || query.length < 2) { setProductosEncontrados([]); return }
    try {
      setLoadingProductos(true)
      // Sin desactivados: no tiene sentido pedirle al proveedor algo que ya no se vende.
      // Del maestro propio, solo activos (la lectura compartida de
      // /catalogos). El modal los pinta con `name` y `reference`.
      const res = await api.get('/catalogos/productos', { params: { buscar: query, limite: 30 } })
      if (res.data.success) {
        setProductosEncontrados((res.data.data || []).map(p => ({ id: p.id, name: p.nombre, reference: p.referencia || '' })))
      }
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
    list.push({ productoId: producto.id, codigo: producto.reference, nombre: producto.name, cantidad: parseInt(cantidad), agregadoManual: true })
    nuevosAgregados.set(keyProv, list)
    setProductosAgregados(nuevosAgregados)

    try {
      await api.post('/orden-compra/producto-agregado', { proveedorNombre: keyProv, productoCodigo: producto.reference, productoNombre: producto.name, cantidad: parseInt(cantidad) })
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
      await api.delete('/orden-compra/producto-agregado', { data: { proveedorNombre, productoCodigo: prod.codigo } })
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
        await api.post('/orden-compra/producto-agregado', { proveedorNombre, productoCodigo: list[index].codigo, productoNombre: list[index].nombre, cantidad: cant })
      } catch (e) {
        console.error('No se pudo guardar la cantidad:', e)
        showToast('La cantidad NO se guardó. Recargue antes de enviar el pedido.', 'error')
      }
    }
  }, [productosAgregados])

  return { productosEliminados, setProductosEliminados, productosAgregados, setProductosAgregados,
    modalAgregarProducto, setModalAgregarProducto, proveedorParaAgregar, busquedaProducto,
    setBusquedaProducto, productosEncontrados, loadingProductos, eliminarProductoDeOrden,
    restaurarProducto, abrirModalAgregarProducto, buscarProductos, solicitarCantidadYAgregar,
    eliminarProductoAgregado, actualizarCantidadAgregado }
}
