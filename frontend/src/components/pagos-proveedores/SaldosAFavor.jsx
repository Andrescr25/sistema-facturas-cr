import { useState } from 'react'
import { ChevronDown, ChevronRight, Wallet, Link2, Trash2, Loader2, RefreshCw } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/pagosProveedoresUtils'

/**
 * Créditos de proveedor que todavía no se descontaron de ninguna factura —
 * casi siempre porque la factura que acreditaban ya estaba pagada.
 *
 * Es plata que el proveedor debe, así que no puede quedar solo "registrada":
 * de acá se liga a una factura con saldo o se descarta si no corresponde.
 */
export default function SaldosAFavor({ grupos, total, loading, onRefrescar, onAplicar, onEliminar, eliminando }) {
  const [abierto, setAbierto] = useState(false)

  if (!loading && (!grupos || grupos.length === 0)) return null

  return (
    <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 hover:bg-emerald-50/40 transition"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {abierto ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
          <Wallet size={20} className="text-emerald-600 shrink-0" />
          <div className="text-left min-w-0">
            <h3 className="font-bold text-gray-900">Saldos a favor</h3>
            <p className="text-xs text-gray-500">
              Notas de crédito sin aplicar — plata que te deben {grupos?.length > 0 && `· ${grupos.length} proveedor(es)`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xl font-bold text-emerald-700">{formatCurrency(total || 0)}</span>
          {loading && <Loader2 size={16} className="animate-spin text-emerald-600" />}
        </div>
      </button>

      {abierto && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          <div className="px-5 py-2 flex justify-end">
            <button onClick={onRefrescar} className="text-xs text-gray-500 hover:text-emerald-700 flex items-center gap-1.5">
              <RefreshCw size={13} /> Actualizar
            </button>
          </div>

          {grupos.map((g) => (
            <div key={g.proveedorCedula} className="px-5 py-3">
              <div className="flex items-baseline justify-between mb-2">
                <p className="font-semibold text-gray-800 text-sm">{g.proveedorNombre}</p>
                <span className="font-bold text-emerald-700">{formatCurrency(g.aFavor)}</span>
              </div>

              <div className="space-y-2">
                {g.notas.map((n) => (
                  <div key={n.id} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">
                          {formatCurrency(n.disponible)}
                          {n.montoAplicado > 0 && (
                            <span className="text-xs font-normal text-gray-500">
                              {' '}de {formatCurrency(n.montoTotal)} (ya se aplicó {formatCurrency(n.montoAplicado)})
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {n.numeroConsecutivo || n.clave.slice(-10)} · {formatDate(n.fechaEmision)}
                          {n.razon && ` · ${n.razon}`}
                        </p>
                        {n.lineas?.length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">
                            {n.lineas.map((l) => `${l.descripcion} x${l.cantidad}`).join(' · ')}
                          </p>
                        )}
                        {!n.hayDondeAplicar && (
                          <p className="text-xs text-amber-700 mt-1">
                            Sin facturas con saldo de este proveedor todavía.
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => onAplicar(n)}
                          disabled={!n.hayDondeAplicar}
                          title={n.hayDondeAplicar ? 'Ligar a una factura' : 'No hay facturas con saldo de este proveedor'}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition flex items-center gap-1.5"
                        >
                          <Link2 size={13} /> Aplicar
                        </button>
                        <button
                          onClick={() => onEliminar(n)}
                          disabled={eliminando === n.id}
                          title="Eliminar la nota"
                          className="p-1.5 text-gray-300 hover:text-red-600 transition"
                        >
                          {eliminando === n.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
