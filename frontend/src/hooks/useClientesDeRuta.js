import { useEffect, useState } from 'react'
import api from '../services/api'

/** Los clientes de una ruta, como los da la agenda (para elegir a quién agregar a «Mi día»). */
export function useClientesDeRuta(rutaId) {
  const [clientes, setClientes] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!rutaId) return
    let vivo = true
    setClientes(null); setError('')
    api.get('/preventa/agenda', { params: { rutaId } })
      .then(({ data }) => { if (vivo) setClientes(data.data.clientes) })
      .catch(e => { if (vivo) { setClientes([]); setError(e.response?.data?.message || 'No se pudo consultar la ruta.') } })
    return () => { vivo = false }
  }, [rutaId])

  return { clientes, error }
}
