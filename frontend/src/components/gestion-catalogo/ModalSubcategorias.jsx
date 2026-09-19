import { useState } from 'react'
import { X, Plus, Loader2, Check, EyeOff, Eye, Pencil } from 'lucide-react'
import { useModal } from '../../hooks/useModal'

/**
 * Crear, renombrar y desactivar subcategorías.
 *
 * Las categorías vienen de Alegra y son planas: 18 bolsas grandes donde no se
 * encuentra nada. Las subcategorías son NUESTRAS y se crean a gusto dentro de
 * cualquiera de ellas.
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
  onCerrar
}) {
  useModal(onCerrar)

  const [categoria, setCategoria] = useState('')
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null)   // { id, nombre }

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

  // Agrupadas, y solo las categorías que ya tienen alguna: una lista con las
  // 18 vacías no ayuda a nadie.
  const porCategoria = subcategorias.reduce((mapa, s) => {
    if (!mapa.has(s.categoria)) mapa.set(s.categoria, [])
    mapa.get(s.categoria).push(s)
    return mapa
  }, new Map())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutro-200 px-5 py-4">
          <h2 className="text-base font-extrabold text-neutro-900">Subcategorías</h2>
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
                  <option key={c.id ?? c.name} value={c.name}>{c.name}</option>
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

          {porCategoria.size === 0 ? (
            <p className="py-6 text-center text-sm text-neutro-400">
              Todavía no hay ninguna. Creá la primera arriba.
            </p>
          ) : (
            [...porCategoria.entries()].map(([cat, lista]) => (
              <div key={cat}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-neutro-500">{cat}</p>
                <ul className="mt-1 divide-y divide-neutro-100">
                  {lista.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 py-2">
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
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
