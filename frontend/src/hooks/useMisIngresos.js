import { useEffect, useState } from 'react'
import api from '../services/api'

/** «Mis ingresos»: la quincena que se mira (la que corre, si no se elige otra) y lo de ella. */
export function useMisIngresos() {
  const [periodo, setPeriodo] = useState('')
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    api.get('/ingresos', { params: periodo ? { periodo } : {} })
      .then(({ data }) => { if (vivo) setDatos(data.data) })
      .catch(e => { if (vivo) { setDatos(null); setError(e.response?.data?.message || 'No se pudieron consultar tus ingresos.') } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [periodo, revision])

  return { datos, periodo, setPeriodo, cargando, error, recargar: () => setRevision(n => n + 1) }
}
