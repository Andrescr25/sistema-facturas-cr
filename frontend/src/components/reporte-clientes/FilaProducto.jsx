import { useState } from 'react'
import { Check, X, Undo2, CircleDot } from 'lucide-react'

/**
 * Las dos caras de un producto dentro del checklist de bodega:
 *
 * - FilaPorRevisar: todavía no se decidió qué llegó. Ofrece las tres
 *   respuestas posibles en palabras (todo / nada / una parte).
 * - FilaRevisada: ya se decidió. Colapsa a una línea que dice en palabras
 *   qué pasó, con opción de deshacer.
 */

export function FilaPorRevisar({
  producto,
  productoKey,
  onMarcarCompleto,
  onNoLlegoNada,
  onCantidadEntregadaChange
}) {
  const [modoParcial, setModoParcial] = useState(false)
  const [cantidad, setCantidad] = useState('')

  const faltante = Number(producto.cantidad_faltante)
  const cantidadNum = Number.parseInt(cantidad, 10)
  const parcialValido = !Number.isNaN(cantidadNum) && cantidadNum > 0 && cantidadNum < faltante

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
    <div className="p-4 transition-colors hover:bg-gray-50/60">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{producto.nombre}</p>
          <p className="text-xs text-gray-500 truncate">
            {producto.codigo}
            <span className={`ml-2 font-medium ${producto.tipo_faltante === 'total' ? 'text-red-600' : 'text-amber-600'}`}>
              faltan {faltante}{producto.tipo_faltante === 'total' ? ' (todo)' : ''}
            </span>
          </p>
          {producto.observaciones && (
            <p className="text-xs text-orange-600 mt-0.5 truncate">📝 {producto.observaciones}</p>
          )}
        </div>

        {!modoParcial ? (
          <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0">
            <button
              onClick={() => onMarcarCompleto(productoKey, producto)}
              className="btn btn-sm bg-green-600 text-white border-green-600 hover:bg-green-700 whitespace-nowrap"
            >
              <Check size={14} className="mr-1" /> Llegó todo
            </button>
            <button
              onClick={() => onNoLlegoNada(productoKey, producto)}
              className="btn btn-sm bg-white text-red-700 border-red-300 hover:bg-red-50 whitespace-nowrap"
            >
              <X size={14} className="mr-1" /> No llegó
            </button>
            <button
              onClick={() => setModoParcial(true)}
              className="btn btn-sm bg-white text-blue-700 border-blue-300 hover:bg-blue-50 whitespace-nowrap"
            >
              <CircleDot size={14} className="mr-1" /> Parte
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <span className="text-sm text-blue-900 whitespace-nowrap">Llegaron</span>
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
              className="input w-20 py-1"
              placeholder="0"
            />
            <span className="text-sm text-blue-900 whitespace-nowrap">de {faltante}</span>
            <button
              onClick={guardarParcial}
              disabled={!parcialValido}
              className="btn btn-sm bg-blue-600 text-white border-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Guardar
            </button>
            <button onClick={cancelarParcial} className="btn btn-sm btn-outline">
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const RESUELTO_CONFIG = {
  completo: {
    contenedor: 'bg-green-50/60',
    icono: 'text-green-600',
    texto: 'text-green-800',
    Icono: Check,
    etiqueta: (producto) => `Llegó todo (${producto.cantidad_faltante})`
  },
  parcial: {
    contenedor: 'bg-blue-50/50',
    icono: 'text-blue-600',
    texto: 'text-blue-800',
    Icono: CircleDot,
    etiqueta: (producto, entrega) => `Llegaron ${entrega.cantidadEntregada} de ${producto.cantidad_faltante} — faltan ${entrega.cantidadAReducir}`
  },
  no_llego: {
    contenedor: 'bg-red-50/50',
    icono: 'text-red-600',
    texto: 'text-red-800',
    Icono: X,
    etiqueta: () => 'No llegó nada'
  }
}

export function FilaRevisada({ producto, productoKey, entrega, onDeshacer }) {
  const cfg = RESUELTO_CONFIG[entrega.estado] || RESUELTO_CONFIG.completo
  const { Icono } = cfg

  return (
    <div className={`px-4 py-3 flex items-center gap-3 ${cfg.contenedor}`}>
      <Icono size={16} className={`${cfg.icono} flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-500 truncate line-through">{producto.nombre}</p>
        <p className={`text-xs font-medium ${cfg.texto}`}>{cfg.etiqueta(producto, entrega)}</p>
      </div>
      <button
        onClick={() => onDeshacer(productoKey, producto)}
        className="btn btn-sm btn-outline text-gray-600 whitespace-nowrap flex-shrink-0"
      >
        <Undo2 size={13} className="mr-1" /> Deshacer
      </button>
    </div>
  )
}
