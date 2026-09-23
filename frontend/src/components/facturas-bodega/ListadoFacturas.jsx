import { ArrowRight, CalendarDays, CheckCircle2, Clock, History, Package, Search, X } from 'lucide-react'
import TarjetasResumen from '../pagos/TarjetasResumen'
import { formatCurrency, formatDate, horaDespacho } from '../../utils/facturasBodegaUtils'

/**
 * La lista de Facturas en Bodega, con la forma del resto del sistema: dos
 * tarjetas arriba que cambian de vista —Por preparar e Historial— y cada
 * factura como una tarjeta grande que se toca entera. Los faltantes no se
 * siguen acá: tienen su propio módulo.
 *
 * El HISTORIAL va en orden de despacho: la última despachada primero, la
 * anterior segunda, y así (lo ordena el servidor por la hora de despacho).
 */
const TITULOS = {
  pendientes: { titulo: 'Por preparar', vacio: '¡Todo al día en bodega!', detalle: 'No hay facturas esperando despacho.' },
  historial: { titulo: 'Historial', subtitulo: 'La última despachada primero', vacio: 'Todavía no hay facturas despachadas.', detalle: '' }
}

function TarjetaFactura({ factura, onAbrir }) {
  const despachada = factura.estado_bodega === 'procesado'
  const cuando = horaDespacho(factura.despachada_en)
  const productos = factura.items?.length || 0

  return (
    <button
      type="button"
      onClick={() => onAbrir(factura)}
      className="card flex w-full flex-col gap-3 p-5 text-left transition hover:border-primario-200 hover:shadow-md active:scale-[0.99]"
    >
      {/* flex-wrap: con un número largo, la fecha baja entera en vez de
          partirse en tres renglones al lado. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
        <span className="min-w-0 break-all rounded-full bg-primario-50 px-2.5 py-0.5 font-semibold text-primario-700">
          #{factura.numero_completo || factura.numero_factura}
        </span>
        <span className="whitespace-nowrap text-neutro-500">{formatDate(factura.fecha_emision)}</span>
      </div>

      <h3 className="break-words text-xl font-bold leading-tight text-neutro-900">{factura.cliente_nombre}</h3>
      <p className="text-neutro-600">
        {productos} producto{productos === 1 ? '' : 's'} · {formatCurrency(factura.total)}
      </p>

      {despachada ? (
        <p className="flex items-center gap-1.5 border-t border-neutro-100 pt-3 text-sm text-neutro-600">
          <Clock size={15} className="shrink-0 text-neutro-400" />
          {cuando ? `Despachada ${cuando}` : 'Despachada'}
        </p>
      ) : (
        <span className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-primario-600 py-3 text-base font-bold text-white">
          Iniciar despacho <ArrowRight size={18} />
        </span>
      )}
    </button>
  )
}

export default function ListadoFacturas({
  vista, setVista, conteos, busqueda, setBusqueda, filtros, cambiarFiltro, limpiarFiltros, facturas, onAbrir
}) {
  const tarjetas = [
    { clave: 'pendientes', titulo: 'Por preparar', icono: Package, tono: conteos.porPreparar > 0 ? 'alerta' : 'exito', valor: conteos.porPreparar, filtro: { estado: 'pendientes' } },
    { clave: 'historial', titulo: 'Historial', icono: History, tono: 'neutro', valor: conteos.historial, filtro: { estado: 'historial' } }
  ]
  const textos = TITULOS[vista] || TITULOS.pendientes

  return (
    <div className="space-y-5">
      <TarjetasResumen
        compacta
        tarjetas={tarjetas}
        // TarjetasResumen alterna los campos `estado` y `dias`; la vista viaja
        // en `estado`. Tocar la tarjeta activa la "suelta" ('todos'): se
        // vuelve a Por preparar, que es la vista de trabajo.
        filtros={{ estado: vista, dias: 'todos' }}
        setFiltros={(actualizar) => {
          const nuevo = actualizar({ estado: vista, dias: 'todos' })
          setVista(nuevo.estado === 'todos' ? 'pendientes' : nuevo.estado)
        }}
      />

      <div>
        <h2 className="text-xl font-bold text-neutro-900">
          {textos.titulo} <span className="font-normal text-neutro-400">· {facturas.length}</span>
        </h2>
        {textos.subtitulo && <p className="text-sm text-neutro-500">{textos.subtitulo}</p>}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar factura o cliente…"
            className="input h-12 w-full rounded-xl pl-10 pr-10 text-base"
          />
          {busqueda && (
            <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2.5 text-neutro-400 hover:bg-neutro-100">
              <X size={18} />
            </button>
          )}
        </div>
        {vista === 'pendientes' && (
          <label className="flex shrink-0 items-center gap-2 text-sm text-neutro-600">
            <CalendarDays size={16} className="text-neutro-400" />
            Desde
            <input
              type="date"
              value={filtros.fechaInicio}
              onChange={(e) => cambiarFiltro('fechaInicio', e.target.value)}
              className="input h-12 rounded-xl text-base"
            />
            {filtros.fechaInicio && (
              <button type="button" onClick={limpiarFiltros} className="rounded-lg px-2 py-3 text-sm font-semibold text-primario-600">Quitar</button>
            )}
          </label>
        )}
      </div>

      {facturas.length === 0 ? (
        <div className="card py-14 text-center">
          <CheckCircle2 className="mx-auto mb-3 text-exito-500" size={40} />
          <p className="text-lg font-bold text-neutro-800">{busqueda ? `Nada con "${busqueda.trim()}"` : textos.vacio}</p>
          {!busqueda && textos.detalle && <p className="mt-1 text-sm text-neutro-500">{textos.detalle}</p>}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {facturas.map((factura) => (
            <TarjetaFactura key={factura.alegra_id} factura={factura} onAbrir={onAbrir} />
          ))}
        </div>
      )}
    </div>
  )
}
