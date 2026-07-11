import { Users } from 'lucide-react'

/**
 * Modal para reasignar los productos seleccionados a otro proveedor de
 * Alegra, con búsqueda y opción de registrar uno nuevo. Extraído de
 * ReporteProveedores.jsx.
 */
export default function ModalAsignarProveedor({
  cantidadSeleccionados,
  busquedaProveedor,
  setBusquedaProveedor,
  proveedoresAlegra,
  loadingProveedores,
  onBuscar,
  onAsignar,
  onCrearNuevo,
  onCerrar
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Reclasificar / Cambiar Proveedor</h2>
          <p className="text-gray-600 mt-1">
            Mover <span className="font-medium text-blue-600">{cantidadSeleccionados} producto{cantidadSeleccionados > 1 ? 's' : ''}</span> al inventario de otra entidad.
          </p>
        </div>
        <div className="p-6 border-b border-gray-200">
          <div className="flex gap-2">
            <input type="text" value={busquedaProveedor} onChange={(e) => setBusquedaProveedor(e.target.value)} onKeyPress={(e) => { if (e.key === 'Enter') onBuscar(busquedaProveedor) }} placeholder="Buscar nombre de entidad..." className="input flex-1" />
            <button onClick={() => onBuscar(busquedaProveedor)} className="btn btn-primary" disabled={loadingProveedores}>{loadingProveedores ? 'Cargando...' : 'Buscar'}</button>
            <button onClick={onCrearNuevo} className="btn btn-outline">+ Registrar Nuevo</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {loadingProveedores ? (
            <div className="text-center py-8"><div className="spinner mx-auto mb-4"></div></div>
          ) : proveedoresAlegra.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Busca el proveedor destino en la barra superior.</div>
          ) : (
            <div className="grid gap-2">
              {proveedoresAlegra.map((prov) => (
                <button key={prov.id} onClick={() => onAsignar(prov.id)} className="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all">
                  <div className="flex items-center justify-between">
                    <div><p className="font-bold text-gray-900">{prov.name}</p><p className="text-xs text-gray-500 mt-1">{prov.identification || 'Sin identificación'}</p></div>
                    <Users className="text-blue-500" size={20} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 bg-white">
          <button onClick={onCerrar} className="btn btn-outline w-full py-3">Cancelar y Volver</button>
        </div>
      </div>
    </div>
  )
}
