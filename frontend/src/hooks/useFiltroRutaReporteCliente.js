import { useState, useEffect, useMemo, useCallback } from 'react'
import api from '../services/api'

/** Cada ruta se puede elegir aunque nunca haya tenido una semana/ciclo.
 * Los metadatos usan el permiso de Reporte Clientes, sin pedir el de Clientes.
 */
export function useFiltroRutaReporteCliente() {
  const [rutas, setRutas] = useState([])
  const [rutaId, cambiarRuta] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [intento, setIntento] = useState(0)
  const reintentar = useCallback(() => setIntento(n => n + 1), [])
  useEffect(() => {
    let vivo = true
    setCargando(true)
    api.get('/reportes/faltantes/cliente/rutas')
      .then(({ data }) => { if (vivo) { setRutas(data.data || []); setError('') } })
      .catch(e => { if (vivo) setError(e.response?.data?.message || 'No se pudieron consultar las rutas.') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [intento])
  const params = useMemo(() => ({ rutaId }), [rutaId])
  return { rutas, rutaId, cambiarRuta, params, error, cargando, reintentar }
}
