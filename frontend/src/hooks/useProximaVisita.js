import { useState } from 'react'
import api from '../services/api'
import { tomarUbicacion } from '../services/ubicacionService'

/**
 * Guardar «Próxima visita» (F4 del agente): el motivo, la fecha y el GPS del
 * momento. Necesita señal: Preventa trabaja en línea.
 */
export function useProximaVisita() {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async ({ clienteId, motivo, proximaFecha, nota }) => {
    setGuardando(true); setError('')
    try {
      const ubicacion = await tomarUbicacion()
      const { data } = await api.post('/preventa/visitas', { clienteId, motivo, proximaFecha, nota, ubicacion })
      return data.data
    } catch (e) {
      setError(e.response?.data?.message || (navigator.onLine === false
        ? 'Sin señal: se necesita internet para guardar la próxima visita.'
        : 'No se pudo guardar la próxima visita.'))
      return null
    } finally {
      setGuardando(false)
    }
  }

  return { guardar, guardando, error }
}
