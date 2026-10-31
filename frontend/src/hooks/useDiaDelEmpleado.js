import { useEffect, useState } from 'react'
import api from '../services/api'
import { hoyEnCostaRica } from '../utils/fechaCR'

/** El día de un empleado (lo que era «Seguimiento de agentes»): qué día se mira y lo que hizo. Solo lecturas. */
export function useDiaDelEmpleado(usuarioId) {
  const [fecha, setFecha] = useState(hoyEnCostaRica())
  const [dia, setDia] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    api.get(`/empleados/${usuarioId}/dia`, { params: { fecha } })
      .then(({ data }) => { if (vivo) setDia(data.data) })
      .catch(e => { if (vivo) { setDia(null); setError(e.response?.data?.message || 'No se pudo consultar el día.') } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [usuarioId, fecha, revision])

  return { fecha, setFecha, dia, cargando, error, recargar: () => setRevision(n => n + 1) }
}
