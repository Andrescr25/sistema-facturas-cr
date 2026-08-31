import { useState } from 'react'
import { Check, X, Undo2, CircleDot } from 'lucide-react'

/**
 * Las dos caras de un producto dentro del checklist de bodega:
 *
 * - FilaPorRevisar: todavía no se decidió qué llegó o está respondiéndose.
 *   Ofrece las tres respuestas posibles en palabras (todo / nada / una parte).
 * - FilaRevisada: ya se decidió y confirmó. Colapsa a una línea que dice en palabras
 *   qué pasó, con opción de reabrir ("Deshacer").
 */

const ESTADO_UI = {
  completo: {
    key: 'completo',
    btnLabel: 'Llegó todo',
    Icon: Check,
    activeBtnClass: 'bg-exito-600 text-white border-exito-600 hover:bg-primario-900 font-semibold shadow-sm',
    rowTintClass: 'bg-exito-50/40 border-l-4 border-l-green-500'
  },
  no_llego: {
    key: 'no_llego',
    btnLabel: 'No llegó',
    Icon: X,
    activeBtnClass: 'bg-peligro-600 text-white border-peligro-600 hover:bg-peligro-700 font-semibold shadow-sm',
    rowTintClass: 'bg-peligro-50/40 border-l-4 border-l-red-500'
  },
  parcial: {
    key: 'parcial',
    btnLabel: 'Parte',
    Icon: CircleDot,
    activeBtnClass: 'bg-primario-600 text-white border-primario-600 hover:bg-primario-700 font-semibold shadow-sm',
    rowTintClass: 'bg-primario-50/40 border-l-4 border-l-blue-500'
  }
}

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
  const configActual = estadoSeleccionado ? ESTADO_UI[estadoSeleccionado] : null
  const rowTint = configActual ? configActual.rowTintClass : 'border-l-4 border-l-transparent hover:bg-neutro-50/60'

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
    <div className={`p-4 transition-colors ${rowTint}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Info del producto */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-neutro-900 truncate">{producto.nombre}</p>
            {entrega?.tieneAjuste && entrega.estado === 'parcial' && (
              <span className="text-xs font-bold bg-primario-100 text-primario-800 px-2 py-0.5 rounded-full whitespace-nowrap">
                Llegaron {entrega.cantidadEntregada} de {faltante}
              </span>
            )}
          </div>
          <p className="text-xs text-neutro-500 truncate mt-0.5">
            {producto.codigo}
            <span className={`ml-2 font-medium ${producto.tipo_faltante === 'total' ? 'text-peligro-600' : 'text-alerta-600'}`}>
              faltan {faltante}{producto.tipo_faltante === 'total' ? ' (todo)' : ''}
            </span>
          </p>
          {producto.observaciones && (
            <p className="text-xs text-alerta-600 mt-0.5 truncate">📝 {producto.observaciones}</p>
          )}
        </div>

        {/* Tres botones de respuesta */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {Object.values(ESTADO_UI).map(item => {
            const isSelected = estadoSeleccionado === item.key
            const IconComponent = item.Icon
            const btnClass = isSelected
              ? item.activeBtnClass
              : 'bg-white border-neutro-200 text-neutro-600 hover:bg-neutro-50 font-medium'

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleToggleEstado(item.key)}
                className={`flex items-center justify-center gap-1.5 h-10 px-3 border rounded-lg text-xs md:text-sm transition-all whitespace-nowrap ${btnClass}`}
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
        <div className="mt-3 flex flex-wrap items-center gap-2 bg-primario-50 border border-primario-200 rounded-lg p-3">
          <span className="text-sm font-medium text-primario-900 whitespace-nowrap">Llegaron</span>
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
          <span className="text-sm font-medium text-primario-900 whitespace-nowrap">de {faltante}</span>
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

const RESUELTO_CONFIG = {
  completo: {
    contenedor: 'bg-exito-50/60',
    icono: 'text-exito-600',
    texto: 'text-exito-800',
    Icono: Check,
    etiqueta: (producto) => `Llegó todo (${producto.cantidad_faltante})`
  },
  parcial: {
    contenedor: 'bg-primario-50/50',
    icono: 'text-primario-600',
    texto: 'text-primario-800',
    Icono: CircleDot,
    etiqueta: (producto, entrega) => `Llegaron ${entrega.cantidadEntregada} de ${producto.cantidad_faltante} — faltan ${entrega.cantidadAReducir}`
  },
  no_llego: {
    contenedor: 'bg-peligro-50/50',
    icono: 'text-peligro-600',
    texto: 'text-peligro-800',
    Icono: X,
    etiqueta: () => 'No llegó nada'
  }
}

export function FilaRevisada({ producto, productoKey, entrega, onDeshacer, onReabrirRevision }) {
  const cfg = RESUELTO_CONFIG[entrega.estado] || RESUELTO_CONFIG.completo
  const { Icono } = cfg
  const handleDeshacerAction = onReabrirRevision || onDeshacer

  return (
    <div className={`px-4 py-3 flex items-center gap-3 ${cfg.contenedor}`}>
      <Icono size={16} className={`${cfg.icono} flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutro-500 truncate line-through">{producto.nombre}</p>
        <p className={`text-xs font-medium ${cfg.texto}`}>{cfg.etiqueta(producto, entrega)}</p>
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
