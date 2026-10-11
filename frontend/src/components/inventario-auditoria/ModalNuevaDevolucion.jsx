import { Play, X, Info, RefreshCw, Hash } from 'lucide-react'
import { useModal } from '../../hooks/useModal'

/**
 * Modal para iniciar una nueva devolución (reingreso de productos
 * devueltos al inventario). A diferencia de ModalNuevaAuditoria, no hay
 * estrategia de selección ni nombre manual — el nombre es autoincremental
 * ("Ajuste N", asignado por el backend); acá solo se muestra como vista
 * previa. Arranca vacía, los productos se agregan uno por uno después.
 */
export default function ModalNuevaDevolucion({
  loading,
  siguienteNombre,
  onSubmit,
  onCerrar
}) {
  useModal(onCerrar)
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-neutro-500 bg-opacity-75 transition-opacity" onClick={onCerrar} />

      <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-6 transform transition-all border border-neutro-200">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-xl font-bold text-neutro-900 flex items-center gap-2">
            <Play className="text-exito-600 fill-exito-600" size={20} />
            Nueva Devolución
          </h3>
          <button onClick={onCerrar} className="text-neutro-400 hover:text-neutro-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm font-bold">Dirección del movimiento
            <select name="destino" className="input w-full mt-2" defaultValue="cliente">
              <option value="cliente">De cliente — ingreso a inventario</option>
              <option value="proveedor">A proveedor — salida de inventario</option>
            </select>
          </label>
          <div>
            <label className="label text-xs font-bold text-neutro-700 uppercase tracking-wider block mb-1">Nombre (automático)</label>
            <div className="w-full py-2.5 px-3 border-2 border-neutro-200 bg-neutro-50 rounded-xl text-base font-bold text-neutro-700 flex items-center gap-2">
              <Hash size={16} className="text-neutro-400" />
              {siguienteNombre}
            </div>
          </div>

          <div className="bg-exito-50 text-exito-900 border border-exito-200 p-3.5 rounded-2xl text-xs leading-relaxed flex items-start gap-2.5">
            <Info size={16} className="text-exito-700 shrink-0 mt-0.5" />
            <p>
              Arranca vacía. Después de crearla, busca y agrega uno por uno los productos con su cantidad. Al finalizar se registra el ingreso o la salida elegida. Esta operación de inventario no crea un documento financiero.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primario-800 hover:bg-primario-900 text-white font-bold py-3 px-6 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="animate-spin" size={20} /> : <Play size={20} fill="white" />}
            {loading ? 'Creando...' : 'Crear Devolución'}
          </button>
        </form>
      </div>
    </div>
  )
}
