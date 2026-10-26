import { Search, Loader2, Trash2, FilePlus2 } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import { colones, colonesExacto } from '../../utils/colones'
import { hoyEnCostaRica } from '../../utils/fechaCR'
import { totalDeLinea, totalDeFactura } from '../../utils/facturaManualUtils'

/**
 * La factura de compra de un proveedor que no manda factura electrónica,
 * cargada como dice el papel (2026-10-25). Entra al inventario y actualiza el
 * costo igual que Registrar compra; sin clave no hay aceptación ante Hacienda.
 * El estado vive en hooks/useFacturaManual.js.
 */
export default function ModalFacturaManual({ estado: e }) {
  const b = e.borrador
  const total = totalDeFactura(b.lineas)

  const pie = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-neutro-600">
        Total con IVA <strong className="text-lg text-neutro-900">{colones(total)}</strong>
      </p>
      <div className="flex flex-col items-stretch gap-1 sm:items-end">
        <Boton icono={FilePlus2} cargando={e.guardando} disabled={Boolean(e.motivo)} onClick={e.guardar}>Cargar factura</Boton>
        {e.motivo && <p className="text-xs text-neutro-500">{e.motivo}</p>}
      </div>
    </div>
  )

  return (
    <Modal titulo="Cargar factura de compra a mano" ancho="2xl" onCerrar={e.cerrar} pie={pie}>
      <div className="space-y-5 p-5">
        <p className="rounded-xl bg-neutro-50 p-3 text-sm text-neutro-600">
          Para lo que llega sin factura electrónica. Al cargarla, el producto ingresa: entra al inventario,
          se actualiza su costo y en Reporte Clientes ya se puede marcar que llegó.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-neutro-700">Proveedor
            <select aria-label="Proveedor de la factura" className="input mt-1 h-12 w-full" value={b.proveedorId}
              onChange={(ev) => e.cambiar('proveedorId', ev.target.value)} disabled={e.guardando}>
              <option value="">Elegí el proveedor…</option>
              {e.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-neutro-700">Número de la factura
            <input className="input mt-1 h-12 w-full" value={b.numero} maxLength={30} disabled={e.guardando}
              onChange={(ev) => e.cambiar('numero', ev.target.value)} placeholder="El que trae el papel" />
          </label>
          <label className="block text-sm font-semibold text-neutro-700">Fecha
            <input type="date" className="input mt-1 h-12 w-full" value={b.fecha} max={hoyEnCostaRica()} disabled={e.guardando}
              onChange={(ev) => e.cambiar('fecha', ev.target.value)} />
          </label>
          <div className="text-sm font-semibold text-neutro-700">Condición
            <div className="mt-1 flex gap-2">
              {[['contado', 'Contado'], ['credito', 'Crédito']].map(([valor, texto]) => (
                <Boton key={valor} variante={b.condicion === valor ? 'activo' : 'secundario'} tamano="lg" className="flex-1"
                  disabled={e.guardando} onClick={() => e.cambiar('condicion', valor)}>{texto}</Boton>
              ))}
              {b.condicion === 'credito' && (
                <input type="number" min="1" max="365" aria-label="Plazo en días" className="input h-12 w-24 text-center"
                  value={b.plazoDias} placeholder="Días" disabled={e.guardando}
                  onChange={(ev) => e.cambiar('plazoDias', ev.target.value)} />
              )}
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-neutro-700">Productos</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" size={17} />
            <input className="input h-12 w-full pl-10" value={e.busqueda} disabled={e.guardando}
              onChange={(ev) => e.setBusqueda(ev.target.value)} placeholder="Buscar por nombre o código para agregarlo" />
            {e.buscando && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-neutro-400" />}
          </div>
          {e.resultados.length > 0 && (
            <ul className="mt-2 max-h-56 divide-y divide-neutro-100 overflow-y-auto rounded-xl ring-1 ring-neutro-200">
              {e.resultados.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => e.agregar(p)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-primario-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-neutro-900">{p.name}</span>
                      <span className="block text-xs text-neutro-500">{p.reference || 'Sin código'}</span>
                    </span>
                    {p.cost != null && <span className="shrink-0 text-xs text-neutro-500">Último costo {colonesExacto(p.cost)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {b.lineas.length > 0 && (
          <ul className="space-y-2">
            {b.lineas.map((l, i) => {
              const totalLinea = totalDeLinea(l)
              return (
                <li key={`${l.productoId}-${i}`} className="rounded-2xl p-3 ring-1 ring-neutro-200">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-neutro-900">{l.nombre}</p>
                      <p className="text-xs text-neutro-500">{l.referencia || 'Sin código'}</p>
                    </div>
                    <Boton variante="fantasma" tamano="sm" icono={Trash2} aria-label={`Quitar ${l.nombre}`}
                      disabled={e.guardando} onClick={() => e.quitarLinea(i)} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 items-end gap-2">
                    <label className="text-xs font-semibold text-neutro-600">Cantidad (nuestras)
                      <input type="number" min="0" step="any" inputMode="decimal" className="input mt-1 h-11 w-full text-center"
                        value={l.cantidad} disabled={e.guardando} onChange={(ev) => e.cambiarLinea(i, 'cantidad', ev.target.value)} />
                    </label>
                    <label className="text-xs font-semibold text-neutro-600">Costo c/u con IVA
                      <input type="number" min="0" step="any" inputMode="decimal" className="input mt-1 h-11 w-full text-center"
                        value={l.costoConIva} disabled={e.guardando} onChange={(ev) => e.cambiarLinea(i, 'costoConIva', ev.target.value)} />
                    </label>
                    <p className="pb-3 text-right text-sm font-bold text-neutro-900">{totalLinea === null ? '—' : colonesExacto(totalLinea)}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {e.error && <p role="alert" className="text-sm font-semibold text-peligro-700">{e.error}</p>}
      </div>
    </Modal>
  )
}
