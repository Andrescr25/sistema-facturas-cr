import { useState } from 'react'
import { FolderPlus, Loader2 } from 'lucide-react'
import NodoCategoria from './NodoCategoria'

/**
 * El riel: categorías y subcategorías en el orden canónico (el mismo que ve
 * el agente), con sus conteos. Es el mapa del catálogo y también desde
 * donde se edita la taxonomía — reemplaza tanto al filtro de subcategoría
 * (que estaba roto, ver catalogo.controller.js) como a ModalSubcategorias.
 */
export default function RielTaxonomia({
  arbol,
  loading,
  categoriaActiva,
  subFoco,
  onSeleccionarCategoria,
  onSeleccionarSub,
  onSeleccionarSinClasificar,
  onRenombrarCategoria,
  onReordenarCategorias,
  onCrearCategoria,
  onCrearSub,
  onRenombrarSub,
  onReordenarSub,
  onEliminarSub
}) {
  const [nuevaCategoria, setNuevaCategoria] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState(null)

  const moverCategoria = (nombre, delta) => {
    const orden = arbol.map((c) => c.name)
    const i = orden.indexOf(nombre)
    const j = i + delta
    if (i === -1 || j < 0 || j >= orden.length) return
    ;[orden[i], orden[j]] = [orden[j], orden[i]]
    onReordenarCategorias(orden)
  }

  const moverSub = (categoria, subId, delta) => {
    const cat = arbol.find((c) => c.name === categoria)
    if (!cat) return
    const ids = cat.subcategorias.map((s) => s.id)
    const i = ids.indexOf(subId)
    const j = i + delta
    if (i === -1 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    onReordenarSub(categoria, ids)
  }

  const crearCategoria = async () => {
    const nombre = nuevaCategoria.trim()
    if (!nombre) return
    setCreando(true); setError(null)
    try {
      await onCrearCategoria(nombre)
      setNuevaCategoria('')
    } catch (e) {
      setError(e?.response?.data?.message || 'No se pudo crear la categoría.')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-neutro-100 bg-white shadow-sm">
      <div className="shrink-0 border-b border-neutro-100 px-3 py-2.5">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-neutro-500">Categorías</h2>
      </div>

      <div className="barra-fina min-h-0 flex-1 overflow-y-auto">
        {loading && arbol.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-neutro-400">
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        ) : (
          arbol.map((categoria, i) => (
            <NodoCategoria
              key={categoria.name}
              categoria={categoria}
              esActiva={categoriaActiva === categoria.name}
              subFoco={categoriaActiva === categoria.name ? subFoco : undefined}
              esPrimera={i === 0}
              esUltima={i === arbol.length - 1}
              onSeleccionar={() => onSeleccionarCategoria(categoria.name)}
              onSeleccionarSub={(subId) => onSeleccionarSub(categoria.name, subId)}
              onSeleccionarSinClasificar={() => onSeleccionarSinClasificar(categoria.name)}
              onRenombrar={(nombreVisible) => onRenombrarCategoria(categoria.name, nombreVisible)}
              onSubirCategoria={() => moverCategoria(categoria.name, -1)}
              onBajarCategoria={() => moverCategoria(categoria.name, 1)}
              onCrearSub={(nombre) => onCrearSub(categoria.name, nombre)}
              onRenombrarSub={(id, nombre) => onRenombrarSub(categoria.name, id, nombre)}
              onSubirSub={(id) => moverSub(categoria.name, id, -1)}
              onBajarSub={(id) => moverSub(categoria.name, id, 1)}
              onEliminarSub={(id) => onEliminarSub(categoria.name, id)}
            />
          ))
        )}
      </div>

      <div className="shrink-0 border-t border-neutro-100 p-2">
        <div className="flex items-center gap-1">
          <input
            value={nuevaCategoria}
            onChange={(e) => setNuevaCategoria(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') crearCategoria() }}
            placeholder="Nueva categoría (se crea en Alegra)…"
            className="min-w-0 flex-1 rounded-lg border border-dashed border-neutro-300 bg-neutro-50 px-2 py-1.5 text-xs text-neutro-700 placeholder:text-neutro-400 focus:border-primario-400 focus:bg-white focus:outline-none"
          />
          <button
            onClick={crearCategoria}
            disabled={!nuevaCategoria.trim() || creando}
            className="shrink-0 rounded-lg bg-primario-50 p-1.5 text-primario-700 hover:bg-primario-100 disabled:opacity-40"
            title="Crear categoría nueva"
          >
            {creando ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
          </button>
        </div>
        {error && <p className="mt-1 text-[11px] font-semibold text-peligro-600">{error}</p>}
      </div>
    </div>
  )
}
