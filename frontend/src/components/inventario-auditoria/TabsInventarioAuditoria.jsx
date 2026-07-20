import { Boxes, Undo2 } from 'lucide-react'

/**
 * Pestañas Auditorías / Devoluciones a nivel de página. Mismo espíritu que
 * TabsFacturacion.jsx, adaptado a la estética emerald de esta página.
 */
export default function TabsInventarioAuditoria({ vistaActiva, onCambiarVista }) {
  return (
    <div className="flex gap-2 border-b border-gray-200">
      <button
        onClick={() => onCambiarVista('auditorias')}
        className={`px-6 py-3 font-bold text-sm transition-colors flex items-center gap-2 ${
          vistaActiva === 'auditorias'
            ? 'text-emerald-700 border-b-2 border-emerald-600'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <Boxes size={16} />
        Auditorías
      </button>
      <button
        onClick={() => onCambiarVista('devoluciones')}
        className={`px-6 py-3 font-bold text-sm transition-colors flex items-center gap-2 ${
          vistaActiva === 'devoluciones'
            ? 'text-emerald-700 border-b-2 border-emerald-600'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <Undo2 size={16} />
        Devoluciones
      </button>
    </div>
  )
}
