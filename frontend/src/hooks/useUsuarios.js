import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { cambioDePlanilla } from '../utils/planillaUsuario'

/**
 * Los usuarios del sistema y sus permisos.
 *
 * Todas las llamadas exigen ser administrador; el backend lo hace valer
 * (requirePermiso sobre /usuarios). Acá no se comprueba nada: si alguien
 * llegara a esta pantalla sin serlo, vería errores 403, no datos.
 */
export function useUsuarios() {
  const { actualizarUsuario } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(null)

  const cargar = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get('/usuarios')
      setUsuarios(data.data)
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudieron cargar los usuarios.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  /** Envuelve una acción: marca cuál fila está ocupada y recarga al terminar. */
  const accion = useCallback(async (id, fn) => {
    setGuardando(id)
    setError('')
    try {
      await fn()
      await cargar()
      return true
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar el cambio.')
      return false
    } finally {
      setGuardando(null)
    }
  }, [cargar])

  /**
   * Después de guardar el usuario, su ficha de Empleados: alta, cambio o
   * desactivarla (la historia de horas y pagos queda). `anterior`: la que tenía.
   */
  const guardarPlanilla = async (usuarioId, planilla, anterior) => {
    const cambio = planilla ? cambioDePlanilla(planilla, anterior) : null
    if (!cambio) return
    if (cambio.accion === 'crear') await api.post('/empleados', { usuarioId, ...cambio.datos })
    else await api.patch(`/empleados/${usuarioId}`, cambio.datos)
  }

  const crear = useCallback((datos, planilla) =>
    accion('nuevo', async () => {
      const { data } = await api.post('/usuarios', datos)
      await guardarPlanilla(data.data.id, planilla, null)
    }), [accion])

  const actualizar = useCallback((id, cambios, planilla) =>
    accion(id, async () => {
      const { data } = await api.put(`/usuarios/${id}`, cambios)
      actualizarUsuario(data.data)
      await guardarPlanilla(id, planilla, usuarios.find(u => u.id === id)?.planilla)
    }), [accion, actualizarUsuario, usuarios])

  const restablecerPassword = useCallback((id, password) =>
    accion(id, () => api.post(`/usuarios/${id}/password`, { password })), [accion])

  const eliminar = useCallback((id) =>
    accion(id, () => api.delete(`/usuarios/${id}`)), [accion])

  return {
    usuarios, cargando, error, guardando, setError,
    crear, actualizar, restablecerPassword, eliminar, recargar: cargar
  }
}
