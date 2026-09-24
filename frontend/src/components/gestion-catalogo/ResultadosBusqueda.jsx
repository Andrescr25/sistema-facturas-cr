import { useMemo } from 'react'
import { Loader2, PackageSearch, Search } from 'lucide-react'
import FilaProducto from './FilaProducto'

/**
 * Buscar en todo el catálogo (por texto, por proveedor o las dos): una lista
 * plana, como hace el catálogo del agente al buscar. Cada fila dice en qué
 * categoría y subcategoría está, porque acá no hay agrupado que lo diga.
 */
export default function ResultadosBusqueda({
  busqueda,
  proveedorNombre = '',
  resultados,
  loading,
  alternar,
  estaSeleccionado,
  onEditar,
  onSugerirFoto,
  onDuplicar
}) {
  const ordenPlano = useMemo(() => resultados.map((p) => p.id), [resultados])
  const descripcion = [
    busqueda.trim() && ` para "${busqueda.trim()}"`,
    proveedorNombre && (proveedorNombre.startsWith('sin ') ? `, ${proveedorNombre}` : ` de ${proveedorNombre}`)
  ].filter(Boolean).join('')
  const manejarAlternar = (id, nativeEvent) => alternar(id, { rango: !!nativeEvent?.shiftKey, ordenPlano })

  if (loading) {
    return (
      <div className="flex min-h-[260px] items-center justify-center gap-3 rounded-xl border border-neutro-100 bg-white shadow-sm">
        <Loader2 size={24} className="animate-spin text-primario-600" />
        <span className="text-base font-semibold text-neutro-500">Buscando…</span>
      </div>
    )
  }

  if (resultados.length === 0) {
    return (
      <div className="rounded-xl border border-neutro-100 bg-white py-16 text-center shadow-sm">
        <PackageSearch className="mx-auto mb-4 text-neutro-300" size={56} />
        <h3 className="mb-1 text-xl font-bold text-neutro-900">Nada{descripcion}</h3>
        <p className="text-neutro-500">
          {busqueda.trim() ? 'Probá con parte del nombre o con la referencia.' : 'Ese proveedor no tiene productos visibles.'}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutro-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-neutro-200 bg-neutro-50 px-5 py-4">
        <div className="rounded-lg bg-primario-100 p-2">
          <Search size={20} className="text-primario-600" />
        </div>
        <h3 className="text-lg font-bold text-neutro-800">
          {resultados.length} resultado{resultados.length === 1 ? '' : 's'}{descripcion}
        </h3>
      </div>
      <div className="divide-y divide-neutro-100">
        {resultados.map((p) => (
          <FilaProducto
            key={p.id}
            producto={p}
            mostrarCategoria
            seleccionado={estaSeleccionado(p.id)}
            onAlternarSeleccion={manejarAlternar}
            onEditar={onEditar}
            onSugerirFoto={onSugerirFoto}
            onDuplicar={onDuplicar}
          />
        ))}
      </div>
    </div>
  )
}
