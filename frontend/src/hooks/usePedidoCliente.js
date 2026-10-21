import { useState } from 'react'
import apiPortal from '../services/apiPortal'

export function usePedidoCliente(onEnviado) {
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(null)
  const [error, setError] = useState('')

  // La nota del pedido la escribe el cliente en PanelPedido, que la tiene
  // como estado propio, y llega acá como argumento al enviar. Así el input
  // sigue siendo controlado donde vive y este componente no se re-renderiza
  // en cada tecla.
  const enviar = async (observaciones) => {
    
    setEnviando(true)
    setError('')
    try {
      // No se mandan líneas: el pedido se arma con el carrito que ya está
      // guardado en el servidor. El navegador no participa en decidir qué se
      // pide ni a qué precio.
      const { data } = await apiPortal.post('/portal/pedidos', {
        observaciones: observaciones?.trim() || null
      })
      setEnviado(data.data)
      // Vacía el carrito. El modal NO se desmonta por eso: la condición que
      // lo renderiza ya no mira las unidades del carrito (ver
      // CatalogoClientes.jsx) — antes sí, y por eso esta confirmación nunca
      // llegaba a verse.
      onEnviado?.()
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar el pedido. Intentá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return { enviando, enviado, error, enviar }
}
