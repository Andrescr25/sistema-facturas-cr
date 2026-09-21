import { Loader2, X } from 'lucide-react'

/**
 * La barra de acciones en lote. `sticky`, NUNCA `fixed` (lo prohíbe
 * vocabularioDiseno.test.js: una barra fija de ancho completo taparía el
 * sidebar en escritorio).
 *
 * DOS ACCIONES, A PROPÓSITO SEPARADAS: mover a subcategoría es local e
 * instantánea; cambiar de categoría escribe en Alegra y tarda (ver
 * useAccionesLote.js). Mezclarlas en un solo control confundiría cuándo hay
 * que esperar y cuándo no.
 */
export default function BarraLote({
  cantidad,
  busquedaActiva,
  categoriaActiva,
  arbol,
  moviendo,
  trabajoCategoria,
  onMoverASubcategoria,
  onCambiarCategoria,
  onCerrarTrabajo,
  onLimpiar
}) {
  if (cantidad === 0 && !trabajoCategoria) return null

  const subsDeLaCategoria = !busquedaActiva
    ? (arbol.find((c) => c.name === categoriaActiva)?.subcategorias || [])
    : []
  const erroresTrabajo = trabajoCategoria?.errores?.length || 0

  return (
    <div className="sticky bottom-0 z-30 mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-neutro-200 bg-white p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
      {trabajoCategoria && !trabajoCategoria.terminado && (
        <div className="flex items-center gap-2 text-sm font-semibold text-neutro-600">
          <Loader2 className="animate-spin text-primario-600" size={16} />
          Cambiando categoría: {trabajoCategoria.hechos} de {trabajoCategoria.total}…
        </div>
      )}

      {trabajoCategoria?.terminado && (
        <div className="flex items-center gap-2 text-sm font-semibold text-neutro-600">
          <span>
            Listo: {trabajoCategoria.hechos - erroresTrabajo} de {trabajoCategoria.total} movidos
            {erroresTrabajo > 0 && <span className="text-peligro-600"> · {erroresTrabajo} fallaron</span>}
          </span>
          <button onClick={onCerrarTrabajo} className="rounded p-0.5 text-neutro-400 hover:text-neutro-700">
            <X size={14} />
          </button>
        </div>
      )}

      {cantidad > 0 && (
        <>
          <span className="font-bold text-neutro-700">{cantidad} seleccionado{cantidad === 1 ? '' : 's'}</span>

          {subsDeLaCategoria.length > 0 && (
            <select
              defaultValue=""
              disabled={moviendo}
              onChange={(e) => {
                if (e.target.value === '') return
                onMoverASubcategoria(e.target.value === '__sin__' ? null : e.target.value)
                e.target.value = ''
              }}
              className="rounded-lg border border-neutro-200 bg-neutro-50 px-2.5 py-1.5 text-sm font-semibold text-neutro-700 focus:border-primario-400 focus:outline-none"
            >
              <option value="" disabled>Mover a subcategoría…</option>
              {subsDeLaCategoria.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              <option value="__sin__">— Sin clasificar —</option>
            </select>
          )}

          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value === '') return
              onCambiarCategoria(e.target.value)
              e.target.value = ''
            }}
            className="rounded-lg border border-neutro-200 bg-neutro-50 px-2.5 py-1.5 text-sm font-semibold text-neutro-700 focus:border-primario-400 focus:outline-none"
          >
            <option value="" disabled>Cambiar categoría…</option>
            {arbol.filter((c) => c.name !== categoriaActiva).map((c) => (
              <option key={c.id} value={c.id}>{c.nombreVisible}</option>
            ))}
          </select>

          <button onClick={onLimpiar} className="ml-auto rounded-lg p-1.5 text-neutro-400 hover:bg-neutro-100 hover:text-neutro-700" title="Quitar selección">
            <X size={16} />
          </button>
        </>
      )}
    </div>
  )
}
