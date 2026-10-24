import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import Vacio from '../ui/Vacio'
import { SECCIONES_CONTADOR, etiquetaMovimiento, filtrarMovimientos } from '../../utils/reporteContadorUtils'
import { fechaCorta } from '../../utils/fechaCR'
import { formatearMoneda } from '../../utils/moneda'
export default function MovimientosMes({ estado: e }) {
  const [pagina, setPagina] = useState(1)
  useEffect(() => setPagina(1), [e.tab, e.buscar, e.datos])
  const filas = filtrarMovimientos(e.datos, e.tab, e.buscar)
  return (
    <section className="rounded-2xl border border-neutro-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Movimientos del mes">
          {SECCIONES_CONTADOR.map(({ id, titulo }) => (
            <button
              key={id}
              role="tab"
              aria-selected={e.tab === id}
              type="button"
              onClick={() => e.setTab(id)}
              className={`min-h-11 rounded-xl px-4 text-sm font-bold ${e.tab === id ? 'bg-primario-800 text-white' : 'bg-neutro-100 text-neutro-600'}`}
            >
              {titulo}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Buscar movimientos"
          className="input h-11 w-full sm:w-64"
          placeholder="Proveedor, cliente o factura"
          value={e.buscar}
          onChange={(v) => e.setBuscar(v.target.value)}
        />
      </div>
      {e.tab === 'gastos' && (
        <p className="mt-4 text-sm text-neutro-500">
          Incluye combustible y alimentación, también pendientes de revisión. El pago y la revisión
          tributaria se muestran por separado.
        </p>
      )}
      {!filas.length ? (
        <Vacio titulo="No hay movimientos en esta vista" />
      ) : (
        <div className="mt-4 divide-y divide-neutro-100">
          {filas.slice((pagina - 1) * 30, pagina * 30).map((d) => (
            <button
              type="button"
              key={d.identidad || d.id}
              onClick={() => e.setSeleccionado(d)}
              className="flex w-full items-center justify-between gap-3 py-4 text-left hover:bg-neutro-50"
            >
              <div className="min-w-0">
                <p className="break-words font-bold text-neutro-800">{d.contraparte}</p>
                <p className="mt-1 break-all text-xs text-neutro-500">
                  {fechaCorta(d.fecha)} · {d.numero}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Insignia tono="neutro">{etiquetaMovimiento(d)}</Insignia>
                  {d.revision && (
                    <Insignia tono={d.revision === 'Por revisar' ? 'alerta' : 'neutro'}>
                      {d.revision}
                    </Insignia>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`font-bold text-neutro-900 ${d.estado === 'anulada' ? 'line-through' : ''}`}
                >
                  {formatearMoneda(d.total, d.moneda)}
                </span>
                <ChevronRight size={17} className="text-neutro-400" />
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-2 text-xs text-neutro-500">
        <span>
          {filas.length} documentos · página {pagina}
        </span>
        <div className="flex gap-2">
          <Boton
            variante="secundario"
            disabled={pagina === 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </Boton>
          <Boton
            variante="secundario"
            disabled={pagina * 30 >= filas.length}
            onClick={() => setPagina((p) => p + 1)}
          >
            Siguiente
          </Boton>
        </div>
      </div>
    </section>
  )
}
