import { useState } from 'react'
import api from '../services/api'

/**
 * Corregir la rotación o la ubicación de un cliente desde la visita (2026-10-29).
 * El servidor lo deja solo en clientes de las rutas del agente y lo anota en la
 * bitácora. Necesita señal.
 */
export function useFichaDesdeVisita() {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async (clienteId, cambios) => {
    setGuardando(true); setError('')
    try {
      const { data } = await api.patch(`/preventa/clientes/${clienteId}`, cambios)
      return data.data
    } catch (e) {
      setError(e.response?.data?.message || (navigator.onLine === false ? 'Sin señal: se necesita internet para guardar.' : 'No se pudo guardar.'))
      return null
    } finally {
      setGuardando(false)
    }
  }

  return { guardar, guardando, error }
}
