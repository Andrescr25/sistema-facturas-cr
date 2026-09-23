import { useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, Check, Layers, Pencil, Trash2, X } from 'lucide-react'
import FilaProducto from './FilaProducto'

const BOTON_ICONO = 'rounded-lg border border-neutro-200 bg-white p-2 text-neutro-500 transition-colors hover:border-primario-300 hover:text-primario-700 disabled:opacity-30 disabled:hover:border-neutro-200 disabled:hover:text-neutro-500'

/**
 * Una subcategoría con sus productos, como tarjeta. El encabezado lleva todo
 * lo que se le puede hacer a la subcategoría: seleccionar sus productos,
 * subirla o bajarla en el orden del agente, renombrarla, pasarla completa a
 * otra categoría y borrarla cuando queda vacía.
 *
 * "Sin clasificar" usa la misma tarjeta, en tono de alerta y sin esas
 * acciones: no es una subcategoría, es lo que falta acomodar.
 */
export default function SeccionSubcategoria({
  seccion,
  otrasCategorias,
  esPrimera,
  esUltima,
  estaSeleccionado,
  onAlternar,
  seleccionarTodos,
  deseleccionarTodos,
  onSubir,
  onBajar,
  onRenombrar,
  onEliminar,
  onMoverACategoria,
  onEditar,
  onSugerirFoto,
  onDuplicar
}) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(seccion.nombre)

  const ids = seccion.productos.map((p) => p.alegraId)
  const todos = ids.length > 0 && ids.every((id) => estaSeleccionado(id))
  const esSub = Boolean(seccion.sub) && !seccion.sub.inactiva
  const vacia = esSub && seccion.sub.productos === 0

  const confirmarNombre = () => {
    const limpio = nombre.trim()
    if (limpio && limpio !== seccion.sub.nombre) onRenombrar(seccion.sub.id, limpio)
    setEditando(false)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutro-200 bg-white shadow-sm">
      <div className={`flex flex-col gap-3 border-b px-5 py-4 lg:flex-row lg:items-center ${
        seccion.sinClasificar ? 'border-alerta-100 bg-alerta-50' : 'border-neutro-200 bg-neutro-50'
      }`}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {ids.length > 0 ? (
            <input
              type="checkbox"
              checked={todos}
              onChange={() => (todos ? deseleccionarTodos(ids) : seleccionarTodos(ids))}
              title="Seleccionar todos los de esta sección"
              className="h-5 w-5 shrink-0 cursor-pointer rounded border-neutro-300 text-primario-600 focus:ring-primario-500"
            />
          ) : <span className="w-5 shrink-0" />}

          <div className={`shrink-0 rounded-lg p-2 ${seccion.sinClasificar ? 'bg-alerta-100' : 'bg-primario-100'}`}>
            {seccion.sinClasificar
              ? <AlertTriangle size={20} className="text-alerta-600" />
              : <Layers size={20} className="text-primario-600" />}
          </div>

          {editando ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <input
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmarNombre(); if (e.key === 'Escape') setEditando(false) }}
                maxLength={80}
                className="min-w-0 flex-1 rounded-lg border border-primario-300 bg-white px-3 py-2 text-base font-bold text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500/30"
              />
              <button type="button" onClick={confirmarNombre} className="rounded-lg bg-exito-600 p-2 text-white hover:bg-exito-700" title="Guardar">
                <Check size={18} />
              </button>
              <button type="button" onClick={() => setEditando(false)} className={BOTON_ICONO} title="Cancelar">
                <X size={18} />
              </button>
            </div>
          ) : (
            <div className="min-w-0">
              <h3 className={`truncate text-lg font-bold ${seccion.sinClasificar ? 'text-alerta-800' : 'text-neutro-800'}`}>
                {seccion.nombre}
              </h3>
              <p className="text-sm text-neutro-500">
                {seccion.productos.length} producto{seccion.productos.length === 1 ? '' : 's'}
                {seccion.sinClasificar && ' — seleccionalos y usá "Mover a subcategoría"'}
              </p>
            </div>
          )}
        </div>

        {esSub && !editando && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onSubir} disabled={esPrimera} className={BOTON_ICONO} title="Subir (así la ve el agente)">
              <ArrowUp size={18} />
            </button>
            <button type="button" onClick={onBajar} disabled={esUltima} className={BOTON_ICONO} title="Bajar">
              <ArrowDown size={18} />
            </button>
            <button type="button" onClick={() => { setNombre(seccion.sub.nombre); setEditando(true) }} className={BOTON_ICONO} title="Renombrar">
              <Pencil size={18} />
            </button>
            <select
              value=""
              onChange={(e) => {
                const destino = otrasCategorias.find((c) => String(c.id) === e.target.value)
                if (destino) onMoverACategoria(seccion.sub, destino)
              }}
              title="Pasar esta subcategoría completa, con sus productos, a otra categoría"
              className="rounded-lg border border-neutro-200 bg-white px-3 py-2 text-sm font-semibold text-neutro-600 hover:border-primario-300 focus:border-primario-400 focus:outline-none"
            >
              <option value="" disabled>Pasar a otra categoría…</option>
              {otrasCategorias.map((c) => <option key={c.id} value={c.id}>{c.nombreVisible}</option>)}
            </select>
            <button
              type="button"
              onClick={() => onEliminar(seccion.sub.id)}
              disabled={!vacia}
              title={vacia ? 'Borrar esta subcategoría' : 'Solo se puede borrar cuando queda vacía'}
              className="rounded-lg border border-neutro-200 bg-white p-2 text-neutro-500 transition-colors hover:border-peligro-300 hover:text-peligro-600 disabled:opacity-30 disabled:hover:border-neutro-200 disabled:hover:text-neutro-500"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>

      {seccion.productos.length === 0 ? (
        <p className="px-5 py-6 text-sm text-neutro-400">
          Todavía no tiene productos. Seleccioná productos de otra sección y usá "Mover a subcategoría".
        </p>
      ) : (
        <div className="divide-y divide-neutro-100">
          {seccion.productos.map((p) => (
            <FilaProducto
              key={p.alegraId}
              producto={p}
              seleccionado={estaSeleccionado(p.alegraId)}
              onAlternarSeleccion={onAlternar}
              onEditar={onEditar}
              onSugerirFoto={onSugerirFoto}
              onDuplicar={onDuplicar}
            />
          ))}
        </div>
      )}
    </div>
  )
}
