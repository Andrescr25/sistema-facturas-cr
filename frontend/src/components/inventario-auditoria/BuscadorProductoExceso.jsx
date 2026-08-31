import { Search, Loader2, Plus } from 'lucide-react'
import { formatCurrency } from '../../utils/inventarioAuditoriaUtils'

/**
 * Buscador para agregar productos a mano a una tanda de excesos.
 *
 * A diferencia de BuscadorProductoDevolucion no pide cantidad: en un exceso
 * la cantidad la define el stock que ya hay en Alegra, y si la física no
 * coincide se corrige al empacar (ver ItemExcesoCard). Pedir un número acá
 * sería pedir un dato que todavía nadie contó.
 */
export default function BuscadorProductoExceso({
  busqueda,
  setBusqueda,
  resultados,
  buscando,
  agregando,
  onAgregar
}) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-neutro-100 shadow-sm space-y-4">
      <div>
        <h3 className="text-lg font-bold text-neutro-900 flex items-center gap-1.5">
          <Search className="text-exito-600" size={18} />
          Agregar producto a la tanda
        </h3>
        <p className="text-xs text-neutro-500 mt-0.5">
          Para lo que la detección automática no agarra: temporada que pasó, proveedor que ya no se trabaja, empaque dañado.
        </p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutro-400" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre o referencia del producto..."
          className="input w-full pl-10 py-2.5 px-3 border-2 border-neutro-300 focus:border-primario-500 rounded-xl text-sm"
        />
        {buscando && (
          <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-exito-600 animate-spin" />
        )}
      </div>

      {busqueda.length >= 2 && (
        <div className="divide-y divide-neutro-100 max-h-96 overflow-y-auto -mx-2">
          {!buscando && resultados.length === 0 ? (
            <p className="text-sm text-neutro-400 text-center py-6">No se encontraron productos para "{busqueda}"</p>
          ) : (
            resultados.map(producto => (
              <div key={producto.alegraId} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-neutro-900 text-sm truncate">{producto.nombre}</p>
                  <p className="text-xs text-neutro-400">
                    Ref: {producto.referencia || 'N/A'} • Costo: {formatCurrency(producto.costoUnitario)}
                  </p>
                </div>
                <button
                  onClick={() => onAgregar(producto)}
                  disabled={agregando}
                  className="bg-primario-800 hover:bg-primario-900 disabled:bg-neutro-200 text-white p-2 rounded-lg transition-colors shrink-0"
                  title="Agregar a la tanda"
                >
                  {agregando ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
