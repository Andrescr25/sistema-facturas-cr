import { useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, Check, GripVertical, ImageOff, Tag } from 'lucide-react'
import { compararSubcategorias } from '../../utils/catalogoAgentePersonalizacion'

/**
 * Una categoría en la cuadrícula de entrada — la misma tarjeta grande que
 * Cuentas por Cobrar usa para un cliente o el reporte de proveedores para un
 * proveedor. Clic en la tarjeta entra a la categoría.
 *
 * Adentro van sus subcategorías, en el orden del agente. Cada una se puede
 * AGARRAR Y SOLTAR SOBRE OTRA TARJETA: pasa entera, con todos sus productos,
 * a esa categoría. Clic en una (sin arrastrar) entra directo a ella.
 */
export default function TarjetaCategoria({
  categoria,
  arrastrando,
  puedeReordenar,
  esPrimera,
  esUltima,
  onEntrar,
  onArrastrarSub,
  onTerminarArrastre,
  onSoltarSubcategoria,
  onSubir,
  onBajar
}) {
  const [encima, setEncima] = useState(false)
  const subs = [...categoria.subcategorias].sort(compararSubcategorias)
  const esDestino = Boolean(arrastrando) && arrastrando.categoria !== categoria.name
  const esOrigen = Boolean(arrastrando) && arrastrando.categoria === categoria.name

  const detener = (e) => e.stopPropagation()

  let borde = 'border-neutro-100'
  if (encima) borde = 'border-primario-400 ring-4 ring-primario-200'
  else if (esDestino) borde = 'border-dashed border-primario-300'
  else if (categoria.sinClasificar > 0) borde = 'border-alerta-200 ring-1 ring-alerta-100'

  return (
    <div
      onClick={() => onEntrar(categoria.name)}
      onDragOver={(e) => {
        if (!esDestino) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (!encima) setEncima(true)
      }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setEncima(false) }}
      onDrop={(e) => {
        e.preventDefault()
        setEncima(false)
        if (esDestino) onSoltarSubcategoria(arrastrando, categoria)
      }}
      className={`group relative flex transform cursor-pointer flex-col overflow-hidden rounded-xl border bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${borde} ${
        encima ? 'bg-primario-50/60' : ''
      } ${esOrigen ? 'opacity-60' : ''}`}
    >
      <div className="absolute right-0 top-0 -z-10 h-20 w-20 rounded-bl-[100px] bg-primario-50 transition-colors group-hover:bg-primario-100" />

      <div className="mb-4 flex items-start gap-3">
        <div className={`shrink-0 rounded-xl p-3 ${categoria.sinClasificar > 0 ? 'bg-alerta-100' : 'bg-primario-100'}`}>
          <Tag size={24} className={categoria.sinClasificar > 0 ? 'text-alerta-600' : 'text-primario-600'} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-bold leading-tight text-neutro-900">{categoria.nombreVisible}</h3>
          <p className="mt-0.5 text-sm text-neutro-500">
            {subs.length === 0 ? 'Sin subcategorías' : `${subs.length} subcategoría${subs.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {puedeReordenar && (
          <div onClick={detener} className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            <button type="button" onClick={onSubir} disabled={esPrimera} title="Subir (así la ve el agente)"
              className="rounded-lg border border-neutro-200 bg-white p-1.5 text-neutro-500 hover:border-primario-300 hover:text-primario-700 disabled:opacity-30">
              <ArrowUp size={18} />
            </button>
            <button type="button" onClick={onBajar} disabled={esUltima} title="Bajar"
              className="rounded-lg border border-neutro-200 bg-white p-1.5 text-neutro-500 hover:border-primario-300 hover:text-primario-700 disabled:opacity-30">
              <ArrowDown size={18} />
            </button>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {categoria.sinClasificar > 0 ? (
          <button
            type="button"
            onClick={(e) => { detener(e); onEntrar(categoria.name, 'sin') }}
            className="inline-flex items-center gap-1.5 rounded-full bg-alerta-50 px-3 py-1 text-sm font-bold text-alerta-700 ring-1 ring-alerta-200 hover:bg-alerta-100"
          >
            <AlertTriangle size={14} /> {categoria.sinClasificar} sin clasificar
          </button>
        ) : categoria.total > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-exito-50 px-3 py-1 text-sm font-bold text-exito-700 ring-1 ring-exito-200">
            <Check size={14} strokeWidth={3} /> Todo clasificado
          </span>
        )}
        {categoria.sinImagen > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-peligro-50 px-3 py-1 text-sm font-bold text-peligro-700 ring-1 ring-peligro-200">
            <ImageOff size={14} /> {categoria.sinImagen} sin foto
          </span>
        )}
      </div>

      {subs.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {subs.map((s) => (
            <button
              key={s.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.stopPropagation()
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(s.id)) // sin esto Firefox no arrastra
                onArrastrarSub({ ...s, categoria: categoria.name, categoriaVisible: categoria.nombreVisible })
              }}
              onDragEnd={onTerminarArrastre}
              onClick={(e) => { detener(e); onEntrar(categoria.name, s.id) }}
              title="Clic para verla · arrastrala a otra categoría para moverla completa"
              className="inline-flex cursor-grab items-center gap-1.5 rounded-lg border border-neutro-200 bg-neutro-50 py-1.5 pl-1.5 pr-3 text-sm font-semibold text-neutro-700 transition-colors hover:border-primario-300 hover:bg-primario-50 hover:text-primario-800 active:cursor-grabbing"
            >
              <GripVertical size={16} className="text-neutro-400" />
              {s.nombre}
              <span className="rounded-md bg-white px-1.5 text-xs font-bold text-neutro-500">{s.productos}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center gap-4 border-t border-neutro-100 pt-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutro-400">Productos</p>
          <p className="text-2xl font-bold text-neutro-800">{categoria.total}</p>
        </div>
        <div className="h-9 w-px bg-neutro-200" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutro-400">Clasificados</p>
          <p className="text-2xl font-bold text-primario-600">
            {categoria.total > 0 ? `${Math.round(((categoria.total - categoria.sinClasificar) / categoria.total) * 100)}%` : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}
