import Boton from '../ui/Boton'

export default function FiltroRutaEntrega({ filtro: f }) {
  return <div className="card space-y-3 p-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-sm font-semibold text-neutro-700"><span>Ruta de entrega</span>
        <select aria-label="Ruta de entrega" className="input w-full" value={f.rutaId} onChange={e => f.cambiarRuta(e.target.value)}>
          <option value="">Seleccioná una ruta</option><option value="sin-ruta">Sin ruta</option>
          {f.rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}{r.activo ? '' : ' (inactiva)'}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-sm font-semibold text-neutro-700"><span>Facturas</span>
        <select aria-label="Vista de facturas" className="input w-full" value={f.vista} onChange={e => f.cambiarVista(e.target.value)}>
          <option value="pendientes">Pendientes de entregar</option><option value="historial">Historial físico</option>
        </select>
      </label>
    </div>
    <p className="text-sm text-neutro-500">Se incluyen automáticamente todas las facturas pendientes de la ruta. Una carga registrada conserva la ruta de ese momento.</p>
    {f.errorRutas && <div role="alert" className="flex flex-wrap items-center gap-3 text-peligro-700"><p>{f.errorRutas}</p><Boton variante="secundario" onClick={f.reintentarRutas}>Reintentar rutas</Boton></div>}
  </div>
}
