/**
 * Placeholder animado de una tarjeta de cuenta mientras carga la lista, para
 * que la página no "salte" a un spinner vacío y se sienta más dinámica.
 */
export default function SkeletonCuentaCard() {
  return (
    <div className="card border border-gray-100 animate-pulse">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2 flex-1 min-w-[220px]">
          <div className="h-4 w-48 bg-gray-200 rounded" />
          <div className="h-3 w-28 bg-gray-100 rounded" />
          <div className="flex gap-2 mt-3">
            <div className="h-5 w-24 bg-gray-100 rounded-full" />
            <div className="h-5 w-32 bg-gray-100 rounded-full" />
            <div className="h-5 w-32 bg-gray-100 rounded-full" />
          </div>
        </div>
        <div className="space-y-2 text-right">
          <div className="h-3 w-20 bg-gray-100 rounded ml-auto" />
          <div className="h-6 w-28 bg-gray-200 rounded ml-auto" />
          <div className="h-5 w-20 bg-gray-100 rounded-full ml-auto" />
        </div>
      </div>
    </div>
  )
}
