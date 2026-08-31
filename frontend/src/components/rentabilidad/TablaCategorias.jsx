import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Desglose por categoría: cuántos productos de cada clasificación tiene, y
 * la mediana de margen real de la categoría (no el promedio — un par de
 * outliers absurdos por unidad sospechosa distorsionaría un promedio).
 * Click en una categoría filtra la lista de productos de abajo.
 *
 * Colapsado por defecto: son 18 filas × 6 columnas numéricas que empujaban
 * la lista de productos (lo accionable) fuera de la primera pantalla. Es
 * material de consulta, no lo primero que hay que ver.
 *
 * Tabla en desktop, cards en móvil — 6 columnas numéricas no entran en
 * 375px sin apretar los nombres de categoría ni forzar scroll horizontal
 * dentro de la tarjeta (mismo criterio que TablaProductos.jsx).
 */
export default function TablaCategorias({ categorias, filtros, setFiltros }) {
  const [abierto, setAbierto] = useState(false)

  if (!categorias || categorias.length === 0) return null

  const seleccionar = (categoria) => {
    setFiltros((prev) => ({ ...prev, categoria: prev.categoria === categoria ? 'todas' : categoria }))
  }

  const hayCategoriaFiltrada = filtros.categoria !== 'todas'

  return (
    <div className="card">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <h2 className="text-base font-semibold text-neutro-900 flex items-center gap-1.5">
          {abierto ? <ChevronDown size={16} className="text-neutro-400" /> : <ChevronRight size={16} className="text-neutro-400" />}
          Por categoría
          <span className="text-neutro-400 font-normal">({categorias.length})</span>
        </h2>
        {hayCategoriaFiltrada && (
          <span className="text-xs bg-nota-100 text-nota-700 px-2 py-0.5 rounded-full font-medium">
            {filtros.categoria}
          </span>
        )}
      </button>

      {!abierto ? null : (
      <div className="mt-3">
      {/* Mobile: cards */}
      <div className="block sm:hidden divide-y divide-neutro-100">
        {categorias.map((c) => (
          <button
            key={c.categoria}
            onClick={() => seleccionar(c.categoria)}
            className={`w-full text-left py-3 ${filtros.categoria === c.categoria ? 'bg-nota-50' : ''}`}
          >
            <div className="flex justify-between items-center">
              <span className="font-medium text-neutro-800">{c.categoria}</span>
              <span className="text-xs text-neutro-500">{c.total} productos</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs">
              {c.sinCosto > 0 && <span className="text-neutro-500">Sin costo: <strong>{c.sinCosto}</strong></span>}
              {c.unidadSospechosa > 0 && <span className="text-alerta-600">Sospechoso: <strong>{c.unidadSospechosa}</strong></span>}
              {c.margenNegativo > 0 && <span className="text-peligro-600">Negativo: <strong>{c.margenNegativo}</strong></span>}
              <span className="text-neutro-700 ml-auto">
                Margen mediana: <strong>{c.margenMediana !== null ? `${c.margenMediana.toFixed(1)}%` : '—'}</strong>
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutro-500 border-b border-neutro-100">
              <th className="pb-2 font-medium">Categoría</th>
              <th className="pb-2 font-medium text-right">Total</th>
              <th className="pb-2 font-medium text-right">Sin costo</th>
              <th className="pb-2 font-medium text-right">Sospechoso</th>
              <th className="pb-2 font-medium text-right">Negativo</th>
              <th className="pb-2 font-medium text-right">Margen mediana</th>
            </tr>
          </thead>
          <tbody>
            {categorias.map((c) => (
              <tr
                key={c.categoria}
                onClick={() => seleccionar(c.categoria)}
                className={`border-b border-neutro-50 last:border-0 cursor-pointer hover:bg-neutro-50 transition ${filtros.categoria === c.categoria ? 'bg-nota-50' : ''}`}
              >
                <td className="py-2 font-medium text-neutro-800">{c.categoria}</td>
                <td className="py-2 text-right text-neutro-600">{c.total}</td>
                <td className="py-2 text-right text-neutro-500">{c.sinCosto || ''}</td>
                <td className="py-2 text-right text-alerta-600">{c.unidadSospechosa || ''}</td>
                <td className="py-2 text-right text-peligro-600">{c.margenNegativo || ''}</td>
                <td className="py-2 text-right font-medium text-neutro-800">
                  {c.margenMediana !== null ? `${c.margenMediana.toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      )}
    </div>
  )
}
