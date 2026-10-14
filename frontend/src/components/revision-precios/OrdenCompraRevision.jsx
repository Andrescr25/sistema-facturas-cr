import Boton from '../ui/Boton'
import { formatDate } from '../../utils/pagos'

/** También exige elegir una única orden cuando su factura anterior aún
 * requiere revisión: esa incertidumbre nunca confirma otra compra sola. */
export default function OrdenCompraRevision({ consulta }) {
  if (consulta.error) return <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-peligro-700" role="alert">
    <span>No se pudo consultar la orden de compra: {consulta.error}</span>
    <Boton variante="secundario" tamano="sm" onClick={consulta.cargar}>Reintentar</Boton>
  </div>
  if (consulta.cargando) return <p className="mt-3 text-xs text-neutro-500">Consultando orden de compra…</p>
  if (consulta.vinculada) return <p className="mt-3 text-sm text-neutro-600">Orden de compra OC-{consulta.vinculada}</p>
  if (consulta.ordenes.length === 1 && !consulta.requiereSeleccion) return <p className="mt-3 text-sm text-neutro-600">Orden de compra {consulta.ordenes[0].referencia}</p>
  if (!consulta.requiereSeleccion) return null
  return <label className="mt-3 block text-sm font-semibold text-neutro-700">
    Orden de compra
    <select value={consulta.ordenId} onChange={e => consulta.setOrdenId(e.target.value)}
      className="mt-1 block min-h-11 w-full rounded-xl border border-neutro-300 bg-white px-3 text-neutro-900">
      <option value="">Elegí la orden que corresponde a esta factura</option>
      {consulta.ordenes.map(o => <option key={o.id} value={o.id}>{o.referencia} · {formatDate(o.enviadaEn)} · {o.totalProductos} productos{o.facturacion === 'parcial' ? ' · Facturada parcialmente' : o.facturacion === 'por_revisar' ? ' · Por revisar' : ''}</option>)}
    </select>
  </label>
}
