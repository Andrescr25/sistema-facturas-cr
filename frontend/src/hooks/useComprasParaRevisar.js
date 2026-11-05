import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'

/**
 * Las compras registradas con alguna línea que no cuadra (2026-11-05): sin
 * producto, o con la relación o lo que muestra Revisión de Precios distinto
 * de lo que quedó en la compra. Se lee cada vez que se abre la pestaña.
 */
export function useComprasParaRevisar() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get('/compras/para-revisar')
      setDatos(data.data)
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo cargar la lista para revisar.')
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])
  return { datos, error, recargar: cargar }
}
