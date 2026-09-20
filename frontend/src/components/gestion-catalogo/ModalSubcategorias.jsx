import { useState } from 'react'
import { X, Plus, Loader2, Check, EyeOff, Eye, Pencil, ChevronUp, ChevronDown } from 'lucide-react'
import { useModal } from '../../hooks/useModal'

/**
 * Crear, renombrar, ordenar y desactivar categorías y subcategorías.
 *
 * Las categorías vienen de Alegra y son planas: 18 bolsas grandes donde no se
 * encuentra nada. Las subcategorías son NUESTRAS y se crean a gusto dentro de
 * cualquiera de ellas.
 *
 * EL ORDEN Y EL NOMBRE DE LA CATEGORÍA SON LOCALES. La real de Alegra
 * (`categoria.name`) nunca cambia: sigue siendo la que cruza con los
 * productos y las subcategorías. Lo único que se guarda acá es dónde se
 * muestra y cómo se llama EN PANTALLA.
 *
 * DESACTIVAR NO DESCLASIFICA. Los productos siguen colgando de ella; solo deja
 * de ofrecerse al clasificar. Es lo que permite dejar de usar una sin perder el
 * trabajo hecho, y volver atrás si se desactivó por error. Por eso no hay
 * botón de borrar: borrarla dejaría productos sueltos sin que nadie se entere.
 */
