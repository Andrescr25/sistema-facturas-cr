import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import { tomarUbicacion } from '../services/ubicacionService'

/**
 * La jornada del empleado (2026-10-30): si está abierta y desde cuándo, y
 * «Iniciar» / «Terminar jornada» con el GPS del momento. La hora la pone el
 * servidor. Lo usan «Mis ingresos» y el recordatorio de Preventa.
 */
export function useJornada({ onCambio } = {}) {
  const [estado, setEstado] = useState(null)
  const [marcando, setMarcando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(() => api.get('/ingresos/jornada')
    .then(({ data }) => setEstado(data.data))
    .catch(e => setError(e.response?.data?.message || 'No se pudo consultar la jornada.')), [])

  useEffect(() => { cargar() }, [cargar])

  const marcar = async (accion) => {
    setMarcando(true); setError('')
    try {
      const ubicacion = await tomarUbicacion()
      await api.post(`/ingresos/jornada/${accion}`, { ubicacion })
      await cargar()
      onCambio?.()
    } catch (e) {
      setError(e.response?.data?.message || (navigator.onLine === false
        ? 'Sin señal: se necesita internet para marcar la jornada.'
        : 'No se pudo marcar la jornada.'))
      await cargar()
    } finally {
      setMarcando(false)
    }
  }

  return { estado, marcando, error, iniciar: () => marcar('iniciar'), terminar: () => marcar('terminar') }
}
