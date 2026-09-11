import { useState, useEffect, useCallback } from 'react'
import { useToast } from './useToast'
import { configuracionService, mensajeDeError } from '../services/configuracionService'
import { catalogoPorClave } from '../components/configuracion/catalogos'

/**
 * Estado de la pantalla de Configuración.
 *
 * Después de cada cambio se pone la fila que devuelve el servidor, no la que
 * se tipeó: si el servidor limpió algo (una cédula con guiones, espacios de
 * más) la pantalla muestra lo que de verdad quedó guardado.
 */
export function useConfiguracion() {
  const { toasts, showToast, removeToast } = useToast()
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setDatos(await configuracionService.obtener())
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudo cargar la configuración.'))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const guardarEmpresa = useCallback(async (cambios) => {
    setGuardando(true)
    try {
      const empresa = await configuracionService.actualizarEmpresa(cambios)
      setDatos(d => ({ ...d, empresa }))
      showToast('Datos de la empresa guardados.', 'success')
      return true
    } catch (e) {
      showToast(mensajeDeError(e, 'No se guardaron los datos de la empresa.'), 'error')
      return false
    } finally {
      setGuardando(false)
    }
  }, [showToast])

  const ponerFila = useCallback((clave, fila) => {
    const { datos: llave } = catalogoPorClave(clave)
    setDatos(d => {
      const lista = d[llave] || []
      const existe = lista.some(f => f.id === fila.id)
      return { ...d, [llave]: existe ? lista.map(f => (f.id === fila.id ? fila : f)) : [...lista, fila] }
    })
  }, [])

  const guardarElemento = useCallback(async (clave, id, valores) => {
    setGuardando(true)
    try {
      const fila = id
        ? await configuracionService.editar(clave, id, valores)
        : await configuracionService.crear(clave, valores)
      ponerFila(clave, fila)
      showToast(id ? `Se guardó "${fila.nombre}".` : `Se agregó "${fila.nombre}".`, 'success')
      return true
    } catch (e) {
      showToast(mensajeDeError(e, 'No se guardó el cambio.'), 'error')
      return false
    } finally {
      setGuardando(false)
    }
  }, [ponerFila, showToast])

  const cambiarActivo = useCallback(async (clave, fila) => {
    setGuardando(true)
    try {
      const nueva = await configuracionService.cambiarActivo(clave, fila.id, !fila.activo)
      ponerFila(clave, nueva)
      showToast(nueva.activo
        ? `"${fila.nombre}" vuelve a aparecer en las listas.`
        : `"${fila.nombre}" ya no aparece en las listas. Las facturas viejas lo siguen mostrando.`, 'success')
    } catch (e) {
      showToast(mensajeDeError(e, 'No se pudo cambiar el estado.'), 'error')
    } finally {
      setGuardando(false)
    }
  }, [ponerFila, showToast])

  return {
    datos, cargando, error, guardando, cargar,
    guardarEmpresa, guardarElemento, cambiarActivo,
    showToast, toasts, removeToast
  }
}
