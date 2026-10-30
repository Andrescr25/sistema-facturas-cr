import Boton from '../ui/Boton'
import { puedeAccion } from '../../utils/modulos'
import { useAuth } from '../../contexts/AuthContext'

export default function FiltrosAgenda({ agenda: a }) {
  // Sin «Ver todas las rutas» (el agente): solo las suyas, sin «Clientes sin ruta».
  const { usuario } = useAuth()
  const todas = puedeAccion(usuario, 'rutas-todas')
  return (
    <div className="card space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-neutro-700">
          <span>Ruta de visita</span>
          <select aria-label="Ruta de visita" value={a.rutaId} onChange={e => a.cambiarRuta(e.target.value)} className="input w-full">
            <option value="">Seleccioná una ruta</option>
            {todas && <option value="sin-ruta">Clientes sin ruta</option>}
            {a.rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}{r.activo ? '' : ' (inactiva)'}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold text-neutro-700">
          <span>Buscar cliente</span>
          <input aria-label="Buscar cliente" type="search" className="input w-full" value={a.filtros.buscar}
            onChange={e => a.setFiltros(f => ({ ...f, buscar: e.target.value }))} placeholder="Nombre del cliente" disabled={!a.rutaId} />
        </label>
      </div>
      {a.cargandoRutas && <p className="text-sm text-neutro-500" role="status">Consultando rutas…</p>}
      {!todas && !a.cargandoRutas && !a.errorRutas && a.rutas.length === 0 && (
        <p className="rounded-xl bg-nota-50 p-3 text-sm text-nota-700" role="status">
          Todavía no tiene rutas asignadas. Pídale a un administrador que se las marque en Usuarios.
        </p>
      )}
      {a.errorRutas && <div className="flex flex-wrap items-center gap-3 text-sm text-peligro-700" role="alert">
        <p>{a.errorRutas}</p><Boton variante="secundario" tamano="sm" onClick={a.recargarRutas}>Reintentar rutas</Boton>
      </div>}
      <p className="text-sm text-neutro-500">Todos los clientes activos de la ruta, ordenados por próxima visita. La frecuencia se configura en Clientes.</p>
    </div>
  )
}
