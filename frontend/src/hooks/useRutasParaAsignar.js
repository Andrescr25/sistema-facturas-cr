import { useEffect, useState } from 'react'
import api from '../services/api'

/**
 * Las rutas que se le pueden asignar a un usuario en su ficha (2026-10-29,
 * el agente de ventas «se hará cargo de las rutas poco a poco»). Se piden solo
 * cuando la sección se muestra: quien no tiene Preventa no las necesita.
 */
export function useRutasParaAsignar(activo) {
  const [rutas, setRutas] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!activo) return
    let vivo = true
    setCargando(true)
    api.get('/preventa/rutas')
      .then(({ data }) => { if (vivo) { setRutas(data.data || []); setError('') } })
      .catch(e => { if (vivo) setError(e.response?.data?.message || 'No se pudieron consultar las rutas.') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [activo])

  return { rutas, cargando, error }
}
