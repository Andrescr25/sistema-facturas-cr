import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import { moverEn } from '../utils/planDelDia'

const mensaje = (e, porDefecto) => e.response?.data?.message || (navigator.onLine === false ? 'Sin señal: se necesita internet para cambiar tu día.' : porDefecto)

/**
 * «Mi día» (2026-11-01): el plan de visitas de hoy de quien está en sesión. Se
 * arma solo la primera vez del día; agregar, quitar y ordenar lo guardan en el
 * sistema (si cambia de teléfono, sigue igual). Mover se ve al instante y se
 * guarda detrás; si no se pudo, se vuelve a leer.
 */
export function usePlanDelDia() {
  const [plan, setPlan] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const recargar = useCallback(() => {
    setCargando(true)
    return api.get('/preventa/plan')
      .then(({ data }) => { setPlan(data.data); setError('') })
      .catch(e => setError(mensaje(e, 'No se pudo consultar tu día.')))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    recargar()
    // Al volver a la pestaña (de Facturación, de otra app): lo que visitó, al día.
    const alVolver = () => { if (!document.hidden) recargar() }
    window.addEventListener('focus', alVolver)
    return () => window.removeEventListener('focus', alVolver)
  }, [recargar])

  const enviar = async (llamada, porDefecto) => {
    setGuardando(true); setError('')
    try {
      const { data } = await llamada()
      setPlan(data.data)
      return true
    } catch (e) {
      setError(mensaje(e, porDefecto))
      recargar()
      return false
    } finally {
      setGuardando(false)
    }
  }

  const mover = (desde, hasta) => {
    const clientes = moverEn(plan.clientes, desde, hasta)
    if (clientes === plan.clientes) return
    setPlan(p => ({ ...p, clientes }))
    enviar(() => api.put('/preventa/plan/orden', { clienteIds: clientes.map(x => x.cliente.id) }), 'No se pudo guardar el orden.')
  }
  const agregar = (clienteIds) => enviar(() => api.post('/preventa/plan/clientes', { clienteIds }), 'No se pudieron agregar.')
  const quitar = (clienteId) => enviar(() => api.delete(`/preventa/plan/clientes/${clienteId}`), 'No se pudo quitar.')

  return { plan, cargando, guardando, error, recargar, mover, agregar, quitar }
}
