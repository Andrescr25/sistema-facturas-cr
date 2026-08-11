import { Calendar, Clock, FileText, Loader2 } from 'lucide-react'
import { formatCurrency, formatDate, diasLabel } from '../../utils/pagosProveedoresUtils'

const estadoStyles = {
  PENDIENTE: 'bg-yellow-100 text-yellow-800',
  PARCIAL: 'bg-blue-100 text-blue-800',
  PAGADA: 'bg-green-100 text-green-800',
  VENCIDA: 'bg-red-100 text-red-800'
}

const urgenciaBorde = (estado, dias) => {
  if (estado === 'PAGADA') return 'border-gray-100'
  if (estado === 'VENCIDA' || dias < 0) return 'border-red-200'
  if (dias <= 7) return 'border-orange-200'
  return 'border-gray-100'
}

/**
 * Tarjeta compacta de una cuenta por pagar: info clave + estado + acceso al
 * detalle completo (modal). Extraído/rediseñado de PagosProveedores.jsx —
 * ya no expande la tabla de productos inline, eso vive en ModalDetalleCuenta.
 */
export default function CuentaCard({ cuenta, procesando, onVerDetalle }) {
  const estadoBadge = estadoStyles[cuenta.estado] || 'bg-gray-100 text-gray-800'
  const dias = cuenta.diasRestantes

  return (
    <div className={`card border-2 shadow-sm transition-all relative ${urgenciaBorde(cuenta.estado, dias)} ${procesando ? 'opacity-60 pointer-events-none' : ''}`}>
      {procesando && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/40 rounded-2xl">
          <Loader2 size={22} className="animate-spin text-blue-500" />
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-gray-900">{cuenta.proveedorNombre}</p>
          <p className="text-sm text-gray-500">{cuenta.proveedorCedula}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <FileText size={14} />
              Factura #{cuenta.numeroConsecutivo}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              Emisión: {formatDate(cuenta.fechaEmision)}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={14} />
              Vencimiento: {formatDate(cuenta.fechaVencimiento)}
            </span>
            <span
              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                dias < 0 ? 'bg-red-100 text-red-700' : dias <= 7 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'
              }`}
            >
              {diasLabel(dias)}
            </span>
          </div>
        </div>
        <div className="text-right space-y-2">
          <p className="text-sm text-gray-500">Saldo pendiente</p>
          <p className="text-2xl font-semibold text-gray-900">
            {formatCurrency(cuenta.saldoPendiente)}
          </p>
          {/* El saldo YA viene con el crédito restado. Sin mostrar esto, una
              factura de ₡60.000 con saldo ₡30.000 se lee como un error. */}
          {cuenta.creditoAplicado > 0 && (
            <div className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1 inline-block text-right">
              <span className="font-semibold">Nota de crédito −{formatCurrency(cuenta.creditoAplicado)}</span>
              <span className="block text-emerald-600/80">
                factura original {formatCurrency(cuenta.montoTotal)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${estadoBadge}`}>
              {cuenta.estado}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-gray-50">
        <p className="text-xs text-gray-500">
          Condición: {cuenta.condicionVenta === '02' ? 'Crédito' : 'Contado'} • Plazo: {cuenta.plazoCredito} días
          {cuenta.notas && <span className="block mt-0.5 text-gray-600">📝 {cuenta.notas}</span>}
        </p>
        <button
          onClick={() => onVerDetalle(cuenta)}
          className="btn btn-primary text-sm"
        >
          Ver detalle y registrar pago
        </button>
      </div>
    </div>
  )
}
