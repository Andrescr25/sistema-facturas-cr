import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getProductosNuevos, agregarProductoNuevo, quitarProductoNuevo, buscarProductosNuevos
} from '../services/inventarioService'

/**
 * "Productos nuevos" del catálogo del agente: la lista manual y su buscador.
 *
 * Hook propio y no otro pedazo de useInventarioAuditoria (900 líneas): la
 * sección no comparte estado con auditorías, devoluciones ni excesos. Los
 * avisos y la confirmación sí son los de la página, y llegan de afuera.
 */
export function useProductosNuevos({ showToast, confirm }) {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [ocupado, setOcupado] = useState(null) // clave de la acción, con su espacio de ids explícito
  const pedidoBusqueda = useRef(0)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const r = await getProductosNuevos()
      if (r.success) setProductos(r.data)
    } catch (err) {
      console.error('Error cargando productos nuevos:', err)
      showToast('No se pudo cargar la lista de productos nuevos.', 'error')
    } finally {
      setCargando(false)
    }
  }, [showToast])

  useEffect(() => { cargar() }, [cargar])

  // Búsqueda con espera de 300 ms; si llega una respuesta vieja después de
  // una nueva, se descarta.
  useEffect(() => {
    const texto = busqueda.trim()
    if (texto.length < 2) {
      setResultados([])
      setBuscando(false)
      return undefined
    }
    const id = ++pedidoBusqueda.current
    setBuscando(true)
    const t = setTimeout(async () => {
      try {
        const r = await buscarProductosNuevos(texto)
        if (id === pedidoBusqueda.current && r.success) setResultados(r.data)
      } catch (err) {
        console.error('Error buscando productos:', err)
      } finally {
        if (id === pedidoBusqueda.current) setBuscando(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda])

  const agregar = async (producto) => {
    setOcupado(`producto:${producto.productoId}`)
    try {
      const r = await agregarProductoNuevo(producto.productoId)
      if (r.success) {
        showToast(r.data.yaEstaba
          ? `"${r.data.nombre}" ya estaba en Productos nuevos.`
          : `"${r.data.nombre}" agregado a Productos nuevos.`, r.data.yaEstaba ? 'info' : 'success')
        await cargar()
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'No se pudo agregar el producto.', 'error')
    } finally {
      setOcupado(null)
    }
  }

  const quitar = async (producto) => {
    const ok = await confirm(
      `"${producto.nombre}" deja de salir en esa sección del catálogo del agente la próxima vez que se actualice la tablet.`,
      { title: '¿Quitar de Productos nuevos?', confirmLabel: 'Quitar', variant: 'danger' }
    )
    if (!ok) return
    setOcupado(`registro:${producto.registroId}`)
    try {
      const r = await quitarProductoNuevo(producto.registroId)
      if (r.success) {
        showToast(`"${producto.nombre}" quitado de Productos nuevos.`, 'success')
        setProductos((prev) => prev.filter((p) => p.registroId !== producto.registroId))
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'No se pudo quitar el producto.', 'error')
    } finally {
      setOcupado(null)
    }
  }

  return { productos, cargando, cargar, busqueda, setBusqueda, resultados, buscando, ocupado, agregar, quitar }
}
