import { EyeOff, Power, X } from 'lucide-react'
import Boton from '../ui/Boton'

const SELECT = 'min-w-0 flex-1 rounded-xl border border-neutro-200 bg-neutro-50 px-3 py-2.5 text-sm font-semibold text-neutro-700 focus:border-primario-400 focus:bg-white focus:outline-none disabled:opacity-50'

/**
 * El panel flotante de abajo a la derecha — el mismo lugar donde el reporte
 * de proveedores pone "Mover N a otro proveedor". Aparece cuando hay
 * productos seleccionados.
 *
 * Flota en la esquina y no es una barra de ancho completo: una barra fija a
 * todo el ancho se le montaría encima al sidebar en escritorio (ver
 * vocabularioDiseno.test.js).
 *
 * Mover, ocultar del catálogo y retirar de la venta son acciones distintas.
 */
export default function BarraLote({
  cantidad,
  enBusqueda,
  subsDeLaCategoria,
  otrasCategorias,
  moviendo,
  onMoverASubcategoria,
  onCambiarCategoria,
  onOcultar,
  onDesactivar,
  onLimpiar
}) {
  if (cantidad === 0) return null

  return (
    <div className="fixed bottom-6 right-4 z-40 w-[min(calc(100vw-2rem),36rem)] space-y-3 sm:right-6"
      role="region" aria-label="Acciones de productos seleccionados" aria-busy={moviendo}>
        <div className="max-h-[70dvh] overflow-y-auto rounded-2xl border border-primario-200 bg-white p-4 shadow-2xl ring-1 ring-primario-100">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-base font-bold text-neutro-900">
              {cantidad} producto{cantidad === 1 ? '' : 's'} seleccionado{cantidad === 1 ? '' : 's'}
            </p>
            <button type="button" disabled={moviendo} onClick={onLimpiar} className="rounded-lg p-1.5 text-neutro-400 hover:bg-neutro-100 hover:text-neutro-700 disabled:opacity-50" title="Quitar la selección" aria-label="Quitar la selección">
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {!enBusqueda && (
              <select
                value=""
                disabled={moviendo}
                aria-label="Mover selección a subcategoría"
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
              disabled={moviendo}
              aria-label="Cambiar categoría de la selección"
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
          <div className="mt-3 grid grid-cols-1 gap-2 border-t border-neutro-100 pt-3 sm:grid-cols-2">
            <Boton variante="secundario" icono={EyeOff} disabled={moviendo} onClick={onOcultar} className="min-h-11">
              Ocultar del catálogo
            </Boton>
            <Boton variante="peligro" icono={Power} disabled={moviendo} onClick={onDesactivar} className="min-h-11">
              Desactivar
            </Boton>
          </div>
          {moviendo && <p role="status" className="mt-2 text-sm font-semibold text-primario-700">Aplicando cambios…</p>}
        </div>
    </div>
  )
}
