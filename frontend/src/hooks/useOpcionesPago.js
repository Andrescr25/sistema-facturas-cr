import { useEffect, useState } from 'react'
import { getOpcionesPago } from '../services/configuracionService'

export function useOpcionesPago() {
  const [metodos, setMetodos] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelado = false
    getOpcionesPago().then(r => { if (!cancelado) setMetodos(r.metodos) })
      .catch(() => { if (!cancelado) setError('No se pudieron cargar los métodos de pago. Cerrá y volvé a intentar.') })
    return () => { cancelado = true }
  }, [])
  return { metodos, error }
}
