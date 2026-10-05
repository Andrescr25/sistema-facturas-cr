export const textoCiclo = c => c ? `${c.rutaNombre} · Semana ${c.semana.split('-').reverse().join('/')}` : 'Sin ciclo'
const ESTADO = { preventa: 'Preventa anticipada', preparacion: 'En preparación', entrega: 'En entrega' }

/** Una semana se elige explícitamente: la ruta actual del cliente puede cambiar. */
export default function SelectorCiclo({ ciclos, valor, onChange, cargando = false, error = '', disabled = false }) {
  const elegido = ciclos.find(c => String(c.id) === valor)
  return <div className="space-y-1">
    <label className="block text-xs font-bold text-neutro-600">
      Ruta y semana del pedido
      <select aria-label="Ruta y semana del pedido" value={valor} onChange={e => onChange(e.target.value)}
        disabled={disabled || cargando} className="mt-1 w-full min-h-11 rounded-xl border-2 border-neutro-200 bg-white px-3 py-2 text-sm text-neutro-900 disabled:bg-neutro-50">
        <option value="">Seleccioná la ruta y semana</option>
        <option value="sin-ciclo">Sin ciclo</option>
        {ciclos.map(c => <option key={c.id} value={String(c.id)}>{textoCiclo(c)} · {ESTADO[c.estado] || c.estado || 'Contexto conservado'}</option>)}
      </select>
    </label>
    {/* El nombre puede ocupar todo el select en un teléfono. La semana debe
        seguir visible sin abrirlo, aunque la ruta tenga un nombre largo. */}
    {elegido && <p className="text-xs font-semibold text-primario-700">Semana {elegido.semana.split('-').reverse().join('/')} · {ESTADO[elegido.estado] || 'Contexto conservado'}</p>}
    {cargando && <p className="text-xs text-neutro-500">Consultando semanas disponibles…</p>}
    {error && <p role="alert" className="text-xs text-peligro-700">{error}</p>}
  </div>
}
