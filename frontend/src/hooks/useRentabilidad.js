import { useCallback, useEffect, useRef, useState } from 'react'
import { getResumenRentabilidad, getProductosRentabilidad, getProductoRentabilidad } from '../services/rentabilidadService'

export const FILTROS_INICIALES = { buscar: '', categoria: '', clase: '', costo: '', orden: 'vendidos', pagina: 1 }

const RETRASO_BUSQUEDA_MS = 300
const mensaje = (e, porDefecto) => e?.response?.data?.message || porDefecto

/**
 * Estado de Rentabilidad: el resumen del negocio, la lista de productos con
 * sus filtros, y el producto abierto.
 *
 * LO QUE ARREGLA DE LA VERSIÓN ANTERIOR
 *   · Una respuesta que llega tarde ya no pisa a la nueva: cada pedido lleva
 *     su número y solo el último se pinta (tipear rápido en el buscador
 *     dejaba en pantalla el resultado de un término viejo).
 *   · El buscador espera a que se deje de escribir, no pide por cada tecla.
 *   · Un error se limpia cuando el siguiente pedido sale bien.
 *   · Mientras recarga, la lista vieja se queda a la vista (atenuada) en vez
 *     de desaparecer.
 */
export function useRentabilidad() {
  const [resumen, setResumen] = useState(null)
  const [errorResumen, setErrorResumen] = useState(null)

  const [filtros, setFiltrosState] = useState(FILTROS_INICIALES)
  const [buscarAplicado, setBuscarAplicado] = useState('')
  const [lista, setLista] = useState({ data: [], total: 0, paginas: 1, pagina: 1 })
  const [cargandoLista, setCargandoLista] = useState(true)
  const [errorLista, setErrorLista] = useState(null)
  const pedidoLista = useRef(0)

  const [seleccionado, setSeleccionado] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [errorDetalle, setErrorDetalle] = useState(null)
  const pedidoDetalle = useRef(0)

  useEffect(() => {
    let vivo = true
    getResumenRentabilidad()
      .then((r) => { if (vivo) { setResumen(r); setErrorResumen(null) } })
      .catch((e) => { if (vivo) setErrorResumen(mensaje(e, 'No se pudo cargar el resumen.')) })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setBuscarAplicado(filtros.buscar.trim()), RETRASO_BUSQUEDA_MS)
    return () => clearTimeout(t)
  }, [filtros.buscar])

  useEffect(() => {
    const miPedido = ++pedidoLista.current
    setCargandoLista(true)
    getProductosRentabilidad({ ...filtros, buscar: buscarAplicado })
      .then((r) => {
        if (pedidoLista.current !== miPedido) return
        setLista(r)
        setErrorLista(null)
      })
      .catch((e) => { if (pedidoLista.current === miPedido) setErrorLista(mensaje(e, 'No se pudieron cargar los productos.')) })
      .finally(() => { if (pedidoLista.current === miPedido) setCargandoLista(false) })
    // `filtros.buscar` no: la búsqueda va por `buscarAplicado`, con su pausa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscarAplicado, filtros.categoria, filtros.clase, filtros.costo, filtros.orden, filtros.pagina])

  /** Cambiar cualquier filtro vuelve a la página 1; cambiar de página, no. */
  const setFiltros = useCallback((cambios) => {
    setFiltrosState((prev) => ({ ...prev, ...cambios, pagina: 'pagina' in cambios ? cambios.pagina : 1 }))
  }, [])

  const limpiarFiltros = useCallback(() => setFiltrosState(FILTROS_INICIALES), [])

  const abrir = useCallback((producto) => {
    const miPedido = ++pedidoDetalle.current
    setSeleccionado(producto)
    setDetalle(null)
    setErrorDetalle(null)
    setCargandoDetalle(true)
    window.scrollTo({ top: 0 })
    getProductoRentabilidad(producto.alegraItemId)
      .then((r) => { if (pedidoDetalle.current === miPedido) setDetalle(r) })
      .catch((e) => { if (pedidoDetalle.current === miPedido) setErrorDetalle(mensaje(e, 'No se pudo cargar el producto.')) })
      .finally(() => { if (pedidoDetalle.current === miPedido) setCargandoDetalle(false) })
  }, [])

  const cerrar = useCallback(() => {
    pedidoDetalle.current++
    setSeleccionado(null)
    setDetalle(null)
  }, [])

  return {
    resumen, errorResumen,
    filtros, setFiltros, limpiarFiltros,
    lista, cargandoLista, errorLista,
    seleccionado, detalle, cargandoDetalle, errorDetalle, abrir, cerrar
  }
}