export default function ModalSubcategorias({
  subcategorias = [],
  categorias = [],
  onCrear,
  onRenombrar,
  onDesactivar,
  onReordenarSubcategorias,
  onRenombrarCategoria,
  onReordenarCategorias,
  onCerrar
}) {
  useModal(onCerrar)

  const [categoria, setCategoria] = useState('')
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null)       // { id, nombre } — subcategoría
  const [editandoCat, setEditandoCat] = useState(null)  // nombre real de la categoría en edición
  const [nombreCatEditado, setNombreCatEditado] = useState('')

  const crear = async () => {
    if (!categoria || !nombre.trim()) return
    setGuardando(true); setError(null)
    try {
      await onCrear(categoria, nombre.trim())
      setNombre('')
    } catch (e) {
      setError(e?.response?.data?.message || 'No se pudo crear.')
    } finally {
      setGuardando(false)
    }
  }

  const guardarNombre = async () => {
    if (!editando?.nombre.trim()) return
    setGuardando(true); setError(null)
    try {
      await onRenombrar(editando.id, editando.nombre.trim())
      setEditando(null)
    } catch (e) {
      setError(e?.response?.data?.message || 'No se pudo renombrar.')
    } finally {
      setGuardando(false)
    }
  }

  const guardarNombreCategoria = async () => {
    if (!nombreCatEditado.trim() || !onRenombrarCategoria) return
    setGuardando(true); setError(null)
    try {
      await onRenombrarCategoria(editandoCat, nombreCatEditado.trim())
      setEditandoCat(null)
    } catch (e) {
      setError(e?.response?.data?.message || 'No se pudo renombrar la categoría.')
    } finally {
      setGuardando(false)
    }
  }

  // Categorías en el orden en que ya vienen (el backend las entrega
  // ordenadas). Mover una manda la lista COMPLETA de nombres reales en su
  // nuevo orden.
  const moverCategoria = async (indice, direccion) => {
    if (!onReordenarCategorias) return
    const destino = indice + direccion
    if (destino < 0 || destino >= categorias.length) return

    const nombresEnOrden = categorias.map((c) => c.name)
    const [movida] = nombresEnOrden.splice(indice, 1)
    nombresEnOrden.splice(destino, 0, movida)

    setGuardando(true); setError(null)
    try {
      await onReordenarCategorias(nombresEnOrden)
    } catch (e) {
      setError(e?.response?.data?.message || 'No se pudo reordenar.')
    } finally {
      setGuardando(false)
    }
  }

  // Igual, pero DENTRO de una sola categoría: la lista completa de ids de
  // SUS subcategorías (activas o no) en el nuevo orden.
  const moverSubcategoria = async (nombreCategoria, lista, indice, direccion) => {
    if (!onReordenarSubcategorias) return
    const destino = indice + direccion
    if (destino < 0 || destino >= lista.length) return

    const idsEnOrden = lista.map((s) => s.id)
    const [movida] = idsEnOrden.splice(indice, 1)
    idsEnOrden.splice(destino, 0, movida)

    setGuardando(true); setError(null)
    try {
      await onReordenarSubcategorias(nombreCategoria, idsEnOrden)
    } catch (e) {
      setError(e?.response?.data?.message || 'No se pudo reordenar.')
    } finally {
      setGuardando(false)
    }
  }

  const porCategoria = subcategorias.reduce((mapa, s) => {
    if (!mapa.has(s.categoria)) mapa.set(s.categoria, [])
    mapa.get(s.categoria).push(s)
    return mapa
  }, new Map())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutro-200 px-5 py-4">
          <h2 className="text-base font-extrabold text-neutro-900">Categorías y subcategorías</h2>
          <button type="button" onClick={onCerrar} className="rounded-lg p-1 text-neutro-400 hover:bg-neutro-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-neutro-200 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutro-500">Nueva subcategoría</p>
            <div className="mt-2 space-y-2">
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full rounded-lg border border-neutro-200 bg-neutro-50 px-3 py-2 text-sm"
              >
                <option value="">¿Dentro de cuál categoría?</option>
                {categorias.map((c) => (
                  <option key={c.id ?? c.name} value={c.name}>{c.nombreVisible || c.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crear() } }}
                  placeholder="Sanitario, Potable, Conduit…"
                  maxLength={80}
                  className="flex-1 rounded-lg border border-neutro-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={crear}
                  disabled={guardando || !categoria || !nombre.trim()}
                  className="inline-flex items-center gap-1 rounded-lg bg-primario-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  {guardando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Crear
                </button>
              </div>
            </div>
            {error && <p className="mt-2 text-xs font-semibold text-peligro-600">{error}</p>}
          </div>

          {/* Flechas para acomodar el orden en que se ven arriba (BarraCategorías
              del catálogo) y ahí mismo, dentro de cada una, sus subcategorías. */}
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutro-500">
            Orden en el catálogo
          </p>

          {categorias.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutro-400">Cargando categorías…</p>
          ) : (
            categorias.map((cat, indiceCat) => {
              const lista = porCategoria.get(cat.name) || []
              return (
                <div key={cat.name} className="rounded-xl border border-neutro-200 p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => moverCategoria(indiceCat, -1)}
                        disabled={guardando || indiceCat === 0}
                        title="Subir categoría"
                        className="rounded p-0.5 text-neutro-400 hover:bg-neutro-100 disabled:opacity-20"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moverCategoria(indiceCat, 1)}
                        disabled={guardando || indiceCat === categorias.length - 1}
                        title="Bajar categoría"
                        className="rounded p-0.5 text-neutro-400 hover:bg-neutro-100 disabled:opacity-20"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>

                    {editandoCat === cat.name ? (
                      <>
                        <input
                          type="text"
                          value={nombreCatEditado}
                          onChange={(e) => setNombreCatEditado(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardarNombreCategoria() } }}
                          autoFocus
                          maxLength={120}
                          className="flex-1 rounded-lg border border-neutro-300 px-2 py-1 text-sm font-bold"
                        />
                        <button type="button" onClick={guardarNombreCategoria} className="rounded p-1.5 text-exito-600 hover:bg-exito-50">
                          <Check size={15} />
                        </button>
                        <button type="button" onClick={() => setEditandoCat(null)} className="rounded p-1.5 text-neutro-400 hover:bg-neutro-100">
                          <X size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="flex-1 text-[11px] font-bold uppercase tracking-wider text-neutro-500">
                          {cat.nombreVisible || cat.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => { setEditandoCat(cat.name); setNombreCatEditado(cat.nombreVisible || cat.name) }}
                          title="Renombrar categoría"
                          className="rounded p-1.5 text-neutro-400 hover:bg-neutro-100"
                        >
                          <Pencil size={13} />
                        </button>
                      </>
                    )}
                  </div>

                  {lista.length === 0 ? (
                    <p className="mt-2 pl-6 text-xs text-neutro-400">Todavía no tiene subcategorías.</p>
                  ) : (
                    <ul className="mt-1 divide-y divide-neutro-100 pl-6">
                      {lista.map((s, indiceSub) => (
                        <li key={s.id} className="flex items-center gap-2 py-2">
                          <div className="flex shrink-0 flex-col">
                            <button
                              type="button"
                              onClick={() => moverSubcategoria(cat.name, lista, indiceSub, -1)}
                              disabled={guardando || indiceSub === 0}
                              title="Subir"
                              className="rounded p-0.5 text-neutro-300 hover:bg-neutro-100 disabled:opacity-20"
                            >
                              <ChevronUp size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moverSubcategoria(cat.name, lista, indiceSub, 1)}
                              disabled={guardando || indiceSub === lista.length - 1}
                              title="Bajar"
                              className="rounded p-0.5 text-neutro-300 hover:bg-neutro-100 disabled:opacity-20"
                            >
                              <ChevronDown size={13} />
                            </button>
                          </div>

                          {editando?.id === s.id ? (
                            <>
                              <input
                                type="text"
                                value={editando.nombre}
                                onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardarNombre() } }}
                                autoFocus
                                maxLength={80}
                                className="flex-1 rounded-lg border border-neutro-300 px-2 py-1 text-sm"
                              />
                              <button type="button" onClick={guardarNombre} className="rounded p-1.5 text-exito-600 hover:bg-exito-50">
                                <Check size={15} />
                              </button>
                              <button type="button" onClick={() => setEditando(null)} className="rounded p-1.5 text-neutro-400 hover:bg-neutro-100">
                                <X size={15} />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className={`flex-1 text-sm ${s.activo ? 'text-neutro-800' : 'text-neutro-400 line-through'}`}>
                                {s.nombre}
                                <span className="ml-2 text-xs text-neutro-400">{s.productos} producto{s.productos === 1 ? '' : 's'}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setEditando({ id: s.id, nombre: s.nombre })}
                                title="Renombrar"
                                className="rounded p-1.5 text-neutro-400 hover:bg-neutro-100"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDesactivar(s.id, !s.activo)}
                                title={s.activo
                                  ? 'Dejar de ofrecerla al clasificar. Los productos que ya tiene NO se desclasifican.'
                                  : 'Volver a ofrecerla'}
                                className="rounded p-1.5 text-neutro-400 hover:bg-neutro-100"
                              >
                                {s.activo ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
