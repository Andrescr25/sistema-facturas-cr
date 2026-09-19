import { AlertCircle, Search, Settings2, Tags, Truck } from 'lucide-react'

/**
 * Barra de búsqueda, filtro por proveedor y filtro "solo sin imagen" del
 * catálogo, con el total de productos. Extraído de GestionCatalogo.jsx.
 */
export default function FiltrosCatalogo({
  searchQuery, setSearchQuery,
  missingImageOnly, setMissingImageOnly,
  proveedorFiltro, setProveedorFiltro, proveedoresCatalogo,
  subcategorias = [], subcategoriaFiltro, setSubcategoriaFiltro, onAbrirSubcategorias,
  totalProductos
}) {
  const { proveedores = [], sinProveedor = null } = proveedoresCatalogo || {}

  // Agrupadas por categoría: el desplegable de "Productos de PVC" no tiene por
  // qué mostrar las de Pesca. Van con `optgroup` para que se lean como lo que
  // son, una dentro de otra.
  const porCategoria = subcategorias.reduce((mapa, s) => {
    if (!mapa.has(s.categoria)) mapa.set(s.categoria, [])
    mapa.get(s.categoria).push(s)
    return mapa
  }, new Map())

  return (
    <div className="bg-white rounded-xl shadow-md p-4 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 border border-neutro-100">
      <div className="relative flex-1 min-w-0">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutro-400">
          <Search className="h-5 w-5" />
        </span>
        <input
          type="text"
          placeholder="Buscar por nombre, código de referencia o descripción..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-neutro-50 border border-neutro-200 rounded-lg text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500 focus:bg-white transition-all text-sm"
        />
      </div>

      {/* Proveedor. Va por cédula: el mismo proveedor aparece escrito de dos
          formas en las facturas, y el nombre que se ve es el más reciente.
          El número es cuántos productos salen al elegirlo. Si la lista no
          cargó, el filtro no se muestra. */}
      {proveedores.length > 0 && (
        <div className="relative lg:w-72">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutro-400">
            <Truck className="h-4 w-4" />
          </span>
          <select
            value={proveedorFiltro}
            onChange={(e) => setProveedorFiltro(e.target.value)}
            aria-label="Filtrar por proveedor"
            className={`w-full pl-9 pr-8 py-2.5 border rounded-lg text-sm truncate focus:outline-none focus:ring-2 focus:ring-primario-500 focus:bg-white transition-all ${
              proveedorFiltro ? 'bg-primario-50 border-primario-300 font-semibold text-primario-800' : 'bg-neutro-50 border-neutro-200 text-neutro-900'
            }`}
          >
            <option value="">Todos los proveedores</option>
            {proveedores.map(p => (
              <option key={p.cedula} value={p.cedula}>{p.nombre} ({p.productos})</option>
            ))}
            {sinProveedor?.productos > 0 && (
              <option value={sinProveedor.valor}>Sin proveedor relacionado ({sinProveedor.productos})</option>
            )}
          </select>
        </div>
      )}

      {/* Subcategoría. Es NUESTRA, no de Alegra: sirve para partir las bolsas
          grandes. "Sin clasificar" es la lista que hay que ir vaciando. */}
      {/* El botón de administrar va SIEMPRE, aunque todavía no haya ninguna:
          si dependiera de que existan, no habría por dónde crear la primera.
          El desplegable sí espera a que haya algo que elegir. */}
      <div className="relative lg:w-64 flex items-center gap-1">
        {subcategorias.length > 0 && (
          <>
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutro-400">
            <Tags className="h-4 w-4" />
          </span>
          <select
            value={subcategoriaFiltro}
            onChange={(e) => setSubcategoriaFiltro(e.target.value)}
            aria-label="Filtrar por subcategoría"
            className={`w-full pl-9 pr-8 py-2.5 border rounded-lg text-sm truncate focus:outline-none focus:ring-2 focus:ring-primario-500 focus:bg-white transition-all ${
              subcategoriaFiltro ? 'bg-primario-50 border-primario-300 font-semibold text-primario-800' : 'bg-neutro-50 border-neutro-200 text-neutro-900'
            }`}
          >
            <option value="">Todas las subcategorías</option>
            {[...porCategoria.entries()].map(([categoria, lista]) => (
              <optgroup key={categoria} label={categoria}>
                {lista.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.nombre} ({s.productos})</option>
                ))}
                <option value={`sin:${categoria}`}>— Sin clasificar —</option>
              </optgroup>
            ))}
          </select>
          </>
        )}
        {onAbrirSubcategorias && (
          <button
            type="button"
            onClick={onAbrirSubcategorias}
            title="Crear, renombrar o desactivar subcategorías"
            className={`shrink-0 rounded-lg border border-neutro-200 bg-neutro-50 p-2.5 text-neutro-500 hover:bg-neutro-100 ${
              subcategorias.length === 0 ? 'w-full flex items-center justify-center gap-2 text-sm font-semibold' : ''
            }`}
          >
            <Settings2 className="h-4 w-4" />
            {subcategorias.length === 0 && 'Subcategorías'}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between lg:justify-end gap-6">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={missingImageOnly}
            onChange={(e) => setMissingImageOnly(e.target.checked)}
            className="sr-only peer"
          />
          <div className="relative w-11 h-6 bg-neutro-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primario-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-neutro-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primario-600"></div>
          <span className="text-sm font-semibold text-neutro-700 flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-alerta-500" /> Mostrar sólo sin imagen
          </span>
        </label>

        <div className="text-xs text-neutro-400 font-medium">
          Total en base local: <span className="font-bold text-neutro-700 text-sm">{totalProductos}</span>
        </div>
      </div>
    </div>
  )
}
