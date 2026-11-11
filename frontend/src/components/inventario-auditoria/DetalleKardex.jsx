import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { getKardex, guardarUmbrales } from '../../services/inventarioService'
import { formatCurrency, formatDate, formatCantidad as cantidad } from '../../utils/inventarioAuditoriaUtils'
import { useModal } from '../../hooks/useModal'

const TIPOS = { inicial: 'Conteo inicial', venta: 'Venta', nota_credito: 'Nota de crédito', compra: 'Compra',
  ajuste_auditoria: 'Conteo / devolución de cliente', devolucion_proveedor: 'Devolución a proveedor', reversa: 'Reversa' }

/**
 * De dónde sale la cantidad de un producto: cada movimiento del kardex (compra,
 * venta, nota de crédito, conteo…) con la existencia que dejó, y sus mínimos.
 * Lo abren Existencias y Gestión de Catálogo (2026-11-11): la cifra de las dos
 * pantallas es la misma (`inventario_saldo`).
 */
export default function DetalleKardex({ productoId, onCerrar, onGuardado }) {
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
    try { await guardarUmbrales(productoId, minimo, objetivo); onGuardado?.(); onCerrar() }
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
