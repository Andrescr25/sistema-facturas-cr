import { useState } from 'react'
import { Trash2, Check, X, Pencil, Loader2 } from 'lucide-react'
import { formatCurrency } from '../../utils/reporteContadorUtils'

/**
 * Una línea (ítem) dentro de una factura expandida. Editable a mano —
 * el usuario puede corregir cantidad, precio, base o impuesto si encuentra
 * un error de captura, y borrar la línea si no corresponde.
 */
export default function FilaLinea({ linea, onEditar, onEliminar }) {
  const [editando, setEditando] = useState(false)
  const [valores, setValores] = useState({
    concepto: linea.concepto, cantidad: linea.cantidad,
    precioTotal: linea.precioTotal, baseGravable: linea.baseGravable, impuesto: linea.impuesto
  })
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    const ok = await onEditar(linea.id, valores)
    setGuardando(false)
    if (ok) setEditando(false)
  }

  if (editando) {
    return (
      <tr className="bg-blue-50/40">
        <td className="px-3 py-1.5">
          <input className="input !py-1 !text-xs w-full" value={valores.concepto}
            onChange={(e) => setValores(v => ({ ...v, concepto: e.target.value }))} />
        </td>
        <td className="px-3 py-1.5 text-right">
          <input type="number" className="input !py-1 !text-xs w-20 text-right" value={valores.cantidad}
            onChange={(e) => setValores(v => ({ ...v, cantidad: e.target.value }))} />
        </td>
        <td className="px-3 py-1.5 text-right">
          <input type="number" className="input !py-1 !text-xs w-24 text-right" value={valores.precioTotal}
            onChange={(e) => setValores(v => ({ ...v, precioTotal: e.target.value }))} />
        </td>
        <td className="px-3 py-1.5 text-right">
          <input type="number" className="input !py-1 !text-xs w-24 text-right" value={valores.baseGravable}
            onChange={(e) => setValores(v => ({ ...v, baseGravable: e.target.value }))} />
        </td>
        <td className="px-3 py-1.5 text-right">
          <input type="number" className="input !py-1 !text-xs w-20 text-right" value={valores.impuesto}
            onChange={(e) => setValores(v => ({ ...v, impuesto: e.target.value }))} />
        </td>
        <td className="px-3 py-1.5">
          <div className="flex items-center gap-1 justify-end">
            <button onClick={guardar} disabled={guardando} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
              {guardando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            </button>
            <button onClick={() => setEditando(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
              <X size={13} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className={`text-xs ${linea.excluido ? 'opacity-40' : ''}`}>
      <td className="px-3 py-1.5 text-gray-700 max-w-xs truncate" title={linea.concepto}>{linea.concepto}</td>
      <td className="px-3 py-1.5 text-right text-gray-500">{linea.cantidad}</td>
      <td className="px-3 py-1.5 text-right text-gray-500">{formatCurrency(linea.precioTotal)}</td>
      <td className="px-3 py-1.5 text-right text-gray-700">{formatCurrency(linea.baseGravable)}</td>
      <td className="px-3 py-1.5 text-right text-gray-700">{formatCurrency(linea.impuesto)}</td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1 justify-end">
          <button onClick={() => setEditando(true)} className="p-1 text-gray-300 hover:text-blue-600 transition">
            <Pencil size={13} />
          </button>
          <button onClick={() => onEliminar(linea.id)} className="p-1 text-gray-300 hover:text-red-600 transition">
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  )
}
