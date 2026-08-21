import PanelPedido from './PanelPedido'
import PanelSugerencias from './PanelSugerencias'

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
 */
export default function ModalPedido({ resumen, carrito, onCambiar, onAgregar, onVaciar, onCerrar, onEnviado, habituales, perdidos }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />

      <div className="relative w-full sm:w-auto flex flex-col sm:flex-row sm:items-start sm:gap-3">
        {/* En móvil el orden visual es: sugerencias arriba, pedido abajo.
            En escritorio se invierte con `sm:order-2` para que el pedido
            quede a la izquierda, que es donde se lo busca primero. */}
        {onAgregar && (
          <div className="sm:order-2">
            <PanelSugerencias habituales={habituales} perdidos={perdidos} onAgregar={onAgregar} carrito={carrito} />
          </div>
        )}

        <div className="sm:order-1">
          <PanelPedido
            resumen={resumen}
            onCambiar={onCambiar}
            onVaciar={onVaciar}
            onCerrar={onCerrar}
            onEnviado={onEnviado}
          />
        </div>
      </div>
    </div>
  )
}
