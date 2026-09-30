import { useCallback, useEffect, useRef, useState } from 'react'
import { getEstadoWhatsApp, vincularWhatsApp, desvincularWhatsApp } from '../services/whatsappConexionService'

// Mientras se vincula (el QR se renueva cada ~20 s), se pregunta seguido; el
// resto del tiempo, de vez en cuando.
const CADA_MS_VINCULANDO = 3000
const CADA_MS_NORMAL = 20000

/**
 * La conexión de WhatsApp del sistema, para la sección de Configuración.
 * `vinculando` es 'qr', 'codigo' o null.
 */
export function useWhatsAppConexion() {
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState(null)
  const [vinculando, setVinculando] = useState(null)
  const [codigo, setCodigo] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const temporizador = useRef(null)

  const cargar = useCallback(async () => {
    try {
      const e = await getEstadoWhatsApp()
      setEstado(e)
      if (e.conectado) { setVinculando(null); setCodigo(null) }
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
      if (vivo) temporizador.current = setTimeout(vuelta, vinculando ? CADA_MS_VINCULANDO : CADA_MS_NORMAL)
    }
    vuelta()
    return () => { vivo = false; clearTimeout(temporizador.current) }
  }, [cargar, vinculando])

  const empezar = async (pedido) => {
    setOcupado(true)
    setError(null)
    try {
      const r = await vincularWhatsApp(pedido)
      if (pedido.modo === 'codigo') setCodigo(r)
      setVinculando(pedido.modo)
      await cargar()
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo empezar a vincular.')
    } finally {
      setOcupado(false)
    }
  }

  const desvincular = async () => {
    setOcupado(true)
    setError(null)
    try {
      await desvincularWhatsApp()
      setVinculando(null)
      setCodigo(null)
      await cargar()
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo desvincular.')
    } finally {
      setOcupado(false)
    }
  }

  return {
    estado, error, vinculando, codigo, ocupado, desvincular,
    vincularConQr: () => empezar({ modo: 'qr' }),
    vincularConCodigo: (telefono) => empezar({ modo: 'codigo', telefono }),
    cancelar: () => { setVinculando(null); setCodigo(null) }
  }
}
