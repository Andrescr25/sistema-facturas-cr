import { AlertTriangle, Check, ImageIcon, Minus, Plus, X } from 'lucide-react'

/**
 * Tarjeta de un producto de la factura, con los botones rápidos
 * Completo/Faltó Todo/Parcial y el ajuste de cantidad. Extraído de
 * FacturasBodega.jsx (era el cuerpo del .map de items en renderDetalle).
 */
export default function ItemFaltanteCard({
  item,
  draft,
  cantidadFactura,
  onMarcarModo,
  onCambiarCantidad,
  onCambiarObservacion,
  onVerImagen,
  // Mientras se carga lo ya registrado (o se guarda), los botones quedan
  // quietos: lo que se tocara ahí lo pisaría lo que llega.
  deshabilitado = false
}) {
  const esCompleto = draft?.tipo === 'ninguno' || draft?.tipo === 'completo'
  const esTotal = draft?.tipo === 'total'
  const esParcial = draft?.tipo === 'parcial'

  return (
    <div
      className={`bg-white border rounded-3xl p-5 shadow-sm transition space-y-4 ${esCompleto
        ? 'border-exito-100 bg-exito-50/20'
        : esTotal
          ? 'border-alerta-100 bg-alerta-50/10'
          : esParcial
            ? 'border-primario-100 bg-primario-50/10'
            : 'border-neutro-100'
        }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1">
          {/* El nombre baja de renglón sin empujar el botón de la foto, que
              tiene 40×40 para el dedo (medía 23×23). */}
          <div className="flex items-start justify-between gap-2">
            <h4 className="min-w-0 break-words text-base font-bold leading-tight text-neutro-900">
              {item.nombre || item.name}
            </h4>
            <button
              type="button"
              onClick={onVerImagen}
              aria-label={`Ver foto de ${item.nombre || item.name}`}
              className="-mr-2 -mt-2 shrink-0 rounded-lg p-2.5 text-neutro-400 transition-colors hover:bg-primario-50 hover:text-primario-600"
            >
              <ImageIcon size={18} />
            </button>
          </div>
          <p className="text-sm font-semibold text-neutro-600">
            Cantidad a despachar: {cantidadFactura}
          </p>
          <p className="break-all text-xs text-neutro-400">Referencia: {draft?.referencia || 'N/A'}</p>
          {(item.descripcion || item.description) && (
            <div className="mt-3 bg-alerta-50 border-2 border-alerta-200 text-alerta-900 rounded-2xl p-3 shadow-sm flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-alerta-700">
                <AlertTriangle size={15} strokeWidth={2.5} />
                <span className="text-[10px] font-extrabold uppercase tracking-wider">
                  Nota adicional / Detalle
                </span>
              </div>
              <p className="text-xs font-semibold leading-relaxed text-alerta-950 whitespace-pre-wrap">
                {item.descripcion || item.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Botones de Selección Rápidos */}
      <div className="flex flex-col gap-2.5">
        <div className={`grid grid-cols-3 gap-2 ${deshabilitado ? 'pointer-events-none opacity-60' : ''}`}>
          <button
            type="button"
            disabled={deshabilitado}
            onClick={() => onMarcarModo('ninguno')}
            className={`py-3 px-2 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 border transition duration-150 active:scale-[0.96] ${esCompleto
              ? 'bg-exito-600 border-exito-600 text-white shadow-md shadow-exito-100'
              : 'bg-white border-neutro-200 text-neutro-600 hover:bg-neutro-50'
              }`}
          >
            <Check size={14} className="hidden shrink-0 min-[360px]:block" />
            <span className="whitespace-nowrap">Completo</span>
          </button>

          <button
            type="button"
            disabled={deshabilitado}
            onClick={() => onMarcarModo('total')}
            className={`py-3 px-2 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 border transition duration-150 active:scale-[0.96] ${esTotal
              ? 'bg-peligro-600 border-peligro-600 text-white shadow-md shadow-peligro-100'
              : 'bg-white border-neutro-200 text-neutro-600 hover:bg-neutro-50'
              }`}
          >
            <X size={14} className="hidden shrink-0 min-[360px]:block" />
            <span className="whitespace-nowrap">Faltó Todo</span>
          </button>

          <button
            type="button"
            disabled={deshabilitado}
            onClick={() => onCambiarCantidad(esParcial ? 0 : 1)}
            className={`py-3 px-2 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 border transition duration-150 active:scale-[0.96] ${esParcial
              ? 'bg-alerta-500 border-alerta-500 text-white shadow-md shadow-alerta-100'
              : 'bg-white border-neutro-200 text-neutro-600 hover:bg-neutro-50'
              }`}
          >
            <AlertTriangle size={14} className="hidden shrink-0 min-[360px]:block" />
            <span className="whitespace-nowrap">Parcial</span>
          </button>
        </div>

        {/* Subpanel de Ajuste de Faltantes Parciales */}
        {esParcial && (
          <div className="flex items-center justify-between bg-primario-50/50 border border-primario-100 rounded-2xl p-3 animate-fade-in">
            <span className="text-sm font-bold text-primario-700 flex items-center gap-1">
              <AlertTriangle size={14} className="text-primario-600" />
              Unidades Faltantes:
            </span>

            <div className="flex items-center gap-3">
              {/* Botón menos */}
              <button
                type="button"
                disabled={deshabilitado}
                onClick={() => onCambiarCantidad(Math.max(1, (draft?.cantidadFaltante || 0) - 1))}
                className="w-10 h-10 rounded-xl bg-white border border-primario-200 flex items-center justify-center text-lg font-black text-primario-700 shadow-sm active:scale-95 transition"
              >
                <Minus size={14} />
              </button>

              {/* Input de cantidad */}
              <span className="text-xl font-extrabold text-primario-900 w-8 text-center">
                {draft?.cantidadFaltante ?? 1}
              </span>

              {/* Botón más */}
              <button
                type="button"
                disabled={deshabilitado}
                onClick={() => onCambiarCantidad(Math.min(cantidadFactura - 1, (draft?.cantidadFaltante || 0) + 1))}
                className="w-10 h-10 rounded-xl bg-white border border-primario-200 flex items-center justify-center text-lg font-black text-primario-700 shadow-sm active:scale-95 transition"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notas del item */}
      <textarea
        rows={1}
        className="input w-full rounded-xl border-neutro-200 text-sm focus:border-primario-300 focus:ring-2 focus:ring-primario-50/50 py-2.5 px-3"
        placeholder="Nota sobre este producto"
        value={draft?.observaciones || ''}
        disabled={deshabilitado}
        onChange={(e) => onCambiarObservacion(e.target.value)}
      />
    </div>
  )
}
