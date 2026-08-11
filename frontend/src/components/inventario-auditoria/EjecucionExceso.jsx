import { PackageX } from 'lucide-react'
import ItemExcesoCard from './ItemExcesoCard'
import BuscadorProductoExceso from './BuscadorProductoExceso'

/**
 * Lista de productos de un exceso en progreso — la "factura de empaque"
 * que revisan los empleados producto por producto, más el buscador para
 * agregar a mano lo que la detección automática no agarró y el botón para
 * quitar lo que no debería estar.
 */
export default function EjecucionExceso({
  items,
  onActualizarItem,
  onVerImagen,
  onEliminarItem,
  busquedaProducto,
  setBusquedaProducto,
  resultadosProducto,
  buscandoProducto,
  agregandoItem,
  onAgregarItem
}) {
  return (
    <div className="space-y-5">
      <BuscadorProductoExceso
        busqueda={busquedaProducto}
        setBusqueda={setBusquedaProducto}
        resultados={resultadosProducto}
        buscando={buscandoProducto}
        agregando={agregandoItem}
        onAgregar={onAgregarItem}
      />

      <div className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900">Productos a Empacar ({items.length})</h3>

        {items.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 p-10 text-center text-gray-400 flex flex-col items-center gap-3">
            <PackageX size={40} className="text-gray-300" />
            <p>Esta tanda está vacía. Agregá productos con el buscador de arriba.</p>
          </div>
        ) : (
          items.map(item => (
            <ItemExcesoCard
              key={item.id}
              item={item}
              onActualizar={onActualizarItem}
              onVerImagen={onVerImagen}
              onEliminar={onEliminarItem}
            />
          ))
        )}
      </div>
    </div>
  )
}
