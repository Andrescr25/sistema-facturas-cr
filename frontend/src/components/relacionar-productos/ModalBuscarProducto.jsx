import { Search, Loader2, Package, AlertCircle, Plus, ChevronRight } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import { colonesExacto } from '../../utils/colones'

/**
 * Buscar el producto propio con el que se relaciona una línea del proveedor,
 * con salida a crear uno nuevo si no existe.
 *
 * REDISEÑO (2026-10-20, el usuario: «los productos se ven muy enorme y casi no
 * se ven»). El recuadro del proveedor ocupaba casi todo el alto y cada
 * resultado era una tarjeta con cuatro datos en grilla y un botón aparte: en
 * una laptop cabían uno o dos. Ahora el proveedor es un resumen de dos o tres
 * renglones que queda fijo arriba con el buscador, y cada resultado es una
 * fila que se elige con un toque. Usa el Modal del sistema (Escape, hoja
 * desde abajo en el teléfono).
 */
export default function ModalBuscarProducto({
  productoSeleccionado,
  busqueda,
  setBusqueda,
  resultadosBusqueda,
  buscando,
  onCerrar,
  onRelacionar,
  onCrearNuevo
}) {
  const p = productoSeleccionado || {}
  const codigoGenerado = p.codigoProveedor?.startsWith('DESC-')

  return (
    <Modal
      onCerrar={onCerrar}
      titulo="Relacionar con un producto propio"
      ancho="xl"
      pie={<Boton variante="activo" icono={Plus} ancho onClick={onCrearNuevo}>No está: crear producto nuevo</Boton>}
    >
      <div className="sticky top-0 z-10 space-y-3 border-b border-neutro-100 bg-white px-5 pb-3 pt-4">
        <div className="rounded-2xl bg-neutro-50 px-3.5 py-2.5 ring-1 ring-inset ring-neutro-200">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutro-400">Del proveedor</p>
          <p className="text-sm font-bold leading-snug text-neutro-900 line-clamp-2">{p.descripcion}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-neutro-500">
            <span>Código <span className="font-mono font-semibold text-neutro-800">{p.codigoProveedor || '—'}</span></span>
            <span>Cantidad <strong className="text-neutro-800">{p.cantidad} {p.unidadMedida}</strong></span>
            {p.precioUnitario != null && <span>Precio <strong className="text-neutro-800">{colonesExacto(p.precioUnitario)}</strong></span>}
          </p>
          {codigoGenerado && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-alerta-700">
              <AlertCircle size={12} className="mt-px shrink-0" />
              Este proveedor no manda códigos: el sistema armó uno con la descripción.
            </p>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" size={17} />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o referencia…"
            aria-label="Buscar producto propio"
            className="h-11 w-full rounded-xl border-2 border-neutro-200 pl-10 pr-3 text-sm focus:border-primario-500 focus:outline-none"
            autoFocus
          />
        </div>
      </div>

      <div className="px-3 py-2">
        {buscando ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-neutro-500">
            <Loader2 size={16} className="animate-spin" /> Buscando…
          </p>
        ) : resultadosBusqueda.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-neutro-500">
            <Package size={28} className="text-neutro-300" />
            {busqueda ? `No hay productos con «${busqueda}». Si no existe, crealo abajo.` : 'Escribí el nombre o la referencia del producto.'}
          </div>
        ) : (
          <>
            <p className="px-2 pb-1 text-[11px] font-semibold text-neutro-400">
              {resultadosBusqueda.length} {resultadosBusqueda.length === 1 ? 'producto' : 'productos'} · tocá el que corresponde
            </p>
            <ul className="divide-y divide-neutro-100">
              {resultadosBusqueda.map(prod => (
                <li key={prod.id}>
                  <button
                    type="button"
                    onClick={() => onRelacionar(prod)}
                    className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-primario-50 focus-visible:bg-primario-50 focus-visible:outline-none"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-neutro-900 line-clamp-2">{prod.name}</p>
                      <p className="mt-0.5 truncate text-xs text-neutro-500">
                        <span className="font-mono">{prod.reference || 'Sin ref.'}</span>
                        {prod.category && <> · {prod.category}</>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right" title="Precio de venta sin IVA · costo con IVA">
                      <p className="text-sm font-bold text-neutro-900">{prod.price != null ? colonesExacto(prod.price) : '—'}</p>
                      {prod.cost > 0 && <p className="text-[11px] text-neutro-500">costo {colonesExacto(prod.cost)}</p>}
                    </div>
                    <span className="hidden h-8 shrink-0 items-center rounded-lg bg-primario-50 px-3 text-xs font-bold text-primario-700 transition-colors group-hover:bg-primario-800 group-hover:text-white sm:inline-flex">
                      Elegir
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-neutro-300 sm:hidden" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  )
}
