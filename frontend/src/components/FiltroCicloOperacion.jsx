import { textoCiclo } from './SelectorCiclo'
const ESTADOS = { preventa: 'Preventa anticipada', preparacion: 'En preparación', entrega: 'En entrega', cerrado: 'Cerrado', cancelado: 'Cancelado' }

export default function FiltroCicloOperacion({ filtro, disabled = false, requiereCiclo = false, titulo }) {
  const rutas = [...new Map(filtro.ciclos.map(c => [c.rutaId, c.rutaNombre])).entries()]
  const ciclos = filtro.ciclos.filter(c => !filtro.rutaId || String(c.rutaId) === filtro.rutaId)
  const rutaElegida = rutas.find(([id]) => String(id) === filtro.rutaId)
  const elegido = filtro.ciclos.find(c => String(c.id) === filtro.cicloId)
  const select = 'mt-1 w-full min-w-0 rounded-xl border-2 border-neutro-200 bg-white px-3 py-3 text-sm'
  return <div className={`mb-5 rounded-2xl border border-neutro-200 ${titulo ? 'bg-white p-5' : 'bg-neutro-50 p-4'}`}>
    {titulo && <h2 className="mb-4 text-base font-bold text-neutro-800">{titulo}</h2>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="min-w-0 text-sm font-semibold">Ruta
        <select aria-label="Filtrar ruta" value={filtro.rutaId} disabled={disabled} onChange={e => filtro.cambiarRuta(e.target.value)} className={select}>
          <option value="">Todas las rutas</option>
          {rutas.map(([id, nombre]) => <option key={id} value={String(id)}>{nombre}</option>)}
        </select>
      </label>
      <label className="min-w-0 text-sm font-semibold">Semana / ciclo
        <select aria-label="Filtrar semana o ciclo" value={filtro.cicloId} disabled={disabled} onChange={e => filtro.cambiarCiclo(e.target.value)} className={select}>
          <option value="">{requiereCiclo?'Seleccioná una semana':'Todos los ciclos'}</option>
          <option value="sin-ciclo">Sin ciclo</option>
          {ciclos.map(c => <option key={c.id} value={String(c.id)}>{textoCiclo(c)} · {ESTADOS[c.estado]}</option>)}
        </select>
      </label>
    </div>
    <p className="mt-2 break-words text-sm font-semibold text-primario-700" aria-live="polite">
      {elegido ? `${textoCiclo(elegido)} · ${ESTADOS[elegido.estado]}` : filtro.cicloId === 'sin-ciclo' ? 'Sin ciclo: documentos sin semana asignada' : rutaElegida?`${rutaElegida[1]} · ${requiereCiclo?'Seleccioná una semana':'Todos los ciclos; contexto propio en cada documento'}`:requiereCiclo?'Seleccioná la semana del recorrido':'Vista conjunta: cada documento conserva su ruta y semana'}
    </p>
    {filtro.error && <p role="alert" className="mt-2 text-sm text-peligro-700">{filtro.error}</p>}
  </div>
}
