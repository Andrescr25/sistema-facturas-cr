import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'

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

  const crear = useCallback((datos) =>
    accion('nuevo', () => api.post('/usuarios', datos)), [accion])

  const actualizar = useCallback((id, cambios) =>
    accion(id, async () => {
      const { data } = await api.put(`/usuarios/${id}`, cambios)
      actualizarUsuario(data.data)
    }), [accion, actualizarUsuario])

  const restablecerPassword = useCallback((id, password) =>
    accion(id, () => api.post(`/usuarios/${id}/password`, { password })), [accion])

  const eliminar = useCallback((id) =>
    accion(id, () => api.delete(`/usuarios/${id}`)), [accion])

  return {
    usuarios, cargando, error, guardando, setError,
    crear, actualizar, restablecerPassword, eliminar, recargar: cargar
  }
}
