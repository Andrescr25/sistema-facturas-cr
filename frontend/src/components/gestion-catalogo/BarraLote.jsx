import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react'

const SELECT = 'min-w-0 flex-1 rounded-xl border border-neutro-200 bg-neutro-50 px-3 py-2.5 text-sm font-semibold text-neutro-700 focus:border-primario-400 focus:bg-white focus:outline-none disabled:opacity-50'

/**
 * El panel flotante de abajo a la derecha — el mismo lugar donde el reporte
 * de proveedores pone "Mover N a otro proveedor". Aparece cuando hay
 * productos seleccionados, o mientras corre un movimiento.
 *
 * Flota en la esquina y no es una barra de ancho completo: una barra fija a
 * todo el ancho se le montaría encima al sidebar en escritorio (ver
 * vocabularioDiseno.test.js).
 *
 * DOS ACCIONES, A PROPÓSITO SEPARADAS: mover a subcategoría deja los
 * productos en la misma categoría; cambiar de categoría los manda a "Sin
 * clasificar" de la otra. (En `main` además la segunda escribe en Alegra y
 * tarda; en la base propia las dos son inmediatas.)
 */
export default function BarraLote({
  cantidad,
  enBusqueda,
  subsDeLaCategoria,
  otrasCategorias,
  moviendo,
  trabajo,
  onMoverASubcategoria,
  onCambiarCategoria,
  onCerrarTrabajo,
  onLimpiar
}) {
  if (cantidad === 0 && !trabajo) return null

  const fallaron = trabajo?.errores?.length || 0
  const avance = trabajo?.total ? Math.round((trabajo.hechos / trabajo.total) * 100) : 100

  return (
    <div className="fixed bottom-6 right-4 z-40 w-[min(calc(100vw-2rem),36rem)] space-y-3 sm:right-6">
      {trabajo && (
        <div className="rounded-2xl border border-neutro-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            {!trabajo.terminado
              ? <Loader2 size={22} className="mt-0.5 shrink-0 animate-spin text-primario-600" />
              : fallaron || trabajo.perdido
                ? <XCircle size={22} className="mt-0.5 shrink-0 text-peligro-500" />
                : <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-exito-500" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-neutro-500">
                {trabajo.terminado ? 'Movimiento terminado' : 'Moviendo…'}
              </p>
              <p className="truncate text-base font-bold text-neutro-900">{trabajo.descripcion}</p>
              <p className="text-sm text-neutro-500">
                {trabajo.hechos} de {trabajo.total}
                {fallaron > 0 && <span className="font-semibold text-peligro-600"> · {fallaron} fallaron</span>}
              </p>
            </div>
            {trabajo.terminado && (
              <button type="button" onClick={onCerrarTrabajo} className="rounded-lg p-1.5 text-neutro-400 hover:bg-neutro-100 hover:text-neutro-700" title="Cerrar">
                <X size={18} />
              </button>
            )}
          </div>
          {!trabajo.terminado && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutro-100">
              <div className="h-full rounded-full bg-primario-600 transition-all duration-500" style={{ width: `${avance}%` }} />
            </div>
          )}
        </div>
      )}

      {cantidad > 0 && (
        <div className="rounded-2xl border border-primario-200 bg-white p-4 shadow-2xl ring-1 ring-primario-100">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-base font-bold text-neutro-900">
              {cantidad} producto{cantidad === 1 ? '' : 's'} seleccionado{cantidad === 1 ? '' : 's'}
            </p>
            <button type="button" onClick={onLimpiar} className="rounded-lg p-1.5 text-neutro-400 hover:bg-neutro-100 hover:text-neutro-700" title="Quitar la selección">
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {!enBusqueda && (
              <select
                value=""
                disabled={moviendo}
                onChange={(e) => onMoverASubcategoria(e.target.value === '__sin__' ? null : e.target.value)}
                className={SELECT}
              >
                <option value="" disabled>Mover a subcategoría…</option>
                {subsDeLaCategoria.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                <option value="__sin__">— Sin clasificar —</option>
              </select>
            )}
            <select
              value=""
              onChange={(e) => {
                const destino = otrasCategorias.find((c) => String(c.id) === e.target.value)
                if (destino) onCambiarCategoria(destino)
              }}
              className={SELECT}
            >
              <option value="" disabled>Cambiar de categoría…</option>
              {otrasCategorias.map((c) => <option key={c.id} value={c.id}>{c.nombreVisible}</option>)}
            </select>
          </div>
          {enBusqueda && (
            <p className="mt-2 text-xs text-neutro-500">Para moverlos a una subcategoría, entrá a su categoría.</p>
          )}
        </div>
      )}
    </div>
  )
}
