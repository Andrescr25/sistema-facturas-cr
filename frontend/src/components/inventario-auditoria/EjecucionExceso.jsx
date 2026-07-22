import ItemExcesoCard from './ItemExcesoCard'

/**
 * Lista de productos de un exceso en progreso — la "factura de empaque"
 * que revisan los empleados producto por producto.
 */
export default function EjecucionExceso({ items, onActualizarItem, onVerImagen }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold text-gray-900">Productos a Empacar ({items.length})</h3>
      {items.map(item => (
        <ItemExcesoCard key={item.id} item={item} onActualizar={onActualizarItem} onVerImagen={onVerImagen} />
      ))}
    </div>
  )
}
