import { useState } from 'react'
import { Search, Loader2, Plus } from 'lucide-react'
import { formatCurrency } from '../../utils/inventarioAuditoriaUtils'

/**
 * Buscador de productos para agregar a una devolución en progreso: escribe
 * el nombre/referencia, aparecen coincidencias en vivo de Alegra, y cada
 * resultado tiene su propio campo de cantidad devuelta + botón agregar.
 */
export default function BuscadorProductoDevolucion({
  busqueda,
  setBusqueda,
  resultados,
  buscando,
  agregando,
  onAgregar
}) {
  const [cantidades, setCantidades] = useState({})

  const cambiarCantidad = (alegraId, val) => {
    setCantidades(prev => ({ ...prev, [alegraId]: val }))
  }

  const handleAgregar = (producto) => {
    const cantidad = cantidades[producto.alegraId] || 1
    onAgregar(producto, cantidad)
    setCantidades(prev => ({ ...prev, [producto.alegraId]: '' }))
  }

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
        <Search className="text-emerald-600" size={18} />
        Buscar Producto Devuelto
      </h3>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre o referencia del producto..."
          className="input w-full pl-10 py-2.5 px-3 border-2 border-gray-300 focus:border-emerald-500 rounded-xl text-sm"
        />
        {buscando && (
          <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-600 animate-spin" />
        )}
      </div>

      {busqueda.length >= 2 && (
        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto -mx-2">
          {!buscando && resultados.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No se encontraron productos para "{busqueda}"</p>
          ) : (
            resultados.map(producto => (
              <div key={producto.alegraId} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{producto.nombre}</p>
                  <p className="text-xs text-gray-400">
                    Ref: {producto.referencia || 'N/A'} • Costo: {formatCurrency(producto.costoUnitario)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={cantidades[producto.alegraId] ?? ''}
                    onChange={(e) => cambiarCantidad(producto.alegraId, e.target.value)}
                    placeholder="Cant."
                    className="input w-20 py-2 px-2 border-2 border-gray-300 focus:border-emerald-500 rounded-lg text-sm text-center"
                  />
                  <button
                    onClick={() => handleAgregar(producto)}
                    disabled={agregando}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white p-2 rounded-lg transition-colors"
                    title="Agregar a la devolución"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
