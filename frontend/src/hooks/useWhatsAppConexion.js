import { useCallback, useEffect, useRef, useState } from 'react'
import { getEstadoWhatsApp, vincularWhatsApp, desvincularWhatsApp } from '../services/whatsappConexionService'

// Mientras se espera que escriban el código en el teléfono, se pregunta seguido;
// el resto del tiempo, de vez en cuando.
const CADA_MS_ESPERANDO = 3000
const CADA_MS_NORMAL = 20000

/**
 * La conexión de WhatsApp del sistema, para la sección de Configuración.
 */
export function useWhatsAppConexion() {
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState(null)
  const [codigo, setCodigo] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const temporizador = useRef(null)

  const cargar = useCallback(async () => {
    try {
      const e = await getEstadoWhatsApp()
      setEstado(e)
      if (e.conectado) setCodigo(null)
      return e
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo consultar WhatsApp.')
      return null
    }
  }, [])

  useEffect(() => {
    let vivo = true
    const vuelta = async () => {
      await cargar()
      if (vivo) temporizador.current = setTimeout(vuelta, codigo ? CADA_MS_ESPERANDO : CADA_MS_NORMAL)
    }
    vuelta()
    return () => { vivo = false; clearTimeout(temporizador.current) }
  }, [cargar, codigo])

  const vincular = async (telefono) => {
    setOcupado(true)
    setError(null)
    try {
      const r = await vincularWhatsApp(telefono)
      setCodigo(r)
      await cargar()
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo obtener el código.')
    } finally {
      setOcupado(false)
    }
  }

  const desvincular = async () => {
    setOcupado(true)
    setError(null)
    try {
      await desvincularWhatsApp()
      setCodigo(null)
      await cargar()
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo desvincular.')
    } finally {
      setOcupado(false)
    }
  }

  return { estado, error, codigo, ocupado, vincular, desvincular, cancelarCodigo: () => setCodigo(null) }
}
