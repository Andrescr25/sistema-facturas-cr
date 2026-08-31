import { Users, X } from 'lucide-react'

/**
 * Tarjeta del cliente ya seleccionado, con opción de cambiarlo. Extraído
 * de Facturacion.jsx.
 */
export default function ClienteSeleccionado({ isMobile, cliente, onCambiarCliente }) {
  return (
    <div className="card border-2 border-exito-200 bg-exito-50 shadow-sm p-4 md:p-6 rounded-2xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-exito-100 text-exito-700 rounded-xl">
            <Users size={isMobile ? 24 : 28} />
          </div>
          <div>
            <span className="text-xs text-exito-700 font-semibold tracking-wider uppercase block">Cliente Seleccionado</span>
            <h3 className="font-bold text-exito-900 text-lg md:text-2xl leading-tight">
              {cliente.name}
            </h3>
            {cliente.identification && (
              <p className="text-sm text-exito-700 mt-0.5">
                Cédula: <strong>{cliente.identification}</strong>
              </p>
            )}
          </div>
        </div>
        {isMobile ? (
          <button
            onClick={onCambiarCliente}
            className="px-4 py-2.5 bg-peligro-100 hover:bg-peligro-200 text-peligro-700 font-extrabold text-sm rounded-xl transition-all flex-shrink-0"
          >
            Cambiar
          </button>
        ) : (
          <button
            onClick={onCambiarCliente}
            className="p-3 text-peligro-600 hover:text-peligro-800 hover:bg-peligro-100 rounded-xl transition-colors"
            title="Cambiar cliente"
          >
            <X size={24} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  )
}
