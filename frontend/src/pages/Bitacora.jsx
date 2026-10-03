import { Loader2, AlertCircle, Search, X } from 'lucide-react'
import { useBitacora } from '../hooks/useBitacora'
import TarjetaLinea from '../components/bitacora/TarjetaLinea'
import DetalleLinea from '../components/bitacora/DetalleLinea'

/**
 * Bitácora: quién hizo qué en el sistema, y cuándo.
 *
 * Solo la ven administradores, igual que Usuarios y permisos (vive bajo
 * /usuarios a propósito: así la protege la misma regla, en el menú y en el
 * servidor). Es de solo lectura: acá no hay un solo botón que cambie algo.
 *
 * Lista → detalle, como Cuentas por Cobrar: tarjetas grandes y, al tocar una,
 * lo que cambió campo por campo.
 */
export default function Bitacora() {
  const b = useBitacora()

  if (b.abierta) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <DetalleLinea linea={b.abierta} detalle={b.detalle} cargando={b.cargandoDetalle} onVolver={b.volver} />
      </div>
    )
  }

  const { paginacion } = b

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-extrabold text-neutro-900">Bitácora</h1>
        <p className="text-sm text-neutro-500">Quién creó, editó, anuló o borró cada cosa, y cuándo.</p>
      </div>

      <div className="mb-4 rounded-2xl border border-neutro-100 bg-white p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
          <input
            type="text"
            value={b.filtros.buscar}
            onChange={(e) => b.cambiarFiltro('buscar', e.target.value)}
            placeholder="Buscar por nombre, número o motivo…"
            aria-label="Buscar en la bitácora"
            className="input w-full pl-9"
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <select value={b.filtros.entidad} onChange={(e) => b.cambiarFiltro('entidad', e.target.value)} aria-label="Qué" className="input w-full">
            <option value="">Todo</option>
            {b.opciones.entidades.map(o => <option key={o.valor} value={o.valor}>{o.nombre} ({o.lineas})</option>)}
          </select>
          <select value={b.filtros.accion} onChange={(e) => b.cambiarFiltro('accion', e.target.value)} aria-label="Acción" className="input w-full">
            <option value="">Cualquier acción</option>
            {b.opciones.acciones.map(o => <option key={o.valor} value={o.valor}>{o.nombre} ({o.lineas})</option>)}
          </select>
          <select value={b.filtros.usuarioId} onChange={(e) => b.cambiarFiltro('usuarioId', e.target.value)} aria-label="Quién" className="input w-full">
            <option value="">Cualquier persona</option>
            {b.opciones.usuarios.map(o => <option key={o.valor} value={o.valor}>{o.nombre} ({o.lineas})</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs font-bold text-neutro-500">
            Desde
            <input type="date" value={b.filtros.desde} onChange={(e) => b.cambiarFiltro('desde', e.target.value)} className="input mt-1 block" />
          </label>
          <label className="text-xs font-bold text-neutro-500">
            Hasta
            <input type="date" value={b.filtros.hasta} onChange={(e) => b.cambiarFiltro('hasta', e.target.value)} className="input mt-1 block" />
          </label>
          {b.hayFiltros && (
            <button type="button" onClick={b.limpiarFiltros} className="btn btn-outline btn-sm flex items-center gap-1.5">
              <X size={14} />
              Quitar filtros
            </button>
          )}
        </div>
      </div>

      {b.error && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-peligro-200 bg-peligro-50 px-3 py-2.5">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-peligro-600" />
          <p className="text-xs font-semibold text-peligro-700">{b.error}</p>
        </div>
      )}

      {b.cargando ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-primario-600" /></div>
      ) : b.lineas.length === 0 ? (
        <div className="rounded-2xl border border-neutro-100 bg-white px-5 py-12 text-center">
          <p className="font-bold text-neutro-800">{b.hayFiltros ? 'Nada calza con esos filtros.' : 'Todavía no hay nada anotado.'}</p>
          <p className="mt-1 text-sm text-neutro-500">Cada vez que alguien crea, edita, anula o borra algo, queda una línea acá.</p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-neutro-400">
            {paginacion.total} línea{paginacion.total === 1 ? '' : 's'}
          </p>
          <div className="space-y-3">
            {b.lineas.map(l => <TarjetaLinea key={l.id} linea={l} onAbrir={b.abrir} />)}
          </div>
          {paginacion.paginas > 1 && (
            <div className="mt-5 flex items-center justify-between gap-3">
              <button type="button" onClick={() => b.setPagina(p => Math.max(1, p - 1))} disabled={b.pagina <= 1} className="btn btn-outline disabled:opacity-40">
                Más recientes
              </button>
              <span className="text-sm font-semibold text-neutro-500">Página {paginacion.pagina} de {paginacion.paginas}</span>
              <button type="button" onClick={() => b.setPagina(p => Math.min(paginacion.paginas, p + 1))} disabled={b.pagina >= paginacion.paginas} className="btn btn-outline disabled:opacity-40">
                Más antiguas
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
