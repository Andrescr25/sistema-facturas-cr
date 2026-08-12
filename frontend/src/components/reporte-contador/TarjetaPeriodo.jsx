import { useRef } from 'react'
import { Upload, Loader2, FileSpreadsheet, Trash2, RefreshCw, DownloadCloud } from 'lucide-react'
import { formatCurrency, formatFecha } from '../../utils/reporteContadorUtils'

/**
 * Tarjeta de un tipo de reporte (ventas o compras).
 *
 * El camino principal es traerlo de Alegra por API — se verificó contra el
 * Excel oficial de julio 2026 que da los mismos totales al colón. La subida
 * manual del .xlsx queda como respaldo por si la API falla o se necesita un
 * archivo puntual.
 */
export default function TarjetaPeriodo({ tipo, periodo, subiendo, onSubir, onImportar, onEliminar }) {
  const inputRef = useRef(null)
  const label = tipo === 'ventas' ? 'Ventas' : 'Compras'

  const handleFile = (e) => {
    const archivo = e.target.files?.[0]
    if (archivo) onSubir(tipo, archivo)
    e.target.value = ''
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <FileSpreadsheet size={17} className="text-blue-600" />
          {label}
        </h3>
        {periodo && (
          <button
            onClick={() => onEliminar(periodo.id, tipo)}
            title="Eliminar y volver a subir"
            className="p-1.5 text-gray-300 hover:text-red-600 transition"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {!periodo ? (
        <div className="space-y-2">
          <button
            onClick={() => onImportar(tipo)}
            disabled={subiendo === tipo}
            className="w-full btn btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {subiendo === tipo ? <Loader2 size={16} className="animate-spin" /> : <DownloadCloud size={16} />}
            {subiendo === tipo ? 'Trayendo de Alegra...' : 'Traer de Alegra'}
          </button>
          <label className="flex items-center justify-center gap-1.5 border border-dashed border-gray-200 rounded-lg py-2 cursor-pointer hover:border-blue-300 transition text-xs text-gray-400">
            <Upload size={13} />
            o subir el .xlsx a mano
            <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} disabled={subiendo === tipo} />
          </label>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-gray-400">Base gravable (original)</span>
            <span className="text-sm font-semibold text-gray-800">{formatCurrency(periodo.baseGravableOriginal)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-gray-400">Impuesto (original)</span>
            <span className="text-sm font-semibold text-gray-800">{formatCurrency(periodo.impuestoOriginal)}</span>
          </div>
          {/* Las devoluciones van aparte, no restadas de la base — así las
              presenta el resumen oficial de Alegra. */}
          {periodo.baseDevolucionesOriginal > 0 && (
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-purple-500">Devoluciones (notas de crédito)</span>
              <span className="text-sm font-semibold text-purple-700">
                {formatCurrency(periodo.baseDevolucionesOriginal)}
              </span>
            </div>
          )}
          <p className="text-[11px] text-gray-400 truncate" title={periodo.nombreArchivo}>
            {periodo.nombreArchivo} · {formatFecha(periodo.fechaCarga)}
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => onImportar(tipo)}
              disabled={subiendo === tipo}
              title="Vuelve a traerlo de Alegra (descarta las ediciones de este mes)"
              className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50 transition text-xs text-gray-500 disabled:opacity-50"
            >
              {subiendo === tipo ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Volver a traer
            </button>
            <label className="flex items-center justify-center gap-1.5 border border-gray-200 rounded-lg py-1.5 px-3 cursor-pointer hover:bg-gray-50 transition text-xs text-gray-400">
              <Upload size={13} />
              .xlsx
              <input type="file" accept=".xlsx" className="hidden" onChange={handleFile} disabled={subiendo === tipo} />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
