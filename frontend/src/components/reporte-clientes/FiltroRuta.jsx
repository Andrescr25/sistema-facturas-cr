import Boton from '../ui/Boton'

export default function FiltroRuta({ filtro }) {
  const nombre = filtro.rutas.find(r => String(r.id) === filtro.rutaId)?.nombre
  return (
    <div className="mb-5 rounded-2xl border border-neutro-200 bg-white p-5">
      <label className="block text-base font-semibold text-neutro-800">Ruta del cliente
        <select aria-label="Filtrar ruta" value={filtro.rutaId} onChange={e => filtro.cambiarRuta(e.target.value)}
          className="mt-2 min-h-12 w-full rounded-xl border-2 border-neutro-200 bg-white px-3 py-3 sm:max-w-md">
          <option value="">Todas las rutas</option>
          <option value="sin-ruta">Sin ruta asignada</option>
          {filtro.rutas.map(r => <option key={r.id} value={String(r.id)}>{r.nombre}{r.activo ? '' : ' (inactiva)'}</option>)}
        </select>
      </label>
      <p className="mt-3 text-sm text-neutro-600" aria-live="polite">
        {filtro.rutaId === 'sin-ruta' ? 'Clientes sin ruta asignada.' : nombre ? `Clientes de ${nombre}.` : 'Clientes de todas las rutas.'} Ordenados por próxima visita; las fichas sin fecha aparecen al final.
      </p>
      {filtro.cargando && <p role="status" className="mt-2 text-sm text-neutro-500">Consultando rutas…</p>}
      {filtro.error && <div role="alert" className="mt-3 text-sm text-peligro-700">
        <p>{filtro.error}</p><Boton variante="secundario" className="mt-2" onClick={filtro.reintentar}>Reintentar rutas</Boton>
      </div>}
    </div>
  )
}
