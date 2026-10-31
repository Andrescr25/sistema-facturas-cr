const COMUNES = [7, 15, 22, 30]
const OPCION = 'flex min-h-11 items-center justify-center rounded-xl border-2 px-3 text-sm font-bold transition-colors'

/**
 * Cada cuántos días se visita: las de siempre de un toque, u otra escrita
 * (2026-10-29). Lo usan «Cambiar rotación» y «Cliente nuevo».
 */
export default function ElegirRotacion({ dias, onCambiar }) {
  const n = Number(dias)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {COMUNES.map(d => (
          <button key={d} type="button" aria-pressed={n === d} onClick={() => onCambiar(String(d))}
            className={`${OPCION} ${n === d ? 'border-primario-500 bg-primario-50 text-primario-900' : 'border-neutro-200 bg-white text-neutro-700 hover:border-neutro-300'}`}>
            {d}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-3 text-sm font-semibold text-neutro-700">
        Otro:
        <input type="number" min="1" max="365" step="1" inputMode="numeric" aria-label="Días de rotación" value={dias}
          onChange={e => onCambiar(e.target.value)} className="input h-11 w-28" />
        días
      </label>
    </div>
  )
}
