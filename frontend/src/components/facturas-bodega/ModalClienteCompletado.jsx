import { Package, Printer, Sparkles } from 'lucide-react'
import { useModal } from '../../hooks/useModal'

/**
 * Modal de confirmación al completar un despacho (factura lista o con
 * faltantes registrados). Extraído de FacturasBodega.jsx.
 */
export default function ModalClienteCompletado({ clienteCompletado, onCerrar }) {
  useModal(onCerrar)
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-scale-up">
        <div className="bg-primario-600 p-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/90 rounded-full mb-3 shadow-lg">
            <Sparkles className="text-primario-500" size={28} />
          </div>
          <h2 className="text-xl font-bold text-white">¡Despacho Procesado!</h2>
        </div>

        <div className="p-6 text-center">
          <p className="text-xs text-neutro-400 uppercase font-medium mb-0.5">Cliente:</p>
          <p className="text-xl font-bold text-neutro-900 mb-4 break-words">
            {clienteCompletado.nombre}
          </p>

          {clienteCompletado.tipo === 'faltantes' && (
            <div className="bg-alerta-50 border border-alerta-100 rounded-2xl p-3.5 flex items-center justify-center gap-1.5">
              <Package size={16} className="text-alerta-600" />
              <p className="text-alerta-700 text-sm font-bold">
                {clienteCompletado.cantidad} faltante{clienteCompletado.cantidad > 1 ? 's' : ''} registrado{clienteCompletado.cantidad > 1 ? 's' : ''}
              </p>
            </div>
          )}

          {clienteCompletado.tipo === 'listo' && (
            <div className="bg-primario-50 border border-primario-100 rounded-2xl p-3.5 flex items-center justify-center gap-1.5">
              <Printer size={16} className="text-primario-600" />
              <p className="text-primario-700 text-sm font-bold">
                Enviado a cola de impresión
              </p>
            </div>
          )}
        </div>

        <div className="p-6 pt-0">
          <button
            onClick={onCerrar}
            className="w-full py-3.5 bg-primario-600 text-white font-bold rounded-2xl hover:bg-primario-700 shadow-md active:scale-[0.98] transition"
          >
            Siguiente pedido
          </button>
        </div>
      </div>
    </div>
  )
}
