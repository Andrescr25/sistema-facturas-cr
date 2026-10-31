import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'

const mensaje = (e, porDefecto) => e.response?.data?.message || porDefecto

/** «Empleados»: la lista con la quincena de cada uno, el alta y sus tarifas. */
export function useEmpleados() {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    api.get('/empleados')
      .then(({ data }) => { if (vivo) setLista(data.data || []) })
      .catch(e => { if (vivo) setError(mensaje(e, 'No se pudieron consultar los empleados.')) })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [revision])

  const usuariosSinFicha = useCallback(() => api.get('/empleados/usuarios').then(({ data }) => data.data || []), [])

  /** Sin `usuarioId` de una ficha que ya existe, da de alta. Lanza el mensaje del servidor. */
  const guardar = async (ficha, datos) => {
    try {
      const { data } = ficha ? await api.patch(`/empleados/${ficha.usuarioId}`, datos) : await api.post('/empleados', datos)
      setRevision(n => n + 1)
      return data.data
    } catch (e) {
      throw new Error(mensaje(e, 'No se pudo guardar el empleado.'))
    }
  }

  return { lista, cargando, error, recargar: () => setRevision(n => n + 1), usuariosSinFicha, guardar }
}
