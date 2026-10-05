import { useState, useEffect } from 'react'
import { usePortalCliente } from '../../contexts/PortalClienteContext'
import PanelPedido from './PanelPedido'
import PanelSugerencias from './PanelSugerencias'
import apiPortal from '../../services/apiPortal'
import { useModal } from '../../hooks/useModal'

/**
 * Coloca los dos paneles que salen al tocar "Ver pedido".
 *
 * ESCRITORIO: uno al lado del otro. El pedido manda (más ancho, fondo
 * blanco) y las sugerencias acompañan a la derecha, en gris, para que se lea
 * claro cuál es cuál.
 *
 * MÓVIL: no caben a la par, así que las sugerencias van como franja
 * horizontal ARRIBA de la hoja del pedido. Antes estaban adentro, entre los
 * productos y el total, y tapaban justo lo que el cliente quería revisar.
 *
 * El fondo oscuro y el cierre al tocar afuera viven acá y no en cada panel:
 * son dos paneles, pero una sola cosa que se abre y se cierra junta.
 *
 * POR QUÉ EL ENVÍO SE MANEJA ACÁ Y NO EN PanelPedido
 * El pedido enviado cambia a los DOS paneles: el de pedido pasa a mostrar la
 * confirmación y el de sugerencias tiene que desaparecer (ofrecerle "suele
 * faltar" al lado de un pedido ya enviado no lleva a ningún lado). Con el
 * estado adentro de PanelPedido, este componente no tenía forma de saberlo.
 */
export default function ModalPedido({ resumen, carrito, onCambiar, onAgregar, onVaciar, onCerrar, onEnviado, habituales, perdidos }) {
  useModal(onCerrar)
  const { cliente } = usePortalCliente()
  const [ciclos, setCiclos] = useState([])
  const [cicloId, setCicloId] = useState('')
  const [cargandoCiclos, setCargandoCiclos] = useState(true)
  const [errorCiclos, setErrorCiclos] = useState('')
  useEffect(() => {
    if (!cliente) { setCargandoCiclos(false); return }
    let vigente = true
    apiPortal.get('/portal/ciclos').then(({ data }) => {
      if (!vigente) return
      const disponibles = data.data || []
      setCiclos(disponibles)
      setCicloId(disponibles.length ? '' : 'sin-ciclo')
    }).catch(() => { if (vigente) setErrorCiclos('No pudimos consultar las semanas. Cerrá y abrí el pedido para reintentar.') })
      .finally(() => { if (vigente) setCargandoCiclos(false) })
    return () => { vigente = false }
  }, [cliente])
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(null)
  const [error, setError] = useState('')

  // La nota del pedido la escribe el cliente en PanelPedido, que la tiene
  // como estado propio, y llega acá como argumento al enviar. Así el input
  // sigue siendo controlado donde vive y este componente no se re-renderiza
  // en cada tecla.
  const enviar = async (observaciones) => {
    if (cargandoCiclos || errorCiclos || !cicloId) { setError('Seleccioná la ruta y semana del pedido.'); return }
    setEnviando(true)
    setError('')
    try {
      // No se mandan líneas: el pedido se arma con el carrito que ya está
      // guardado en el servidor. El navegador no participa en decidir qué se
      // pide ni a qué precio.
      const { data } = await apiPortal.post('/portal/pedidos', {
        observaciones: observaciones?.trim() || null,
        cicloId: cicloId === 'sin-ciclo' ? null : Number(cicloId)
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />

      <div className="relative w-full sm:w-auto flex flex-col sm:flex-row sm:items-start sm:gap-3">
        {/* En móvil el orden visual es: sugerencias arriba, pedido abajo.
            En escritorio se invierte con `sm:order-2` para que el pedido
            quede a la izquierda, que es donde se lo busca primero.
            Con el pedido ya enviado no se muestran. */}
        {onAgregar && !enviado && (
          <div className="sm:order-2">
            <PanelSugerencias habituales={habituales} perdidos={perdidos} onAgregar={onAgregar} carrito={carrito} />
          </div>
        )}

        <div className="sm:order-1">
          <PanelPedido
            ciclos={ciclos} cicloId={cicloId} setCicloId={setCicloId}
            cargandoCiclos={cargandoCiclos} errorCiclos={errorCiclos}
            resumen={resumen}
            onCambiar={onCambiar}
            onVaciar={onVaciar}
            onCerrar={onCerrar}
            enviando={enviando}
            enviado={enviado}
            error={error}
            onEnviar={enviar}
          />
        </div>
      </div>
    </div>
  )
}
