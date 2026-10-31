import { useState } from 'react'
import api from '../services/api'

/** «Cliente nuevo» desde Preventa (2026-10-30): queda en la ruta y a nombre de quien lo registra. */
export function useClienteNuevo() {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async (datos) => {
    setGuardando(true); setError('')
    try {
      const { data } = await api.post('/preventa/clientes', datos)
      return data.data
    } catch (e) {
      setError(e.response?.data?.message || (navigator.onLine === false
        ? 'Sin señal: se necesita internet para registrar el cliente.'
        : 'No se pudo registrar el cliente.'))
      return null
    } finally {
      setGuardando(false)
    }
  }

  return { guardar, guardando, error }
}
