import { useEffect, useState } from 'react'
import { X, Loader2, ArrowRight, FileWarning } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/pagosProveedoresUtils'
import { getCandidatasNota } from '../../services/pagosProveedoresService'

/**
 * Elige a qué factura del proveedor se le aplica el crédito que quedó a
 * favor. Solo aparecen facturas con saldo: aplicarlo a una ya pagada sería
 * volver a perderlo.
 *
 * Si el crédito no cabe entero en la factura elegida, se aplica lo que quepa
 * y el resto sigue a favor para otra — por eso "aplicaría" puede ser menor
 * que el disponible.
 */
export default function ModalAplicarNota({ nota, onAplicar, onCerrar }) {
  const [cargando, setCargando] = useState(true)
  const [cuentas, setCuentas] = useState([])
  const [error, setError] = useState(null)
  const [aplicando, setAplicando] = useState(null)

  useEffect(() => {
    getCandidatasNota(nota.id)
      .then((d) => { if (d.success) setCuentas(d.cuentas || []) })
      .catch(() => setError('No se pudieron cargar las facturas del proveedor.'))
      .finally(() => setCargando(false))
  }, [nota.id])

  const aplicar = async (cuenta) => {
    setAplicando(cuenta.id)
    try {
      await onAplicar(nota, cuenta)
    } finally {
      setAplicando(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Aplicar nota de crédito</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {nota.proveedorNombre} · disponible{' '}
              <span className="font-semibold text-emerald-700">{formatCurrency(nota.disponible)}</span>
            </p>
            {nota.razon && <p className="text-xs text-gray-400 mt-0.5">Razón: {nota.razon}</p>}
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 overflow-y-auto">
          {cargando ? (
            <div className="py-10 text-center text-gray-400 flex flex-col items-center gap-2">
              <Loader2 className="animate-spin" size={24} />
              <span>Buscando facturas del proveedor...</span>
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : cuentas.length === 0 ? (
            <div className="py-10 text-center text-gray-500 flex flex-col items-center gap-3">
              <FileWarning size={36} className="text-gray-300" />
              <div>
                <p className="font-semibold text-gray-700">Este proveedor no tiene facturas con saldo</p>
                <p className="text-sm mt-1">
                  El crédito queda a favor hasta que llegue una factura nueva de {nota.proveedorNombre}.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-2">Elegí a qué factura descontarle el crédito:</p>
              {cuentas.map((c) => (
                <div key={c.id} className="border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-emerald-300 transition">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{c.numeroConsecutivo}</p>
                    <p className="text-xs text-gray-500">
                      Vence {formatDate(c.fechaVencimiento)} · saldo {formatCurrency(c.saldoPendiente)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">quedaría en</p>
                      <p className="text-sm font-bold text-emerald-700">
                        {formatCurrency(c.saldoPendiente - c.aplicaria)}
                      </p>
                    </div>
                    <button
                      onClick={() => aplicar(c)}
                      disabled={aplicando !== null}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white text-sm font-semibold py-2 px-3 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {aplicando === c.id ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                      −{formatCurrency(c.aplicaria)}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
