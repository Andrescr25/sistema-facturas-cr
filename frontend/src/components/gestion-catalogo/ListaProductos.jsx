import { useMemo } from 'react'
import { Loader2, PackageSearch, MousePointerClick } from 'lucide-react'
import FilaProducto from './FilaProducto'

/**
 * El panel derecho del riel: los productos de la categoría/subcategoría
 * activa, agrupados en el mismo orden canónico que arma el catálogo del
 * agente (ver useListaCatalogo). En modo búsqueda, una lista plana — igual
 * que el catálogo del agente descarta el agrupado al buscar.
 */
export default function ListaProductos({
  loading,
  sinSeleccion,
  busquedaActiva,
  bloques,
  productos,
  alternar,
  estaSeleccionado,
  seleccionarTodos,
  deseleccionarTodos,
  onEditar,
  onSugerirFoto,
  onDuplicar
}) {
  const ordenPlano = useMemo(() => {
    if (bloques) return bloques.flatMap((b) => b.productos.map((p) => p.alegraId))
    return productos.map((p) => p.alegraId)
  }, [bloques, productos])

  const manejarAlternar = (alegraId, nativeEvent) => {
    alternar(alegraId, { rango: !!nativeEvent?.shiftKey, ordenPlano })
  }

  if (sinSeleccion) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-2 rounded-xl border border-neutro-100 bg-white p-8 text-center shadow-sm">
        <MousePointerClick size={40} className="text-neutro-300" />
        <p className="font-bold text-neutro-600">Elegí una categoría del riel</p>
        <p className="max-w-xs text-sm text-neutro-400">o buscá un producto por nombre o referencia en cualquier categoría.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center gap-2 rounded-xl border border-neutro-100 bg-white shadow-sm">
        <Loader2 size={22} className="animate-spin text-primario-600" />
        <span className="font-semibold text-neutro-500">Cargando…</span>
      </div>
    )
  }

  const vacio = bloques ? bloques.length === 0 : productos.length === 0
  if (vacio) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-neutro-100 bg-white p-8 text-center shadow-sm">
        <PackageSearch size={36} className="text-neutro-300" />
        <p className="font-bold text-neutro-600">No hay productos acá</p>
        <p className="max-w-xs text-sm text-neutro-400">
          {busquedaActiva ? 'Nada coincide con la búsqueda.' : 'Esta selección no tiene productos activos.'}
        </p>
      </div>
    )
  }

  if (!bloques) {
    // Modo búsqueda: lista plana, con la categoría/subcategoría visible en
    // cada fila (no hay agrupado que ya lo diga).
    return (
      <div className="overflow-hidden rounded-xl border border-neutro-100 bg-white shadow-sm">
        {productos.map((p) => (
          <FilaProducto
            key={p.alegraId}
            producto={p}
            mostrarCategoria
            seleccionado={estaSeleccionado(p.alegraId)}
            onAlternarSeleccion={manejarAlternar}
            onEditar={onEditar}
            onSugerirFoto={onSugerirFoto}
            onDuplicar={onDuplicar}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {bloques.map((bloque) => {
        const ids = bloque.productos.map((p) => p.alegraId)
        const todosSeleccionados = ids.length > 0 && ids.every((id) => estaSeleccionado(id))
        return (
          <div key={bloque.nombre} className="overflow-hidden rounded-xl border border-neutro-100 bg-white shadow-sm">
            <div className={`flex items-center gap-2 border-b border-neutro-100 px-3 py-2 ${bloque.sinClasificar ? 'bg-alerta-50/60' : 'bg-neutro-50'}`}>
              <input
                type="checkbox"
                checked={todosSeleccionados}
                onChange={() => (todosSeleccionados ? deseleccionarTodos(ids) : seleccionarTodos(ids))}
                className="h-4 w-4 shrink-0 rounded border-neutro-300 text-primario-600 focus:ring-primario-500"
                title="Seleccionar todos los de este bloque"
              />
              <h3 className={`text-xs font-extrabold uppercase tracking-wide ${bloque.sinClasificar ? 'text-alerta-700' : 'text-neutro-600'}`}>
                {bloque.nombre}
              </h3>
              <span className="ml-auto shrink-0 text-[11px] font-bold text-neutro-400">{bloque.productos.length}</span>
            </div>
            {bloque.productos.map((p) => (
              <FilaProducto
                key={p.alegraId}
                producto={p}
                seleccionado={estaSeleccionado(p.alegraId)}
                onAlternarSeleccion={manejarAlternar}
                onEditar={onEditar}
                onSugerirFoto={onSugerirFoto}
                onDuplicar={onDuplicar}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
