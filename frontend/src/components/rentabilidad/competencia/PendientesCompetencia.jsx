import { useMemo, useState } from 'react'
import { Loader2, ClipboardCheck, Search } from 'lucide-react'
import TarjetaComparacion from './TarjetaComparacion'
import { fuenteLabel } from '../../../utils/competenciaUtils'

/**
 * Cola de revisión de emparejamientos. NINGUNO se auto-confirma (ver
 * backend/.../competencia/emparejador.js) — acá una persona mira las dos
 * fotos y decide. El orden viene del backend por score descendente.
 */
export default function PendientesCompetencia({ pendientes, loading, enCurso, onConfirmar, onRechazar }) {
  const [fuente, setFuente] = useState('todas')
  const [busqueda, setBusqueda] = useState('')

  const fuentesDisponibles = useMemo(
    () => [...new Set(pendientes.map(p => p.fuente))].sort(),
    [pendientes]
  )

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    return pendientes.filter(p => {
      if (fuente !== 'todas' && p.fuente !== fuente) return false
      if (!termino) return true
      return p.nombreExterno.toLowerCase().includes(termino) ||
             p.sugerido.nombre.toLowerCase().includes(termino)
    })
  }, [pendientes, fuente, busqueda])

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutro-900">
            Por revisar {pendientes.length > 0 && <span className="text-neutro-400 font-normal">({pendientes.length})</span>}
          </h2>
          <p className="text-xs text-neutro-500">Compará las dos fotos y decidí si es el mismo producto.</p>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 gap-2 sm:justify-end">
          <div className="relative sm:flex-1 sm:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
            <input
              type="text"
              className="input pl-9 w-full !py-2"
              placeholder="Buscar producto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <select className="input !py-2 sm:w-44" value={fuente} onChange={(e) => setFuente(e.target.value)}>
            <option value="todas">Todas las fuentes</option>
            {fuentesDisponibles.map(f => (
              <option key={f} value={f}>{fuenteLabel(f)}</option>
            ))}
          </select>
          {loading && <Loader2 size={18} className="animate-spin text-nota-500 self-center" />}
        </div>
      </div>

      {!loading && visibles.length === 0 ? (
        <div className="card p-12 text-center text-neutro-400 flex flex-col items-center gap-3">
          <ClipboardCheck size={40} className="text-neutro-300" />
          <p>
            {pendientes.length === 0
              ? 'No hay nada por revisar. Sincronizá o importá una lista desde "Agregar datos".'
              : 'Ningún pendiente coincide con este filtro.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibles.map((s) => (
            <TarjetaComparacion
              key={`${s.fuente}::${s.skuExterno}`}
              sugerencia={s}
              ocupado={enCurso.has(`${s.fuente}::${s.skuExterno}`)}
              onConfirmar={onConfirmar}
              onRechazar={onRechazar}
            />
          ))}
        </div>
      )}
    </div>
  )
}
