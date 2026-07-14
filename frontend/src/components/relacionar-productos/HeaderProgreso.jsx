import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

/**
 * Encabezado con volver a la lista, título, y la tarjeta de progreso de
 * relación. Extraído de RelacionarProductos.jsx.
 */
export default function HeaderProgreso({ factura, progreso, stats }) {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-150 pb-6 mb-6">
      <div>
        <button
          onClick={() => navigate('/revision-precios')}
          className="inline-flex items-center text-xs font-bold text-gray-500 hover:text-gray-800 uppercase tracking-wider mb-2.5"
        >
          <ArrowLeft size={14} className="mr-1" />
          Volver a la lista
        </button>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          Relacionar Productos
        </h1>
        <p className="text-sm text-gray-500 mt-0.5 font-medium">
          Factura #{factura.numeroConsecutivo} &bull; {factura.proveedorNombre}
        </p>
      </div>

      {/* Progreso Compacto */}
      <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl w-full md:max-w-xs shadow-xxs">
        <div className="flex justify-between text-xs font-bold text-gray-700 uppercase mb-2">
          <span>Progreso</span>
          <span>{progreso}%</span>
        </div>
        <div className="bg-gray-200 rounded-full h-2 mb-2">
          <div
            className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progreso}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-xxs text-gray-400 font-medium">
          <span>Relacionados: {stats.relacionados}</span>
          <span>Restantes: {stats.noRelacionados}</span>
        </div>
      </div>
    </div>
  )
}
