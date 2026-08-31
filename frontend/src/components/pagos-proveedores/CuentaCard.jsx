import { Calendar, Clock, FileText, Loader2 } from 'lucide-react'
import { formatCurrency, formatDate, diasLabel } from '../../utils/pagosProveedoresUtils'

const estadoStyles = {
  PENDIENTE: 'bg-alerta-100 text-alerta-800',
  PARCIAL: 'bg-primario-100 text-primario-800',
  PAGADA: 'bg-exito-100 text-exito-800',
  VENCIDA: 'bg-peligro-100 text-peligro-800'
}

const urgenciaBorde = (estado, dias) => {
  if (estado === 'PAGADA') return 'border-neutro-100'
  if (estado === 'VENCIDA' || dias < 0) return 'border-peligro-200'
  if (dias <= 7) return 'border-alerta-200'
  return 'border-neutro-100'
}

/**
 * Tarjeta compacta de una cuenta por pagar: info clave + estado + acceso al
 * detalle completo (modal). Extraído/rediseñado de PagosProveedores.jsx —
 * ya no expande la tabla de productos inline, eso vive en ModalDetalleCuenta.
 */
export default function CuentaCard({ cuenta, procesando, onVerDetalle }) {
  const estadoBadge = estadoStyles[cuenta.estado] || 'bg-neutro-100 text-neutro-800'
  const dias = cuenta.diasRestantes

  return (
    <div className={`card border-2 shadow-sm transition-all relative ${urgenciaBorde(cuenta.estado, dias)} ${procesando ? 'opacity-60 pointer-events-none' : ''}`}>
      {procesando && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/40 rounded-2xl">
          <Loader2 size={22} className="animate-spin text-primario-500" />
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-neutro-900">{cuenta.proveedorNombre}</p>
          <p className="text-sm text-neutro-500">{cuenta.proveedorCedula}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-neutro-600">
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
                dias < 0 ? 'bg-peligro-100 text-peligro-700' : dias <= 7 ? 'bg-alerta-100 text-alerta-700' : 'bg-neutro-100 text-neutro-700'
              }`}
            >
              {diasLabel(dias)}
            </span>
          </div>
        </div>
        <div className="text-right space-y-2">
          <p className="text-sm text-neutro-500">Saldo pendiente</p>
          <p className="text-2xl font-semibold text-neutro-900">
            {formatCurrency(cuenta.saldoPendiente)}
          </p>
          {/* El saldo YA viene con el crédito restado. Sin mostrar esto, una
              factura de ₡60.000 con saldo ₡30.000 se lee como un error. */}
          {cuenta.creditoAplicado > 0 && (
            <div className="text-xs text-exito-700 bg-exito-50 rounded-lg px-2 py-1 inline-block text-right">
              <span className="font-semibold">Nota de crédito −{formatCurrency(cuenta.creditoAplicado)}</span>
              <span className="block text-exito-600/80">
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-neutro-50">
        <p className="text-xs text-neutro-500">
          Condición: {cuenta.condicionVenta === '02' ? 'Crédito' : 'Contado'} • Plazo: {cuenta.plazoCredito} días
          {cuenta.notas && <span className="block mt-0.5 text-neutro-600">📝 {cuenta.notas}</span>}
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
