import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'

/**
 * La bitácora de cambios, de solo lectura.
 *
 * Todas las llamadas exigen ser administrador (cuelgan de /usuarios, que el
 * backend protege con requirePermiso). Acá no hay ninguna que escriba.
 */
export const FILTROS_VACIOS = { entidad: '', accion: '', usuarioId: '', desde: '', hasta: '', buscar: '' }

export function useBitacora() {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [pagina, setPagina] = useState(1)
  const [lineas, setLineas] = useState([])
  const [paginacion, setPaginacion] = useState({ total: 0, pagina: 1, paginas: 0 })
  const [opciones, setOpciones] = useState({ entidades: [], acciones: [], usuarios: [] })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [abierta, setAbierta] = useState(null)       // la línea elegida de la lista
  const [detalle, setDetalle] = useState(null)       // esa línea con sus cambios
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  // Una respuesta vieja no pisa a la del filtro que se eligió después.
  const pedido = useRef(0)

  useEffect(() => {
    api.get('/usuarios/bitacora/filtros')
      .then(({ data }) => setOpciones(data.data))
      .catch(() => { /* sin opciones se puede buscar igual */ })
  }, [])

  useEffect(() => {
    const mio = ++pedido.current
    setCargando(true)
    setError('')
    // Se espera a que deje de escribir: una petición por tecla no sirve.
    const espera = setTimeout(() => {
      const params = Object.fromEntries(Object.entries({ ...filtros, pagina }).filter(([, v]) => v !== '' && v !== null))
      api.get('/usuarios/bitacora', { params })
        .then(({ data }) => {
          if (mio !== pedido.current) return
          setLineas(data.data || [])
          setPaginacion(data.paginacion || { total: 0, pagina: 1, paginas: 0 })
        })
        .catch((err) => {
          if (mio !== pedido.current) return
          setError(err.response?.data?.message || 'No se pudo leer la bitácora.')
        })
        .finally(() => { if (mio === pedido.current) setCargando(false) })
    }, 300)
    return () => clearTimeout(espera)
  }, [filtros, pagina])

  /** Cambiar un filtro vuelve a la primera página. */
  const cambiarFiltro = useCallback((campo, valor) => {
    setFiltros(f => ({ ...f, [campo]: valor }))
    setPagina(1)
  }, [])

  const limpiarFiltros = useCallback(() => { setFiltros(FILTROS_VACIOS); setPagina(1) }, [])

  const abrir = useCallback((linea) => {
    setAbierta(linea)
    setDetalle(null)
    setCargandoDetalle(true)
    window.scrollTo({ top: 0 })
    api.get(`/usuarios/bitacora/${linea.id}`)
      .then(({ data }) => setDetalle(data.data))
      .catch((err) => setError(err.response?.data?.message || 'No se pudo abrir esa línea.'))
      .finally(() => setCargandoDetalle(false))
  }, [])

  const volver = useCallback(() => { setAbierta(null); setDetalle(null) }, [])

  const hayFiltros = Object.values(filtros).some(v => v !== '')

  return {
    filtros, cambiarFiltro, limpiarFiltros, hayFiltros,
    pagina, setPagina, lineas, paginacion, opciones, cargando, error,
    abierta, detalle, cargandoDetalle, abrir, volver
  }
}
