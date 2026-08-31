import { Plus, Boxes } from 'lucide-react'

/**
 * Panel principal del dashboard (cuando no se está viendo el historial):
 * acceso a crear una nueva auditoría o ver el historial. Extraído de
 * InventarioAuditoria.jsx.
 */
export default function ControlExistencias({ onNuevaAuditoria, onVerHistorial }) {
  return (
    <div className="bg-primario-50/50 border border-primario-100 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-neutro-900">Control de Existencias</h2>
        <p className="text-neutro-500 text-sm">
          Inicia un conteo rápido de 50 productos, por categoría o productos críticos.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full md:w-auto">
        <button
          onClick={onNuevaAuditoria}
          className="bg-primario-800 hover:bg-primario-900 text-white font-extrabold px-6 py-3.5 rounded-2xl shadow-md transition-all active:scale-95 text-center flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Nueva Auditoría
        </button>
        <button
          onClick={onVerHistorial}
          className="bg-neutro-100 hover:bg-neutro-200 text-neutro-700 font-bold px-6 py-3.5 rounded-2xl transition-all active:scale-95 text-center flex items-center justify-center gap-2"
        >
          <Boxes size={18} />
          Ver Historial
        </button>
      </div>
    </div>
  )
}
