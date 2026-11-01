import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useClientesDeRuta } from '../../hooks/useClientesDeRuta'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import { visitaEnPalabras } from '../../utils/rotacionTexto'
import { normalizarBusqueda } from '../../utils/reporteClientesUtils'

/**
 * Agregar clientes a «Mi día» (2026-11-01), de cualquiera de sus rutas: el
 * usuario decidió un plan por día, no por ruta. Salen en el orden de la agenda
 * (los que más urgen primero); los que ya están en su día no se ofrecen.
 */
export default function ModalAgregarAlPlan({ rutas, rutaInicial, enPlan, hoy, onAgregar, onCerrar }) {
  const [rutaId, setRutaId] = useState(String(rutaInicial || rutas[0]?.id || ''))
  const { clientes, error: errorRuta } = useClientesDeRuta(rutaId)
  const [buscar, setBuscar] = useState('')
  const [elegidos, setElegidos] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const palabras = normalizarBusqueda(buscar).split(/\s+/).filter(Boolean)
  const visibles = (clientes || []).filter(c => !enPlan.has(c.id) && palabras.every(p => normalizarBusqueda(c.nombre).includes(p)))
  const alternar = (id) => setElegidos(x => (x.includes(id) ? x.filter(y => y !== id) : [...x, id]))

  const confirmar = async () => {
    setGuardando(true); setError('')
    const bien = await onAgregar(elegidos)
    setGuardando(false)
    if (bien) onCerrar()
  }

  return (
    <Modal titulo="Agregar a mi día" ancho="lg" onCerrar={guardando ? () => {} : onCerrar} pie={(
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
        <Boton icono={Plus} onClick={confirmar} cargando={guardando} disabled={!elegidos.length}>Agregar{elegidos.length ? ` (${elegidos.length})` : ''}</Boton>
      </div>
    )}>
      <div className="space-y-3 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-neutro-700">
            <span className="block">Ruta</span>
            <select aria-label="Ruta" value={rutaId} onChange={e => setRutaId(e.target.value)} className="input w-full">
              {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-neutro-700">
            <span className="block">Buscar</span>
            <input type="search" aria-label="Buscar cliente" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Nombre del cliente" className="input w-full" />
          </label>
        </div>
        {(error || errorRuta) && <p role="alert" className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error || errorRuta}</p>}
        {clientes === null && <p role="status" className="p-3 text-sm text-neutro-500">Consultando la ruta…</p>}
        {clientes && visibles.length === 0 && <p className="p-3 text-sm text-neutro-500">{clientes.length ? 'Todos los de esta ruta ya están en tu día (o no coinciden con la búsqueda).' : 'Esta ruta no tiene clientes activos.'}</p>}
        <ul className="space-y-2">
          {visibles.map(c => {
            const estado = visitaEnPalabras(c.rotacion, hoy)
            const elegido = elegidos.includes(c.id)
            return (
              <li key={c.id}>
                <label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 ${elegido ? 'border-primario-500 bg-primario-50' : 'border-neutro-200 bg-white'}`}>
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={elegido} onChange={() => alternar(c.id)} aria-label={`Agregar a ${c.nombre}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-semibold text-neutro-900">{c.nombre}</span>
                    <span className="text-xs text-neutro-500">{estado.cuando}</span>
                  </span>
                  <Insignia tono={estado.tono}>{estado.etiqueta}</Insignia>
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
