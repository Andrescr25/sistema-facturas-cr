import { useEffect, useState } from 'react'
import api from '../services/api'

/**
 * Buscar un producto del maestro propio mientras se escribe (desde 2 letras,
 * con 300 ms de espera), el mismo buscador de Relacionar productos. Solo
 * busca con `activa`; una respuesta vieja nunca pisa a una más nueva.
 */
export function useBuscarProductoPropio(activa) {
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    if (!activa || busqueda.trim().length < 2) { setResultados([]); return undefined }
    let vigente = true
    const espera = setTimeout(async () => {
      setBuscando(true)
      try {
        const { data } = await api.get(`/productos-revision/buscar?q=${encodeURIComponent(busqueda.trim())}`)
        if (vigente) setResultados(data.productos || [])
      } catch { if (vigente) setResultados([]) }
      finally { if (vigente) setBuscando(false) }
    }, 300)
    return () => { vigente = false; clearTimeout(espera) }
  }, [activa, busqueda])

  const limpiar = () => { setBusqueda(''); setResultados([]) }
  return { busqueda, setBusqueda, resultados, buscando, limpiar }
}
