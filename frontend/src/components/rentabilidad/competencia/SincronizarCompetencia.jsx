import { useState } from 'react'
import { RefreshCw, Loader2, AlertTriangle } from 'lucide-react'

const LIMITE_MAXIMO = 15

/**
 * Dispara una sincronización acotada contra EPA/Walmart/Mas x Menos desde
 * la UI (POST /rentabilidad/competencia/sincronizar). A propósito limitada
 * a 15 productos por click — 1 producto × 3 fuentes × 2s de rate-limit ya
 * son 6-9s, así que 15 productos pueden tardar hasta ~2 minutos. Para
 * lotes grandes existe backend/scripts/sincronizar-competencia.js aparte.
 */
export default function SincronizarCompetencia({ categorias, onSincronizar, sincronizando, resultado }) {
  const [categoria, setCategoria] = useState('todas')
  const [limite, setLimite] = useState(LIMITE_MAXIMO)

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-neutro-900 mb-1">Sincronizar contra la competencia</h2>
      <p className="text-xs text-neutro-500 mb-4">
        Busca los productos de mayor facturación en EPA, Walmart CR y Mas x Menos. Hasta {LIMITE_MAXIMO} productos por vez, puede tardar hasta ~2 minutos.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <select className="input sm:w-56" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="todas">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.categoria} value={c.categoria}>{c.categoria} ({c.total})</option>
          ))}
        </select>

        <input
          type="number"
          min={1}
          max={LIMITE_MAXIMO}
          className="input sm:w-32"
          value={limite}
          onChange={(e) => setLimite(Math.min(LIMITE_MAXIMO, Math.max(1, parseInt(e.target.value, 10) || 1)))}
        />

        <button
          onClick={() => onSincronizar({ categoria, limite })}
          disabled={sincronizando}
          className="btn btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {sincronizando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Sincronizar
        </button>
      </div>

      {resultado && (
        <div className="mt-4 text-sm bg-neutro-50 rounded-xl p-3 space-y-1">
          <p className="text-neutro-700">
            Consultados <strong>{resultado.productosConsultados}</strong> productos · <strong>{resultado.capturas}</strong> precios capturados · <strong>{resultado.sugerenciasGeneradas}</strong> sugerencias nuevas
          </p>
          {resultado.bloqueos?.length > 0 && (
            <p className="text-alerta-600 flex items-center gap-1.5">
              <AlertTriangle size={14} />
              Bloqueado por: {resultado.bloqueos.map(b => `${b.fuente} (${b.status})`).join(', ')} — se detuvo esa fuente para no insistir.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
