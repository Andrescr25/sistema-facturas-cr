import { Boxes, Undo2, PackageX, Sparkles } from 'lucide-react'

/**
 * Pestañas Auditorías / Devoluciones / Excesos / Productos nuevos a nivel de página. Mismo
 * espíritu que TabsFacturacion.jsx, adaptado a la estética emerald de esta
 * página. En pantallas chicas se reparten a ancho completo (flex-1) y bajan
 * de tamaño para no forzar scroll horizontal; en sm+ vuelven a su ancho
 * natural. Con la cuarta pestaña (Productos nuevos) no entraban a 390 px: en
 * el celular van sin ícono. overflow-x-auto queda como respaldo para 320 px.
 */
export default function TabsInventarioAuditoria({ vistaActiva, onCambiarVista }) {
  return (
    <div className="flex gap-1 sm:gap-2 border-b border-neutro-200 overflow-x-auto">
      <button
        onClick={() => onCambiarVista('auditorias')}
        className={`flex-1 sm:flex-none justify-center px-2 sm:px-6 py-2.5 sm:py-3 font-bold text-xs sm:text-sm whitespace-nowrap transition-colors flex items-center gap-1.5 sm:gap-2 ${
          vistaActiva === 'auditorias'
            ? 'text-primario-700 border-b-2 border-primario-600'
            : 'text-neutro-500 hover:text-neutro-700'
        }`}
      >
        <Boxes size={16} className="hidden shrink-0 sm:block" />
        Auditorías
      </button>
      <button
        onClick={() => onCambiarVista('devoluciones')}
        className={`flex-1 sm:flex-none justify-center px-2 sm:px-6 py-2.5 sm:py-3 font-bold text-xs sm:text-sm whitespace-nowrap transition-colors flex items-center gap-1.5 sm:gap-2 ${
          vistaActiva === 'devoluciones'
            ? 'text-primario-700 border-b-2 border-primario-600'
            : 'text-neutro-500 hover:text-neutro-700'
        }`}
      >
        <Undo2 size={16} className="hidden shrink-0 sm:block" />
        Devoluciones
      </button>
      <button
        onClick={() => onCambiarVista('excesos')}
        className={`flex-1 sm:flex-none justify-center px-2 sm:px-6 py-2.5 sm:py-3 font-bold text-xs sm:text-sm whitespace-nowrap transition-colors flex items-center gap-1.5 sm:gap-2 ${
          vistaActiva === 'excesos'
            ? 'text-primario-700 border-b-2 border-primario-600'
            : 'text-neutro-500 hover:text-neutro-700'
        }`}
      >
        <PackageX size={16} className="hidden shrink-0 sm:block" />
        Excesos
      </button>
      <button
        onClick={() => onCambiarVista('productos-nuevos')}
        className={`flex-1 sm:flex-none justify-center px-2 sm:px-6 py-2.5 sm:py-3 font-bold text-xs sm:text-sm whitespace-nowrap transition-colors flex items-center gap-1.5 sm:gap-2 ${
          vistaActiva === 'productos-nuevos'
            ? 'text-primario-700 border-b-2 border-primario-600'
            : 'text-neutro-500 hover:text-neutro-700'
        }`}
      >
        <Sparkles size={16} className="hidden shrink-0 sm:block" />
        {/* En el celular no entran cuatro pestañas con el nombre largo. */}
        <span className="sm:hidden">Nuevos</span>
        <span className="hidden sm:inline">Productos nuevos</span>
      </button>
    </div>
  )
}
