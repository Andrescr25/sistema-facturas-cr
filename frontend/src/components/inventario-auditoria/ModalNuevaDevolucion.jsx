import { Play, X, Info, RefreshCw, Hash } from 'lucide-react'

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
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onCerrar} />

      <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-6 transform transition-all border border-gray-150">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Play className="text-emerald-600 fill-emerald-600" size={20} />
            Nueva Devolución
          </h3>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">Nombre (automático)</label>
            <div className="w-full py-2.5 px-3 border-2 border-gray-200 bg-gray-50 rounded-xl text-base font-bold text-gray-700 flex items-center gap-2">
              <Hash size={16} className="text-gray-400" />
              {siguienteNombre}
            </div>
          </div>

          <div className="bg-emerald-50 text-emerald-900 border border-emerald-150 p-3.5 rounded-2xl text-xs leading-relaxed flex items-start gap-2.5">
            <Info size={16} className="text-emerald-700 shrink-0 mt-0.5" />
            <p>
              Arranca vacía. Después de crearla, busca y agrega uno por uno los productos que llegaron de vuelta, con su cantidad.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="animate-spin" size={20} /> : <Play size={20} fill="white" />}
            {loading ? 'Creando...' : 'Crear Devolución'}
          </button>
        </form>
      </div>
    </div>
  )
}
