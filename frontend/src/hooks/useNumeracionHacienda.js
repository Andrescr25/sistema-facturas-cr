import { useEffect, useState } from 'react'
import { numeracion, fijarNumeracion, mensajeError } from '../integrations/hacienda/api'

/**
 * La numeración fiscal de un ambiente: con qué número sale el próximo
 * comprobante de cada tipo, y cambiarlo. El bloque que la dibuja
 * (components/configuracion/NumeracionHacienda.jsx) no habla con el servidor.
 *
 * Si el ambiente todavía no tiene sucursal y terminal no hay serie que
 * numerar: el servidor lo dice y acá queda como `error`, para que el bloque
 * lo repita en vez de quedar vacío.
 */
export default function useNumeracionHacienda(ambiente) {
  const [tipos, setTipos] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    let viva = true
    setTipos(null)
    setError('')
    setMensaje('')
    numeracion(ambiente)
      .then((t) => { if (viva) setTipos(t) })
      .catch((e) => { if (viva) setError(mensajeError(e)) })
    return () => { viva = false }
  }, [ambiente])

  /** Cambia el número de un tipo. Devuelve true si quedó hecho. */
  const cambiar = async (t, numero) => {
    setOcupado(true)
    setError('')
    setMensaje('')
    try {
      const nuevos = await fijarNumeracion(ambiente, t.tipo, numero)
      setTipos(nuevos)
      const ahora = nuevos.find((n) => n.tipo === t.tipo)
      setMensaje(`Listo: la próxima ${t.nombre.toLowerCase()} sale con el ${ahora?.proximo}.`)
      return true
    } catch (e) {
      setError(mensajeError(e))
      return false
    } finally {
      setOcupado(false)
    }
  }

  return { tipos, ocupado, error, mensaje, cambiar }
}
