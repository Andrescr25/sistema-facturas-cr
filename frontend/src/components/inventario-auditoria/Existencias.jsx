import { useEffect, useState } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import { getExistencias } from '../../services/inventarioService'
import { formatCurrency, formatCantidad as cantidad } from '../../utils/inventarioAuditoriaUtils'
import DetalleKardex from './DetalleKardex'

/** Vista de stock propio. Los ceros no se presentan como un conteo físico. */
export default function Existencias() {
  const [q, setQ] = useState('')
  const [soloBajo, setSoloBajo] = useState(false)
  const [start, setStart] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [seleccionado, setSeleccionado] = useState(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let activo = true
    setLoading(true)
    const timer = setTimeout(() => {
      getExistencias({ q, soloBajo, start, limit: 50 }).then(r => { if (activo) { setData(r.data); setError('') } })
        .catch(e => { if (activo) setError(e.response?.data?.message || 'No se pudieron cargar las existencias.') })
        .finally(() => { if (activo) setLoading(false) })
    }, 250)
    return () => { activo = false; clearTimeout(timer) }
  }, [q, soloBajo, start, version])
  return <section className="bg-white border rounded-2xl p-4 space-y-4">
    <div className="flex flex-wrap gap-3 items-center">
      <label className="flex items-center border rounded-xl px-3 gap-2 flex-1 min-w-48"><Search size={18} /><input aria-label="Buscar existencias por nombre o referencia" placeholder="Nombre o referencia" className="py-2 w-full outline-none" value={q} onChange={e => { setQ(e.target.value); setStart(0) }} /></label>
      <label className="text-sm flex gap-2"><input type="checkbox" checked={soloBajo} onChange={e => { setSoloBajo(e.target.checked); setStart(0) }} />Bajo el mínimo</label>
      <button aria-label="Actualizar existencias" onClick={() => setVersion(v => v+1)}><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
    </div>
    {error && <p role="alert" className="text-peligro-700">{error}</p>}
    {loading && <p className="text-sm text-neutro-500">Cargando existencias...</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b"><th className="p-2">Producto</th><th className="p-2">Existencias</th><th className="p-2">Costo promedio</th><th className="p-2">Mínimo / objetivo</th><th className="p-2">Sugerido</th><th className="p-2">Detalle</th></tr></thead><tbody>
      {data?.productos.map(p => <tr key={p.producto_id} className="border-b"><td className="p-2"><strong>{p.nombre}</strong><p className="text-xs text-neutro-500">{p.referencia} · {p.categoria || 'Sin categoría'}</p>{!p.conteo_confirmado && <p className="text-xs text-alerta-700">Pendiente conteo físico</p>}</td><td className={`p-2 font-bold ${Number(p.existencia)<0 ? 'text-peligro-700' : ''}`}>{cantidad(p.existencia)}</td><td className="p-2 whitespace-nowrap">{p.costo_promedio == null ? 'Sin valorar' : formatCurrency(p.costo_promedio)}</td><td className="p-2">{cantidad(p.stock_minimo)} / {cantidad(p.stock_objetivo)}</td><td className="p-2">{p.stock_bajo ? cantidad(p.cantidad_sugerida) : '—'}</td><td className="p-2"><button className="text-primario-700 font-bold" onClick={() => setSeleccionado(p.producto_id)}>Kardex y mínimos</button></td></tr>)}
    </tbody></table></div>
    {!loading && data && !data.productos.length && <p className="text-neutro-500">No hay productos con estos filtros.</p>}
    <div className="flex justify-between text-sm"><button disabled={!start || loading} onClick={() => setStart(v => Math.max(0,v-50))}>Anterior</button><span>{start+1}–{start+(data?.productos.length || 0)}</span><button disabled={loading || (data?.productos.length || 0)<50} onClick={() => setStart(v => v+50)}>Siguiente</button></div>
    {seleccionado && <DetalleKardex productoId={seleccionado} onCerrar={() => setSeleccionado(null)} onGuardado={() => setVersion(v => v+1)} />}
  </section>
}
