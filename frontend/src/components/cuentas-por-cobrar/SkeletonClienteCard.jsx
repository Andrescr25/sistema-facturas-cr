/**
 * Placeholder animado de una tarjeta de cliente mientras carga la lista.
 * De pagos-proveedores/SkeletonCuentaCard.jsx.
 */
export default function SkeletonClienteCard() {
  return (
    <div className="card border border-gray-100 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-11 w-11 bg-gray-200 rounded-lg" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-3 w-20 bg-gray-100 rounded" />
        </div>
      </div>
      <div className="h-6 w-28 bg-gray-100 rounded-full mb-4" />
      <div className="pt-3 border-t border-gray-100">
        <div className="h-3 w-16 bg-gray-100 rounded mb-2" />
        <div className="h-6 w-24 bg-gray-200 rounded" />
      </div>
    </div>
  )
}
