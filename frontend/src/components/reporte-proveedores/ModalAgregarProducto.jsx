/**
 * Modal de búsqueda para agregar manualmente un producto a la orden de
 * compra de un proveedor. Extraído de ReporteProveedores.jsx. La cantidad
 * a añadir se pide con el diálogo propio (onAgregarConCantidad, ver
 * solicitarCantidadYAgregar en useReporteProveedores) en vez del prompt()
 * nativo del navegador.
 */
export default function ModalAgregarProducto({
  proveedor,
  busquedaProducto,
  setBusquedaProducto,
  productosAlegra,
  loadingProductos,
  onBuscar,
  onAgregarConCantidad,
  onCerrar
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-neutro-100 flex justify-between items-center">
          <div><h2 className="text-2xl font-bold text-neutro-900">Buscar Producto Adicional</h2><p className="text-neutro-500 text-sm mt-1">Agregando a {proveedor.nombre}</p></div>
        </div>
        <div className="p-4 border-b border-neutro-100 bg-neutro-50">
          <input type="text" value={busquedaProducto} onChange={(e) => { setBusquedaProducto(e.target.value); if (e.target.value.length >= 2) onBuscar(e.target.value); }} placeholder="Tipea nombre o código referencial..." className="w-full px-4 py-3 border border-neutro-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primario-500 outline-none" autoFocus />
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-white">
          {loadingProductos ? (<div className="text-center py-4"><div className="spinner mx-auto"></div></div>) : productosAlegra.length === 0 ? (<div className="text-center py-6 text-neutro-400">Sin coincidencias.</div>) : (
            <div className="grid gap-2">
              {productosAlegra.map((p, i) => {
                const reference = typeof p.reference === 'object' ? p.reference?.reference || p.reference?.code : p.reference
                return (
                  <div key={i} className="p-3 border border-neutro-100 rounded-lg flex items-center justify-between hover:bg-neutro-50">
                    <div><p className="font-semibold text-neutro-800">{p.name}</p><p className="text-xs text-neutro-500">{reference}</p></div>
                    <button onClick={() => onAgregarConCantidad(p, reference)} className="btn btn-sm btn-primary">+ Añadir</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-neutro-100"><button onClick={onCerrar} className="btn btn-outline w-full font-semibold border-neutro-300 text-neutro-600 hover:bg-neutro-100">Cerrar buscador</button></div>
      </div>
    </div>
  )
}
