import { useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, ArrowUp, ArrowDown, Check, X } from 'lucide-react'

/**
 * Una categoría del riel, con sus subcategorías desplegables. La edición de
 * la taxonomía (renombrar, reordenar, crear, borrar) vive acá adentro —
 * reemplaza a ModalSubcategorias.jsx, que la ponía en un modal aparte.
 */
export default function NodoCategoria({
  categoria,
  esActiva,
  subFoco,
  esPrimera,
  esUltima,
  onSeleccionar,
  onSeleccionarSub,
  onSeleccionarSinClasificar,
  onRenombrar,
  onSubirCategoria,
  onBajarCategoria,
  onCrearSub,
  onRenombrarSub,
  onSubirSub,
  onBajarSub,
  onEliminarSub
}) {
  const [abierta, setAbierta] = useState(esActiva)
  const [editando, setEditando] = useState(false)
  const [nombreEdit, setNombreEdit] = useState(categoria.nombreVisible)
  const [subEditId, setSubEditId] = useState(null)
  const [subNombreEdit, setSubNombreEdit] = useState('')
  const [nuevaSub, setNuevaSub] = useState('')
  const [creandoSub, setCreandoSub] = useState(false)

  const subs = categoria.subcategorias || []

  const confirmarRenombre = () => {
    const nombre = nombreEdit.trim()
    if (nombre && nombre !== categoria.nombreVisible) onRenombrar(nombre)
    setEditando(false)
  }

  const confirmarRenombreSub = (sub) => {
    const nombre = subNombreEdit.trim()
    if (nombre && nombre !== sub.nombre) onRenombrarSub(sub.id, nombre)
    setSubEditId(null)
  }

  const crearSub = async () => {
    const nombre = nuevaSub.trim()
    if (!nombre) return
    setCreandoSub(true)
    try {
      await onCrearSub(nombre)
      setNuevaSub('')
    } finally {
      setCreandoSub(false)
    }
  }

  return (
    <div className="border-b border-neutro-100 last:border-b-0">
      <div
        className={`group flex items-center gap-1 px-2 py-2 ${esActiva && subFoco === null ? 'bg-primario-50' : 'hover:bg-neutro-50'}`}
      >
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          className="shrink-0 rounded p-0.5 text-neutro-400 hover:text-neutro-700"
          aria-label={abierta ? 'Contraer' : 'Expandir'}
        >
          {abierta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {editando ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              autoFocus
              value={nombreEdit}
              onChange={(e) => setNombreEdit(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmarRenombre(); if (e.key === 'Escape') setEditando(false) }}
              className="min-w-0 flex-1 rounded border border-primario-300 px-1.5 py-0.5 text-sm"
            />
            <button onClick={confirmarRenombre} className="shrink-0 text-exito-600 hover:text-exito-700"><Check size={14} /></button>
            <button onClick={() => setEditando(false)} className="shrink-0 text-neutro-400 hover:text-neutro-600"><X size={14} /></button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onSeleccionar()}
            className={`min-w-0 flex-1 truncate text-left text-sm font-bold ${esActiva && subFoco === null ? 'text-primario-800' : 'text-neutro-800'}`}
          >
            {categoria.nombreVisible}
          </button>
        )}

        {!editando && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
            <button onClick={() => onSubirCategoria()} disabled={esPrimera} title="Subir" className="rounded p-0.5 text-neutro-300 hover:text-neutro-700 disabled:opacity-30">
              <ArrowUp size={13} />
            </button>
            <button onClick={() => onBajarCategoria()} disabled={esUltima} title="Bajar" className="rounded p-0.5 text-neutro-300 hover:text-neutro-700 disabled:opacity-30">
              <ArrowDown size={13} />
            </button>
            <button onClick={() => { setNombreEdit(categoria.nombreVisible); setEditando(true) }} title="Renombrar" className="rounded p-0.5 text-neutro-300 hover:text-neutro-700">
              <Pencil size={13} />
            </button>
          </div>
        )}

        <span className="shrink-0 rounded-full bg-neutro-100 px-1.5 py-0.5 text-[11px] font-bold text-neutro-500">
          {categoria.total}
        </span>
      </div>

      {abierta && (
        <div className="space-y-0.5 bg-neutro-50/60 py-1 pl-6 pr-2">
          {subs.map((s, i) => (
            <div key={s.id} className="group/sub flex items-center gap-1 rounded px-1.5 py-1">
              {subEditId === s.id ? (
                <div className="flex flex-1 items-center gap-1">
                  <input
                    autoFocus
                    value={subNombreEdit}
                    onChange={(e) => setSubNombreEdit(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmarRenombreSub(s); if (e.key === 'Escape') setSubEditId(null) }}
                    className="min-w-0 flex-1 rounded border border-primario-300 px-1.5 py-0.5 text-xs"
                  />
                  <button onClick={() => confirmarRenombreSub(s)} className="shrink-0 text-exito-600 hover:text-exito-700"><Check size={12} /></button>
                  <button onClick={() => setSubEditId(null)} className="shrink-0 text-neutro-400 hover:text-neutro-600"><X size={12} /></button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSeleccionarSub(s.id)}
                  className={`min-w-0 flex-1 truncate text-left text-xs font-semibold ${subFoco === s.id ? 'text-primario-800' : 'text-neutro-600'}`}
                >
                  {s.nombre}
                </button>
              )}

              {subEditId !== s.id && (
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover/sub:opacity-100">
                  <button onClick={() => onSubirSub(s.id)} disabled={i === 0} title="Subir" className="rounded p-0.5 text-neutro-300 hover:text-neutro-700 disabled:opacity-30">
                    <ArrowUp size={11} />
                  </button>
                  <button onClick={() => onBajarSub(s.id)} disabled={i === subs.length - 1} title="Bajar" className="rounded p-0.5 text-neutro-300 hover:text-neutro-700 disabled:opacity-30">
                    <ArrowDown size={11} />
                  </button>
                  <button onClick={() => { setSubNombreEdit(s.nombre); setSubEditId(s.id) }} title="Renombrar" className="rounded p-0.5 text-neutro-300 hover:text-neutro-700">
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={() => onEliminarSub(s.id)}
                    disabled={s.productos > 0}
                    title={s.productos > 0 ? `Tiene ${s.productos} producto(s): movelos antes de borrarla` : 'Borrar'}
                    className="rounded p-0.5 text-neutro-300 hover:text-peligro-600 disabled:opacity-30 disabled:hover:text-neutro-300"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}

              <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-neutro-400">{s.productos}</span>
            </div>
          ))}

          {categoria.sinClasificar > 0 && (
            <button
              type="button"
              onClick={() => onSeleccionarSinClasificar()}
              className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs font-bold ${
                subFoco === 'sin' ? 'text-alerta-800' : 'text-alerta-600 hover:text-alerta-800'
              }`}
            >
              <span className="flex-1 truncate">Sin clasificar</span>
              <span className="shrink-0 rounded-full bg-alerta-100 px-1.5 py-0.5 text-[10px] font-bold text-alerta-700">
                {categoria.sinClasificar}
              </span>
            </button>
          )}

          <div className="flex items-center gap-1 pt-1">
            <input
              value={nuevaSub}
              onChange={(e) => setNuevaSub(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crearSub() } }}
              placeholder="Nueva subcategoría…"
              maxLength={80}
              className="min-w-0 flex-1 rounded border border-dashed border-neutro-300 bg-white px-1.5 py-1 text-xs text-neutro-700 placeholder:text-neutro-400 focus:border-primario-400 focus:outline-none"
            />
            <button
              onClick={crearSub}
              disabled={!nuevaSub.trim() || creandoSub}
              className="shrink-0 rounded p-1 text-neutro-400 hover:text-primario-700 disabled:opacity-30"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
