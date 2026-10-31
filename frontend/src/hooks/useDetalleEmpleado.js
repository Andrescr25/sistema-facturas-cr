import { useEffect, useState } from 'react'
import api from '../services/api'

/** Un empleado en «Empleados»: su quincena, su jornada y las correcciones de sus tramos. */
export function useDetalleEmpleado(usuarioId) {
  const [periodo, setPeriodo] = useState('')
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    api.get(`/empleados/${usuarioId}`, { params: periodo ? { periodo } : {} })
      .then(({ data }) => { if (vivo) setDatos(data.data) })
      .catch(e => { if (vivo) { setDatos(null); setError(e.response?.data?.message || 'No se pudo consultar el empleado.') } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [usuarioId, periodo, revision])

  /** Corrige o anula un tramo (`jornadaId`), o agrega uno que no se marcó. Lanza el mensaje del servidor. */
  const guardarJornada = async ({ jornadaId, ...cambios }) => {
    try {
      const { data } = jornadaId
        ? await api.patch(`/empleados/jornadas/${jornadaId}`, cambios)
        : await api.post(`/empleados/${usuarioId}/jornadas`, cambios)
      setRevision(n => n + 1)
      return data.data
    } catch (e) {
      throw new Error(e.response?.data?.message || 'No se pudo guardar la jornada.')
    }
  }

  const enviar = async (llamar, porDefecto) => {
    try {
      const { data } = await llamar()
      setRevision(n => n + 1)
      return data.data
    } catch (e) {
      throw new Error(e.response?.data?.message || porDefecto)
    }
  }
  // Los montos los calcula el servidor: la pantalla solo dice qué se paga y cómo.
  const pagarQuincena = (periodoQuePaga, medio) => enviar(() => api.post(`/empleados/${usuarioId}/pagos/quincena`, { periodo: periodoQuePaga, ...medio }), 'No se pudo registrar el pago.')
  const pagarGasolina = (fechas, medio) => enviar(() => api.post(`/empleados/${usuarioId}/pagos/gasolina`, { fechas, ...medio }), 'No se pudo registrar el pago.')
  const anularPago = (pagoId, motivo) => enviar(() => api.patch(`/empleados/pagos/${pagoId}/anular`, { motivo }), 'No se pudo anular el pago.')

  return { datos, periodo, setPeriodo, cargando, error, recargar: () => setRevision(n => n + 1), guardarJornada, pagarQuincena, pagarGasolina, anularPago }
}
