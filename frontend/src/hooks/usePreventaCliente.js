import { useEffect, useState } from 'react'
import apiPortal from '../services/apiPortal'

export function usePreventaCliente(cliente, token) {
  const [resultado, setResultado] = useState(null)
  useEffect(() => {
    setResultado(null)
    if (!cliente || token === null) return
    let vigente = true
    apiPortal.get('/portal/preventa', { params: { token } })
      .then(({ data }) => { if (vigente) setResultado({ clienteId: cliente.id, token, ciclo: data.data }) })
      .catch(e => { if (vigente) setResultado({ clienteId: cliente.id, token,
        error: e.response?.data?.message || 'No pudimos comprobar la semana del enlace. Volvé a abrirlo para reintentar.' }) })
    return () => { vigente = false }
  }, [cliente, token])
  // No reutilizar una respuesta del cliente anterior, ni por un fotograma.
  const actual = resultado?.clienteId === cliente?.id && resultado?.token === token ? resultado : null
  return { ciclo: actual?.ciclo, error: actual?.error, cargando: Boolean(cliente && token !== null && !actual) }
}
