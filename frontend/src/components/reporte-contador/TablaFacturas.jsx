import { useMemo, useState } from 'react'
import { Search, Loader2, Download, RefreshCw, ListChecks, FileX2, Mail } from 'lucide-react'
import FilaFactura from './FilaFactura'

export default function TablaFacturas({
  tipo, detalle, loading, onToggleFactura, onEditarLinea, onEliminarLinea, onRedetectar, onExportar, onEnviarContador
}) {
  const [busqueda, setBusqueda] = useState('')
  const [soloMarcadas, setSoloMarcadas] = useState(false)

  const facturas = detalle?.facturas || []

  const filtradas = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    return facturas.filter(f => {
      if (soloMarcadas && !f.duplicadoConfianza) return false
      if (!term) return true
      return f.numero.toLowerCase().includes(term) || f.contraparte.toLowerCase().includes(term)
    })
  }, [facturas, busqueda, soloMarcadas])

  if (loading) {
    return <div className="card p-12 text-center text-neutro-400 flex flex-col items-center gap-3">
      <Loader2 size={28} className="animate-spin text-primario-500" />
      <span>Cargando...</span>
    </div>
  }

  if (!detalle) {
    return <div className="card p-12 text-center text-neutro-400 flex flex-col items-center gap-3">
      <FileX2 size={36} className="text-neutro-300" />
      <p>Todavía no subiste el Excel de {tipo === 'ventas' ? 'ventas' : 'compras'} de este mes.</p>
    </div>
  }

  const marcadas = facturas.filter(f => f.duplicadoConfianza).length

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-neutro-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutro-900">
            {/* Las notas de crédito se cuentan aparte: sumarlas al total de
                facturas daba un número que no cuadraba con el de Alegra. */}
            {detalle.resumen.totalFacturas} factura{detalle.resumen.totalFacturas === 1 ? '' : 's'}
            {detalle.resumen.totalDevoluciones > 0 && (
              <span className="text-nota-600 font-normal"> · {detalle.resumen.totalDevoluciones} nota{detalle.resumen.totalDevoluciones === 1 ? '' : 's'} de crédito</span>
            )}
            {detalle.resumen.facturasExcluidas > 0 && (
              <span className="text-neutro-400 font-normal"> · {detalle.resumen.facturasExcluidas} excluida{detalle.resumen.facturasExcluidas === 1 ? '' : 's'}</span>
            )}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {tipo === 'ventas' && (
            <button onClick={onRedetectar} title="Volver a buscar duplicados" className="text-xs text-neutro-500 hover:text-primario-600 flex items-center gap-1.5 border border-neutro-200 rounded-lg px-2.5 py-1.5">
              <RefreshCw size={13} /> Redetectar
            </button>
          )}
          <button onClick={onExportar} className="text-xs text-neutro-600 hover:text-primario-600 flex items-center gap-1.5 border border-neutro-200 rounded-lg px-2.5 py-1.5">
            <Download size={13} /> Exportar Excel
          </button>
          {/* Enviar es la acción final del flujo, así que se queda con el
              énfasis; exportar pasa a ser secundaria. */}
          <button onClick={onEnviarContador} className="btn btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1.5">
            <Mail size={13} /> Enviar al contador
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-5 py-2.5 border-b border-neutro-100 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
          <input
            type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por número o cliente/proveedor..."
            className="input pl-8 w-full !py-1.5 !text-sm"
          />
        </div>
        {tipo === 'ventas' && marcadas > 0 && (
          <button
            onClick={() => setSoloMarcadas(v => !v)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border flex items-center gap-1.5 whitespace-nowrap ${
              soloMarcadas ? 'bg-peligro-50 border-peligro-200 text-peligro-700' : 'border-neutro-200 text-neutro-500'
            }`}
          >
            <ListChecks size={13} /> Solo marcadas ({marcadas})
          </button>
        )}
      </div>

      {filtradas.length === 0 ? (
        <p className="p-8 text-center text-sm text-neutro-400">Ninguna factura coincide con el filtro.</p>
      ) : (
        <div className="max-h-[32rem] overflow-y-auto">
          {filtradas.map(f => (
            <FilaFactura
              key={f.numero}
              factura={f}
              onToggle={onToggleFactura}
              onEditarLinea={onEditarLinea}
              onEliminarLinea={onEliminarLinea}
            />
          ))}
        </div>
      )}
    </div>
  )
}
