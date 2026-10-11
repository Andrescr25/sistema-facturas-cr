import { useState } from 'react'
import { AlertTriangle, Check, ImageOff, Loader2, Plus, Search, Sparkles, Trash2, X } from 'lucide-react'
import Insignia from '../ui/Insignia'
import { useProductosNuevos } from '../../hooks/useProductosNuevos'
import { urlArchivo } from '../../utils/urlArchivo'

/**
 * "Productos nuevos" del catálogo del agente (2026-09-27, decisión del
 * usuario): una lista MANUAL. Lo que está acá sale en el catálogo del agente
 * en su propia sección, justo después de "Bajamos el precio". Solo se agrega
 * y se quita; no hay nada automático.
 *
 * Un producto que después se desactiva u oculta no se borra solo de la lista:
 * se marca, porque si no aparece en la tablet la pregunta obvia es "¿por qué
 * no sale?", y la respuesta tiene que estar acá.
 */

const FECHA = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Costa_Rica' })

function Foto({ url, nombre }) {
  const [rota, setRota] = useState(false)
  if (!url || rota) {
    return (
      <div className="flex h-16 w-16 shrink-0 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-neutro-50 text-neutro-300">
        <ImageOff size={22} />
      </div>
    )
  }
  return <img src={urlArchivo(url)} alt={nombre} onError={() => setRota(true)} className="h-16 w-16 shrink-0 sm:h-20 sm:w-20 rounded-2xl bg-neutro-50 object-contain" />
}

function TarjetaProductoNuevo({ producto: p, ocupado, onQuitar }) {
  return (
    <div className="card flex min-w-0 items-start gap-4 p-4 sm:p-5">
      <Foto url={p.imagenUrl} nombre={p.nombre} />
      <div className="min-w-0 flex-1">
        {!p.visibleEnCatalogo && (
          <Insignia tono="alerta" icono={AlertTriangle} className="mb-1.5">No sale: {p.motivoNoVisible}</Insignia>
        )}
        <h3 className="break-words text-base font-bold leading-tight text-neutro-900 sm:text-lg">{p.nombre}</h3>
        <p className="mt-0.5 truncate text-sm text-neutro-500">
          {p.referencia ? `Ref. ${p.referencia}` : 'Sin referencia'}{p.categoria ? ` · ${p.categoria}` : ''}
        </p>
        <p className="mt-1 text-xs text-neutro-400">
          Agregado el {FECHA.format(new Date(p.agregadoEn))}{p.agregadoPor ? ` · ${p.agregadoPor}` : ''}
        </p>
      </div>
      <button type="button" onClick={() => onQuitar(p)} disabled={ocupado === `registro:${p.registroId}`}
        aria-label={`Quitar ${p.nombre} de Productos nuevos`}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-peligro-700 transition-colors hover:bg-peligro-50 disabled:opacity-50">
        {ocupado === `registro:${p.registroId}` ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
        <span className="hidden sm:inline">Quitar</span>
      </button>
    </div>
  )
}

export default function SeccionProductosNuevos({ showToast, confirm }) {
  const n = useProductosNuevos({ showToast, confirm })
  const enLista = new Set(n.productos.map((p) => String(p.productoId)))
  const buscandoAlgo = n.busqueda.trim().length >= 2

  return (
    <div className="space-y-5">
      <div className="card space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-neutro-900">
            <Sparkles className="text-primario-600" size={22} />
            Productos nuevos
            <span className="text-base font-normal text-neutro-400">· {n.productos.length}</span>
          </h2>
          <p className="mt-1 text-sm text-neutro-500">
            Salen en el catálogo del agente, justo después de "Bajamos el precio". La tablet los ve la próxima vez que se actualice.
          </p>
        </div>

        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutro-400" />
          <input value={n.busqueda} onChange={(e) => n.setBusqueda(e.target.value)}
            placeholder="Buscar un producto para agregarlo…" aria-label="Buscar producto para agregar"
            className="input h-12 w-full rounded-xl pl-11 pr-11 text-base" />
          {n.buscando ? (
            <Loader2 size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-primario-600" />
          ) : n.busqueda && (
            <button type="button" onClick={() => n.setBusqueda('')} aria-label="Limpiar búsqueda"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2.5 text-neutro-400 hover:bg-neutro-100"><X size={18} /></button>
          )}
        </div>

        {buscandoAlgo && (
          <div className="max-h-80 divide-y divide-neutro-100 overflow-y-auto rounded-2xl border border-neutro-100">
            {!n.buscando && n.resultados.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutro-400">Ningún producto con "{n.busqueda.trim()}"</p>
            ) : n.resultados.map((p) => {
              const ya = enLista.has(String(p.productoId))
              return (
                <div key={p.productoId} className="flex items-center justify-between gap-3 p-3 sm:px-4">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-neutro-900">{p.nombre}</p>
                    <p className="truncate text-xs text-neutro-400">
                      {p.referencia ? `Ref. ${p.referencia}` : 'Sin referencia'}{p.categoria ? ` · ${p.categoria}` : ''}
                    </p>
                  </div>
                  {ya ? (
                    <span className="flex h-10 shrink-0 items-center gap-1.5 px-3 text-sm font-semibold text-exito-700">
                      <Check size={16} /> Ya está
                    </span>
                  ) : (
                    <button type="button" onClick={() => n.agregar(p)} disabled={n.ocupado === `producto:${p.productoId}`}
                      className="btn btn-primary flex h-10 shrink-0 items-center gap-1.5 disabled:opacity-50">
                      {n.ocupado === `producto:${p.productoId}` ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      Agregar
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {n.cargando && n.productos.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-neutro-400">
          <Loader2 size={20} className="animate-spin" /> Cargando…
        </div>
      ) : n.productos.length === 0 ? (
        <div className="card py-12 text-center">
          <Sparkles size={30} className="mx-auto text-neutro-300" />
          <p className="mt-2 text-lg font-bold text-neutro-800">Todavía no hay productos nuevos</p>
          <p className="mt-1 text-sm text-neutro-500">Buscá uno arriba para agregarlo.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {n.productos.map((p) => (
            <TarjetaProductoNuevo key={p.registroId} producto={p} ocupado={n.ocupado} onQuitar={n.quitar} />
          ))}
        </div>
      )}
    </div>
  )
}
