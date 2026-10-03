import { useState } from 'react'
import { Check, X, Undo2, CircleDot } from 'lucide-react'

/**
 * Las dos caras de un producto dentro del checklist de bodega:
 *
 * - FilaPorRevisar: todavía no se decidió qué llegó o está respondiéndose.
 *   Ofrece las tres respuestas posibles en palabras (todo / nada / una parte).
 * - FilaRevisada: ya se decidió y confirmó. Colapsa a una línea que dice en palabras
 *   qué pasó, con opción de reabrir ("Deshacer").
 *
 * SIN COLORES POR ESTADO (pedido del usuario, 2026-10-01): cada respuesta
 * pintaba la fila de verde, rojo o azul con una línea a la izquierda, y el
 * botón elegido cambiaba de color al pasarle encima. En la tablet ese "pasar
 * encima" se queda pegado después del toque: "Llegó todo" quedaba casi negro
 * hasta tocar otra cosa. El color vive solo en el botón elegido (verde, rojo,
 * azul), lleno y sin sombra, y no cambia al pasarle encima.
 */

const ESTADO_UI = {
  completo: { key: 'completo', btnLabel: 'Llegó todo', Icon: Check, elegido: 'bg-exito-600 text-white border-exito-600 font-semibold' },
  no_llego: { key: 'no_llego', btnLabel: 'No llegó', Icon: X, elegido: 'bg-peligro-600 text-white border-peligro-600 font-semibold' },
  // primario-500, no 600: el 600 es azul marino y se lee casi negro.
  parcial: { key: 'parcial', btnLabel: 'Parte', Icon: CircleDot, elegido: 'bg-primario-500 text-white border-primario-500 font-semibold' }
}

const BOTON_LIBRE = 'bg-white border-neutro-200 text-neutro-700 hover:bg-neutro-50 font-medium'

export function FilaPorRevisar({
  producto,
  productoKey,
  entrega,
  onMarcarCompleto,
  onNoLlegoNada,
  onCantidadEntregadaChange,
  onQuitarRespuesta
}) {
  const [modoParcial, setModoParcial] = useState(false)
  const [cantidad, setCantidad] = useState('')

  const faltante = Number(producto.cantidad_faltante)
  const cantidadNum = Number.parseInt(cantidad, 10)
  const parcialValido = !Number.isNaN(cantidadNum) && cantidadNum > 0 && cantidadNum < faltante

  const estadoSeleccionado = entrega?.tieneAjuste ? entrega.estado : null

  const handleToggleEstado = (keyEstado) => {
    if (estadoSeleccionado === keyEstado) {
      if (onQuitarRespuesta) {
        onQuitarRespuesta(productoKey, producto)
      }
      setModoParcial(false)
    } else {
      if (keyEstado === 'completo') {
        setModoParcial(false)
        onMarcarCompleto(productoKey, producto)
      } else if (keyEstado === 'no_llego') {
        setModoParcial(false)
        onNoLlegoNada(productoKey, producto)
      } else if (keyEstado === 'parcial') {
        setModoParcial(true)
      }
    }
  }

  const guardarParcial = () => {
    if (!parcialValido) return
    onCantidadEntregadaChange(productoKey, cantidadNum, producto)
    setModoParcial(false)
    setCantidad('')
  }

  const cancelarParcial = () => {
    setModoParcial(false)
    setCantidad('')
  }

  return (
    <div className="p-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Info del producto */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-neutro-900 truncate">{producto.nombre}</p>
            {entrega?.tieneAjuste && entrega.estado === 'parcial' && (
              <span className="text-xs font-semibold bg-neutro-100 text-neutro-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                Llegaron {entrega.cantidadEntregada} de {faltante}
              </span>
            )}
          </div>
          <p className="text-xs text-neutro-500 truncate mt-0.5">
            {producto.codigo}
            <span className="ml-2 font-medium text-neutro-700">
              faltan {faltante}{producto.tipo_faltante === 'total' ? ' (todo)' : ''}
            </span>
          </p>
          {producto.observaciones && (
            <p className="text-xs text-neutro-600 mt-0.5 truncate">📝 {producto.observaciones}</p>
          )}
        </div>

        {/* Tres botones de respuesta */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {Object.values(ESTADO_UI).map(item => {
            const isSelected = estadoSeleccionado === item.key
            const IconComponent = item.Icon
            const btnClass = isSelected ? item.elegido : BOTON_LIBRE

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleToggleEstado(item.key)}
                className={`flex items-center justify-center gap-1.5 h-10 px-3 border rounded-lg text-xs md:text-sm whitespace-nowrap ${btnClass}`}
              >
                <IconComponent size={15} />
                <span>{item.btnLabel}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Subpanel numérico de "Parte" */}
      {modoParcial && (
        <div className="mt-3 flex flex-wrap items-center gap-2 bg-neutro-50 border border-neutro-200 rounded-lg p-3">
          <span className="text-sm font-medium text-neutro-800 whitespace-nowrap">Llegaron</span>
          <input
            type="number"
            min="1"
            max={faltante - 1}
            value={cantidad}
            autoFocus
            onChange={(e) => setCantidad(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') guardarParcial()
              if (e.key === 'Escape') cancelarParcial()
            }}
            className="input w-20 py-1 font-bold text-center"
            placeholder="0"
          />
          <span className="text-sm font-medium text-neutro-800 whitespace-nowrap">de {faltante}</span>
          <button
            type="button"
            onClick={guardarParcial}
            disabled={!parcialValido}
            className="btn btn-sm bg-primario-600 text-white border-primario-600 hover:bg-primario-700 disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
          >
            Guardar
          </button>
          <button type="button" onClick={cancelarParcial} className="btn btn-sm btn-outline">
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

// Lo ya revisado se dice en palabras; el ícono acompaña, sin colores por estado.
const RESUELTO_CONFIG = {
  completo: {
    Icono: Check,
    etiqueta: (producto) => `Llegó todo (${producto.cantidad_faltante})`
  },
  parcial: {
    Icono: CircleDot,
    etiqueta: (producto, entrega) => `Llegaron ${entrega.cantidadEntregada} de ${producto.cantidad_faltante} — faltan ${entrega.cantidadAReducir}`
  },
  no_llego: {
    Icono: X,
    etiqueta: () => 'No llegó nada'
  }
}

export function FilaRevisada({ producto, productoKey, entrega, onDeshacer, onReabrirRevision }) {
  const cfg = RESUELTO_CONFIG[entrega.estado] || RESUELTO_CONFIG.completo
  const { Icono } = cfg
  const handleDeshacerAction = onReabrirRevision || onDeshacer

  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <Icono size={16} className="text-neutro-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutro-500 truncate line-through">{producto.nombre}</p>
        <p className="text-xs font-medium text-neutro-700">{cfg.etiqueta(producto, entrega)}</p>
      </div>
      <button
        type="button"
        onClick={() => handleDeshacerAction && handleDeshacerAction(productoKey, producto)}
        className="btn btn-sm btn-outline text-neutro-600 whitespace-nowrap flex-shrink-0"
      >
        <Undo2 size={13} className="mr-1" /> Deshacer
      </button>
    </div>
  )
}
