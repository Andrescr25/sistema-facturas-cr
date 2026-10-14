import { useState, useCallback } from 'react'
import api from '../services/api'
import { claveProductoReporte, claveTemporalProducto, agregarProductoManual, cantidadEnteraValida, clavesProductoProveedor, keyProductoProveedor, getCantidadFinal, edicionCantidadProducto, construirCantidadGuardada, contextoEdicionProveedor } from '../utils/reporteProveedoresUtils'

/** Edición del reporte conservada de main, separada de las órdenes enviadas. */
export function useEdicionFaltantesProveedor({ prompt, showToast, cantidadesModificadas, cantidadesGuardadas, setCantidadesModificadas, proveedores = [], onRevisionInvalida = () => {}, onTemporalesGuardados = async () => {} }) {
  // Estados Edición Manual
  const [productosEliminados, setProductosEliminados] = useState(new Set())
  const [clavesEliminadasGuardadas, setClavesEliminadasGuardadas] = useState(new Map())
  const [productosAgregados, setProductosAgregados] = useState(new Map())
  const [modalAgregarProducto, setModalAgregarProducto] = useState(false)
  const [proveedorParaAgregar, setProveedorParaAgregar] = useState(null)
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [productosEncontrados, setProductosEncontrados] = useState([])
  const [loadingProductos, setLoadingProductos] = useState(false)
  const contexto = nombre => contextoEdicionProveedor(proveedores.find(p => p.nombre === nombre && !p.enviada && !p.orden_id))
  const avisarError = (error, nombre, mensaje) => {
    if (error.response?.status === 409) { onRevisionInvalida(nombre); showToast('El reporte cambió. Se actualizó la compra; revisá las cantidades antes de continuar.', 'error') }
    else showToast(error.response?.data?.message || mensaje || error.message, 'error')
  }

  const eliminarProductoDeOrden = useCallback(async (proveedorNombre, productoCodigo, productoNombre, cantidadOriginal, productoId) => {
    const key = `${proveedorNombre}-${productoCodigo}`
    setProductosEliminados(prev => new Set(prev).add(key))

    try {
      await api.post('/orden-compra/producto-eliminado', { proveedorNombre, productoCodigo, productoNombre, cantidadOriginal: cantidadOriginal || 0, producto_id: productoId, ...contexto(proveedorNombre) })
    } catch (error) {
      console.error('Error:', error)
      setProductosEliminados(prev => { const siguiente = new Set(prev); siguiente.delete(key); return siguiente })
      avisarError(error, proveedorNombre, 'No se guardó la exclusión. Actualizá el reporte antes de continuar.')
    }
  }, [proveedores, onRevisionInvalida, showToast])

  const restaurarProducto = useCallback(async (proveedorNombre, productoCodigo, productoId) => {
    const codigos = Array.isArray(productoCodigo) ? productoCodigo : [productoCodigo]
    const almacenados = [...new Set(codigos.map(codigo => clavesEliminadasGuardadas.get(`${proveedorNombre}-${codigo}`) || codigo))]
    setProductosEliminados(prev => {
      const nuevosEliminados = new Set(prev)
      codigos.forEach(codigo => nuevosEliminados.delete(`${proveedorNombre}-${codigo}`))
      return nuevosEliminados
    })

    try {
      for (const codigo of almacenados) await api.delete('/orden-compra/producto-eliminado', { data: { proveedorNombre, productoCodigo: codigo, producto_id: productoId, ...contexto(proveedorNombre) } })
    } catch (error) {
      console.error('No se pudo restaurar el producto:', error)
      avisarError(error, proveedorNombre, 'El producto se restauró en pantalla, pero NO se guardó. Recargue antes de enviar el pedido.')
    }
  }, [proveedores, clavesEliminadasGuardadas, onRevisionInvalida, showToast])

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
    if (!proveedorParaAgregar) return
    if (!cantidadEnteraValida(cantidad, 1)) { showToast('El producto agregado requiere una cantidad entera de 1 a 1000000.', 'error'); return }
    const keyProv = proveedorParaAgregar.nombre
    const nuevosAgregados = new Map(productosAgregados)
    const clave = claveProductoReporte(producto)
    if (!clave) { showToast('Seleccioná un producto del catálogo.', 'error'); return }
    const proveedorActual = proveedores.find(p => p.nombre === keyProv && !p.enviada && !p.orden_id)
    if (!proveedorActual || proveedorActual.revisionReporte !== proveedorParaAgregar.revisionReporte || (proveedorActual.fechaInicio || null) !== (proveedorParaAgregar.fechaInicio || null)) { onRevisionInvalida(keyProv); showToast('El reporte cambió. Volvé a abrir el buscador para esta compra.', 'error'); setModalAgregarProducto(false); return }
    const nuevo = { productoId: producto.id, claveAlmacenada: `extra:${clave}`, codigo: producto.reference, nombre: producto.name, cantidad: Number(cantidad), agregadoManual: true }
    const original = proveedorActual.productos_faltantes.find(p => Number(p.producto_id) === Number(producto.id))
    if (original) {
      const edicion = edicionCantidadProducto(keyProv, original, cantidadesModificadas, cantidadesGuardadas, proveedorParaAgregar.productos_faltantes)
      if (edicion && !cantidadEnteraValida(edicion.cantidad)) { showToast('Revisá la cantidad entera del producto antes de agregar más.', 'error'); return }
      const actual = getCantidadFinal(keyProv, original, original.cantidad_faltante, cantidadesModificadas, cantidadesGuardadas, proveedorParaAgregar.productos_faltantes)
      const excluido = clavesProductoProveedor(keyProv, original, proveedorParaAgregar.productos_faltantes).some(key => productosEliminados.has(key))
      if (!excluido && cantidadEnteraValida(actual, 1)) {
        try {
          const cambio = construirCantidadGuardada(proveedorParaAgregar, original, actual, productosAgregados, productosEliminados)
          cambio.cantidad_modificada += Number(cantidad)
          if (!cantidadEnteraValida(cambio.cantidad_modificada, 1)) throw new Error('La cantidad total debe ser entera y no superar 1000000.')
          const { data } = await api.post('/orden-compra/cantidades', { cantidades: [cambio] })
          if (!data.success) throw new Error(data.message || 'No se pudo guardar la cantidad.')
          setCantidadesModificadas(prev => new Map(prev).set(keyProductoProveedor(keyProv, original), cambio.cantidad_modificada))
          nuevosAgregados.set(keyProv, (nuevosAgregados.get(keyProv) || []).filter(p => Number(p.productoId) !== Number(producto.id)))
          setProductosAgregados(nuevosAgregados)
          setModalAgregarProducto(false)
        } catch (error) { avisarError(error, keyProv) }
        return
      }
    }
    let list
    try { list = agregarProductoManual(nuevosAgregados.get(keyProv) || [], nuevo) }
    catch (error) { showToast(error.message, 'error'); return }
    const agregado = list.find(p => claveProductoReporte(p) === clave)
    nuevosAgregados.set(keyProv, list)
    setProductosAgregados(nuevosAgregados)

    try {
      await api.post('/orden-compra/producto-agregado', { proveedorNombre: keyProv, productoCodigo: claveTemporalProducto(agregado), productoNombre: producto.name, cantidad: agregado.cantidad, producto_id: producto.id, ...contexto(keyProv) })
      await onTemporalesGuardados()
    } catch (error) {
      console.error('No se pudo registrar el producto agregado:', error)
      if (error.response?.status === 409) setProductosAgregados(productosAgregados)
      avisarError(error, keyProv, 'El producto se agregó en pantalla, pero NO se guardó. Recargue antes de enviar el pedido.')
    }
    setModalAgregarProducto(false)
  }, [proveedorParaAgregar, productosAgregados, productosEliminados, cantidadesModificadas, cantidadesGuardadas, setCantidadesModificadas, proveedores, onRevisionInvalida, onTemporalesGuardados, showToast])

  const solicitarCantidadYAgregar = useCallback(async (producto, reference) => {
    const q = await prompt(`${producto.name}\n¿Cantidad a añadir a la orden?`, { inputDefaultValue: '1' })
    if (q !== null && q !== undefined) {
      await agregarProductoAOrden({ ...producto, reference }, q)
    }
  }, [prompt, agregarProductoAOrden])

  const eliminarProductoAgregado = useCallback(async (proveedorNombre, index) => {
    const nuevos = new Map(productosAgregados)
    const list = [...(nuevos.get(proveedorNombre) || [])]
    const prod = list[index]
    list.splice(index, 1)
    if (list.length === 0) nuevos.delete(proveedorNombre); else nuevos.set(proveedorNombre, list)
    setProductosAgregados(nuevos)

    try {
      await api.delete('/orden-compra/producto-agregado', { data: { proveedorNombre, productoCodigo: claveTemporalProducto(prod), producto_id: prod.productoId || null, ...contexto(proveedorNombre) } })
    } catch (e) {
      console.error('No se pudo quitar el producto agregado:', e)
      if (e.response?.status === 409) setProductosAgregados(productosAgregados)
      avisarError(e, proveedorNombre, 'El cambio NO se guardó. Recargue antes de enviar el pedido.')
    }
  }, [productosAgregados, proveedores, onRevisionInvalida, showToast])

  const actualizarCantidadAgregado = useCallback(async (proveedorNombre, index, nuevaCantidad) => {
    const cant = Number(nuevaCantidad)
    if (!cantidadEnteraValida(nuevaCantidad, 1)) { showToast('El producto agregado requiere una cantidad entera de 1 a 1000000.', 'error'); return }
    const nuevos = new Map(productosAgregados)
    const list = [...(nuevos.get(proveedorNombre) || [])]
    if (list[index]) {
      list[index] = { ...list[index], cantidad: cant }
      nuevos.set(proveedorNombre, list)
      setProductosAgregados(nuevos)

      try {
        await api.post('/orden-compra/producto-agregado', { proveedorNombre, productoCodigo: claveTemporalProducto(list[index]), productoNombre: list[index].nombre, cantidad: cant, producto_id: list[index].productoId || null, ...contexto(proveedorNombre) })
        await onTemporalesGuardados()
      } catch (e) {
        console.error('No se pudo guardar la cantidad:', e)
        if (e.response?.status === 409) setProductosAgregados(productosAgregados)
        avisarError(e, proveedorNombre, 'La cantidad NO se guardó. Recargue antes de enviar el pedido.')
      }
    }
  }, [productosAgregados, proveedores, onRevisionInvalida, onTemporalesGuardados, showToast])

  return { productosEliminados, setProductosEliminados, clavesEliminadasGuardadas, setClavesEliminadasGuardadas, productosAgregados, setProductosAgregados,
    modalAgregarProducto, setModalAgregarProducto, proveedorParaAgregar, busquedaProducto,
    setBusquedaProducto, productosEncontrados, loadingProductos, eliminarProductoDeOrden,
    restaurarProducto, abrirModalAgregarProducto, buscarProductos, solicitarCantidadYAgregar,
    eliminarProductoAgregado, actualizarCantidadAgregado }
}
