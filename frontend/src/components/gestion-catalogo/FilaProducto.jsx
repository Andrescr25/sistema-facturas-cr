import { ImageIcon, Pencil, Camera, Copy } from 'lucide-react'
import Insignia from '../ui/Insignia'
import { formatCRC } from '../../utils/gestionCatalogoUtils'

function TonoMargen({ margen }) {
  if (margen === null || margen === undefined) return <span className="text-neutro-300">—</span>
  const tono = margen < 0 ? 'peligro' : margen < 10 ? 'alerta' : 'exito'
  return <Insignia tono={tono}>{margen.toFixed(0)}%</Insignia>
}

/**
 * Una fila del catálogo: densa, con las acciones SIEMPRE visibles (no
 * escondidas tras un hover que en tableta no existe — ver el velo oscuro que
 * tapaba la tarjeta vieja, GridProductos.jsx). La miniatura se agranda al
 * pasarle encima, que es como se juzga si la foto está bien sin tener que
 * abrir nada.
 */
export default function FilaProducto({
  producto,
  seleccionado,
  onAlternarSeleccion,
  mostrarCategoria = false,
  onEditar,
  onSugerirFoto,
  onDuplicar
}) {
  const p = producto
  const hasImg = !!p.imageUrl

  return (
    <div
      className={`group/fila flex items-center gap-3 border-b border-neutro-50 px-3 py-2 last:border-b-0 hover:bg-neutro-50 ${
        seleccionado ? 'bg-primario-50/60' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={seleccionado}
        onChange={(e) => onAlternarSeleccion(p.alegraId, e.nativeEvent)}
        className="h-4 w-4 shrink-0 rounded border-neutro-300 text-primario-600 focus:ring-primario-500"
      />

      {/* La miniatura se agranda al pasarle encima (lupa), para juzgar la
          foto sin abrir nada. z-20 para que quede sobre las filas vecinas. */}
      <div className="group/img relative z-0 h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-neutro-100 bg-neutro-50 hover:z-20">
        {hasImg ? (
          <img
            src={p.imageUrl}
            alt={p.name}
            loading="lazy"
            className="h-full w-full origin-center object-contain p-0.5 transition-transform duration-150 group-hover/img:scale-[3.2] group-hover/img:shadow-2xl"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-peligro-50">
            <ImageIcon size={16} className="text-peligro-300" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-neutro-800" title={p.name}>{p.name}</p>
        <p className="truncate text-[11px] text-neutro-400">
          {p.reference || 'Sin ref.'}
          {mostrarCategoria && (
            <span className="ml-1.5 text-neutro-400">
              · {p.category}{p.subcategoria ? ` · ${p.subcategoria.nombre}` : ''}
            </span>
          )}
        </p>
      </div>

      <div className="hidden shrink-0 flex-col items-end text-right sm:flex" style={{ minWidth: '5.5rem' }}>
        <span className="text-[13px] font-bold text-neutro-900">
          {p.precioConIva != null ? formatCRC(p.precioConIva) : '—'}
        </span>
        <span className="text-[10px] text-neutro-400">costo {formatCRC(p.cost)}</span>
      </div>

      <div className="hidden w-12 shrink-0 justify-center md:flex">
        <TonoMargen margen={p.margenReal} />
      </div>

      <div className="hidden w-14 shrink-0 text-right text-[11px] font-semibold text-neutro-500 lg:block">
        {p.unidadesMes != null ? `${p.unidadesMes.toFixed(0)}/mes` : '—'}
      </div>

      <div className="hidden w-28 shrink-0 truncate text-right text-[11px] text-neutro-400 xl:block" title={p.proveedor?.nombre}>
        {p.proveedor?.nombre || '—'}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={() => onSugerirFoto(p)}
          title="Sugerir foto"
          className="rounded-lg p-1.5 text-neutro-400 hover:bg-primario-50 hover:text-primario-700"
        >
          <Camera size={15} />
        </button>
        <button
          onClick={() => onDuplicar(p)}
          title="Duplicar con otra marca"
          className="rounded-lg p-1.5 text-neutro-400 hover:bg-primario-50 hover:text-primario-700"
        >
          <Copy size={15} />
        </button>
        <button
          onClick={() => onEditar(p)}
          title="Editar"
          className="rounded-lg p-1.5 text-neutro-400 hover:bg-primario-50 hover:text-primario-700"
        >
          <Pencil size={15} />
        </button>
      </div>
    </div>
  )
}
