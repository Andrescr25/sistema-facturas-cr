import { FileText, Edit } from 'lucide-react'

/**
 * Pestañas Nueva Factura / Editar Facturas. Extraído de Facturacion.jsx.
 */
export default function TabsFacturacion({ tabActiva, onCambiarTab, modoEdicion, edicionesPendientesCount, isMobile }) {
  return (
    <div className={`${isMobile ? 'px-4 mb-4' : 'mb-6'}`}>
      <div className="flex gap-2 border-b border-neutro-200">
        <button
          onClick={() => onCambiarTab('nueva')}
          className={`px-6 py-3 font-medium transition-colors relative ${tabActiva === 'nueva'
            ? 'text-primario-600 border-b-2 border-primario-600'
            : 'text-neutro-600 hover:text-neutro-800'
            } ${isMobile ? 'flex-1 text-sm' : ''}`}
        >
          <FileText size={16} className="inline mr-2" />
          {modoEdicion ? 'Editando Factura' : 'Nueva Factura'}
        </button>
        <button
          onClick={() => onCambiarTab('editar')}
          className={`px-6 py-3 font-medium transition-colors relative ${tabActiva === 'editar'
            ? 'text-primario-600 border-b-2 border-primario-600'
            : 'text-neutro-600 hover:text-neutro-800'
            } ${isMobile ? 'flex-1 text-sm' : ''}`}
        >
          <Edit size={16} className="inline mr-2" />
          Editar Facturas
          {edicionesPendientesCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-alerta-100 text-alerta-800 text-xs rounded-full">
              {edicionesPendientesCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
