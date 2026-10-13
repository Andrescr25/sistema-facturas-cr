import Boton from '../ui/Boton'

export default function FiltrosAgenda({ agenda: a }) {
  return (
    <div className="card space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-neutro-700">
          <span>Ruta de visita</span>
          <select aria-label="Ruta de visita" value={a.rutaId} onChange={e => a.cambiarRuta(e.target.value)} className="input w-full">
            <option value="">Seleccioná una ruta</option>
            <option value="sin-ruta">Clientes sin ruta</option>
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
      {a.errorRutas && <div className="flex flex-wrap items-center gap-3 text-sm text-peligro-700" role="alert">
        <p>{a.errorRutas}</p><Boton variante="secundario" tamano="sm" onClick={a.recargarRutas}>Reintentar rutas</Boton>
      </div>}
      <p className="text-sm text-neutro-500">Todos los clientes activos de la ruta, ordenados por próxima visita. La frecuencia se configura en Clientes.</p>
    </div>
  )
}
