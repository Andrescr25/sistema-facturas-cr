import { useEffect, useState } from 'react'
import api from '../services/api'
import { hoyEnCostaRica } from '../utils/fechaCR'

/**
 * Seguimiento del agente (F5): a quién y qué día se mira, y lo que hizo.
 * Solo lecturas. Con un solo agente, entra directo a él.
 */
export function useSeguimientoAgente() {
  const [agentes, setAgentes] = useState([])
  const [agenteId, setAgenteId] = useState('')
  const [fecha, setFecha] = useState(hoyEnCostaRica())
  const [dia, setDia] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let vivo = true
    api.get('/seguimiento/agentes')
      .then(({ data }) => {
        if (!vivo) return
        const lista = data.data || []
        setAgentes(lista)
        if (lista.length === 1) setAgenteId(actual => actual || String(lista[0].id))
      })
      .catch(e => { if (vivo) setError(e.response?.data?.message || 'No se pudieron consultar los agentes.') })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (!agenteId) { setDia(null); return }
    let vivo = true
    setCargando(true); setError('')
    api.get('/seguimiento/dia', { params: { usuarioId: agenteId, fecha } })
      .then(({ data }) => { if (vivo) setDia(data.data) })
      .catch(e => { if (vivo) { setDia(null); setError(e.response?.data?.message || 'No se pudo consultar el día.') } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [agenteId, fecha, revision])

  return { agentes, agenteId, setAgenteId, fecha, setFecha, dia, cargando, error, recargar: () => setRevision(n => n + 1) }
}
