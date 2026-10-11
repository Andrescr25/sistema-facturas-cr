import { useEffect, useState } from 'react'
import { Search, RefreshCw, X } from 'lucide-react'
import { getExistencias, getKardex, guardarUmbrales } from '../../services/inventarioService'
import { formatCurrency, formatDate } from '../../utils/inventarioAuditoriaUtils'
import { useModal } from '../../hooks/useModal'

const cantidad = v => Number(v).toLocaleString('es-CR', { maximumFractionDigits: 4 })
const TIPOS = { inicial: 'Conteo inicial', venta: 'Venta', nota_credito: 'Nota de crédito', compra: 'Compra',
  ajuste_auditoria: 'Conteo / devolución de cliente', devolucion_proveedor: 'Devolución a proveedor', reversa: 'Reversa' }

function DetalleKardex({ productoId, onCerrar, onGuardado }) {
  useModal(onCerrar)
  const [data, setData] = useState(null)
  const [start, setStart] = useState(0)
  const [error, setError] = useState('')
  const [minimo, setMinimo] = useState('')
  const [objetivo, setObjetivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    let activo = true
    setError(''); setData(null)
    getKardex(productoId, { start, limit: 50 }).then(r => {
      if (!activo) return
      setData(r.data); setMinimo(r.data.producto.stock_minimo); setObjetivo(r.data.producto.stock_objetivo)
    }).catch(e => { if (activo) setError(e.response?.data?.message || 'No se pudo cargar el kardex.') })
    return () => { activo = false }
  }, [productoId, start])
  const guardar = async e => {
    e.preventDefault(); setGuardando(true); setError('')
    try { await guardarUmbrales(productoId, minimo, objetivo); onGuardado(); onCerrar() }
    catch (e) { setError(e.response?.data?.message || 'No se pudieron guardar los mínimos.') }
    finally { setGuardando(false) }
  }
  return <div className="fixed inset-0 z-50 bg-black/40 p-3 sm:p-6 overflow-y-auto flex items-start justify-center" onClick={onCerrar}>
    <section role="dialog" aria-modal="true" aria-label="Kardex del producto" className="bg-white rounded-2xl p-5 w-full max-w-4xl my-4 space-y-4" onClick={e => e.stopPropagation()}>
      <div className="flex justify-between gap-3"><h2 className="font-bold text-lg">{data?.producto.nombre || 'Kardex'}</h2><button aria-label="Cerrar kardex" onClick={onCerrar}><X /></button></div>
      {error && <p role="alert" className="text-peligro-700">{error}</p>}
      {!data ? <p>Cargando movimientos...</p> : <>
        <p className="text-sm">Existencias: <strong>{cantidad(data.producto.existencia)}</strong> · Costo promedio: <strong>{data.producto.costo_promedio == null ? 'Pendiente de valoración' : formatCurrency(data.producto.costo_promedio)}</strong></p>
        {!data.producto.conteo_confirmado && <p className="text-sm text-alerta-700">Apertura provisional en cero. Pendiente el conteo físico completo.</p>}
        <form onSubmit={guardar} className="flex flex-wrap items-end gap-3 border rounded-xl p-3">
          <label className="text-sm">Stock mínimo<input type="number" min="0" step="0.0001" required className="input block w-32 mt-1" value={minimo} onChange={e => setMinimo(e.target.value)} /></label>
          <label className="text-sm">Stock objetivo<input type="number" min={minimo || 0} step="0.0001" required className="input block w-32 mt-1" value={objetivo} onChange={e => setObjetivo(e.target.value)} /></label>
          <button className="btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar mínimos'}</button>
          <p className="text-xs text-neutro-500 w-full">Si baja del mínimo, la sugerencia cubre la diferencia hasta el objetivo. No crea una orden automáticamente.</p>
        </form>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b"><th className="p-2">Fecha / movimiento</th><th className="p-2">Cantidad</th><th className="p-2">Existencias</th><th className="p-2">Costo</th><th className="p-2">Origen / responsable</th></tr></thead><tbody>
          {data.movimientos.map(m => <tr key={m.id} className="border-b"><td className="p-2">{formatDate(m.fecha)}<br />{TIPOS[m.tipo] || m.tipo}</td><td className="p-2">{Number(m.cantidad) > 0 ? '+' : ''}{cantidad(m.cantidad)}</td><td className="p-2">{cantidad(m.existencia)}</td><td className="p-2 whitespace-nowrap">{m.costo_unitario == null ? 'Sin valorar' : formatCurrency(m.costo_unitario)}</td><td className="p-2">{m.origen_tipo} #{m.origen_id}<br />{m.usuario_nombre || 'Proceso sin usuario'}{m.cantidad_contada != null && <p>Conteo físico: {cantidad(m.cantidad_contada)}</p>}</td></tr>)}
        </tbody></table></div>
        {!data.movimientos.length && <p className="text-neutro-500">Este producto todavía no tiene movimientos.</p>}
        <div className="flex justify-between"><button disabled={!start} onClick={() => setStart(v => Math.max(0,v-50))}>Anteriores</button><button disabled={data.movimientos.length < 50} onClick={() => setStart(v => v+50)}>Más movimientos</button></div>
      </>}
    </section>
  </div>
}

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
