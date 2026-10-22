import { Check, X } from 'lucide-react'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import { categoriaGasto } from '../../utils/gastosOperativos'
import { fechaCorta } from '../../utils/fechaCR'
import { formatearMoneda } from '../../utils/moneda'

export default function GastosPorAprobar({ estado: e }) {
  if (!e.cargando && !e.total && !e.error && !e.aviso) return null
  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-neutro-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-neutro-100 p-4"><h2 className="font-bold text-neutro-900">Gastos por aprobar</h2><Insignia tono="alerta">{e.total} pendientes</Insignia></div>
      {e.error && !e.seleccion && <p role="alert" className="p-4 text-sm text-peligro-700">{e.error}</p>}
      {e.aviso && <p role="status" className="bg-exito-50 p-4 text-sm text-exito-800">{e.aviso}</p>}
      {e.cargando ? <p className="p-4 text-sm text-neutro-500">Cargando gastos…</p> : <div className="divide-y divide-neutro-100">{e.gastos.map(g => <div key={g.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0 flex-1"><p className="break-words font-bold text-neutro-900">{g.proveedor_nombre}</p><p className="mt-1 text-sm text-neutro-500">{categoriaGasto(g.categoria)} · {fechaCorta(g.fecha_emision)}</p><p className="mt-1 break-all text-xs text-neutro-400">Factura {g.numero_consecutivo}</p></div>
        <p className="font-extrabold text-neutro-900">{formatearMoneda(g.total_factura, g.moneda)}</p>
        <div className="flex w-full gap-2 sm:w-auto"><Boton className="flex-1" onClick={() => e.abrir(g, 'aprobar')}><Check size={16} /> Aprobar</Boton><Boton variante="secundario" className="flex-1" onClick={() => e.abrir(g, 'rechazar')}><X size={16} /> Rechazar</Boton></div>
      </div>)}</div>}
      {e.total > 30 && <div className="flex items-center justify-between gap-2 border-t border-neutro-100 p-3"><span className="text-sm text-neutro-500">Página {e.pagina}</span><div className="flex gap-2"><Boton variante="secundario" disabled={e.pagina <= 1 || e.cargando} onClick={() => e.setPagina(e.pagina - 1)}>Anterior</Boton><Boton variante="secundario" disabled={e.pagina * 30 >= e.total || e.cargando} onClick={() => e.setPagina(e.pagina + 1)}>Siguiente</Boton></div></div>}
    </section>
  )
}
