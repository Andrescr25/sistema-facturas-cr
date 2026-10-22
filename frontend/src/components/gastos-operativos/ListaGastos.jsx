import { ChevronRight, Receipt, Search } from 'lucide-react'
import EncabezadoPagina from '../ui/EncabezadoPagina'
import Insignia from '../ui/Insignia'
import Boton from '../ui/Boton'
import Vacio from '../ui/Vacio'
import { CATEGORIAS_GASTO, categoriaGasto, pagoDelGasto, estadoFiscalGasto } from '../../utils/gastosOperativos'
import { fechaCorta } from '../../utils/fechaCR'
import { formatearMoneda } from '../../utils/moneda'

export default function ListaGastos({ estado: e }) {
  return (
    <div className="mx-auto max-w-5xl">
      <EncabezadoPagina titulo="Gastos operativos" descripcion="Combustible, alimentación y viáticos con su comprobante y sus pagos." icono={Receipt} />
      <div className="mb-5 grid gap-3 rounded-2xl border border-neutro-200 bg-white p-4 sm:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <Search size={17} className="absolute left-3 top-3 text-neutro-400" />
          <input aria-label="Buscar gastos" className="input h-11 w-full pl-10" value={e.buscar} onChange={ev => e.setBuscar(ev.target.value)} placeholder="Proveedor, factura, empleado o placa" />
        </label>
        <select aria-label="Categoría del gasto" className="input h-11" value={e.categoria} onChange={ev => e.setCategoria(ev.target.value)}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS_GASTO.map(c => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
        </select>
        <select aria-label="Estado del gasto" className="input h-11" value={e.revision} onChange={ev => e.setRevision(ev.target.value)}>
          <option value="aprobado">Aprobados</option><option value="rechazado">Rechazados</option>
        </select>
      </div>
      {e.cargando ? <p className="py-12 text-center text-neutro-500">Cargando gastos…</p> : e.gastos.length === 0 ? (
        <Vacio icono={Receipt} titulo="No hay gastos en esta vista" descripcion="Los comprobantes nuevos se aprueban desde Revisión de Precios y luego aparecen aquí." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {e.gastos.map(g => {
            const pago = pagoDelGasto(g)
            const fiscal = estadoFiscalGasto(g)
            return (
              <button key={g.id} type="button" onClick={() => e.abrir(g.id)} className="rounded-2xl border border-neutro-200 bg-white p-5 text-left transition-colors hover:border-primario-300">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="break-words font-bold text-neutro-900">{g.proveedor_nombre}</p><p className="mt-1 text-xs text-neutro-500">{categoriaGasto(g.categoria)} · {fechaCorta(g.fecha_emision)}</p></div>
                  <ChevronRight size={18} className="shrink-0 text-neutro-400" />
                </div>
                <p className="mt-3 text-2xl font-extrabold text-neutro-900">{formatearMoneda(g.total_factura, g.moneda)}</p>
                <p className="mt-1 break-all text-xs text-neutro-500">Factura {g.numero_consecutivo}</p>
                {g.metodo_pago && <p className="mt-2 text-sm text-neutro-600">{g.metodo_pago}</p>}
                <div className="mt-4 flex flex-wrap gap-2"><Insignia tono={pago.tono}>{pago.texto}</Insignia><Insignia tono={fiscal.tono}>{fiscal.texto}</Insignia></div>
              </button>
            )
          })}
        </div>
      )}
      <div className="mt-5 flex items-center justify-between gap-3 text-sm text-neutro-500">
        <span>{e.total} gastos · página {e.pagina}</span>
        <div className="flex gap-2"><Boton variante="secundario" disabled={e.pagina <= 1 || e.cargando} onClick={() => e.setPagina(e.pagina - 1)}>Anterior</Boton><Boton variante="secundario" disabled={e.pagina * 30 >= e.total || e.cargando} onClick={() => e.setPagina(e.pagina + 1)}>Siguiente</Boton></div>
      </div>
    </div>
  )
}
