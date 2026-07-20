import { X, Edit, Loader2, Trash2, Check } from 'lucide-react'

/**
 * Modal para editar nombre/referencia/precio/costo de un producto, con
 * eliminación (doble click de confirmación) integrada. Extraído de
 * GestionCatalogo.jsx.
 */
export default function ModalEditarProducto({
  editName,
  setEditName,
  editRef,
  setEditRef,
  editPrice,
  setEditPrice,
  editCost,
  setEditCost,
  editCategoria,
  setEditCategoria,
  categorias,
  savingEdit,
  confirmDelete,
  deletingProduct,
  onSubmit,
  onEliminar,
  onCerrar
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
            <Edit className="h-5 w-5 text-blue-500" /> Editar Producto
          </h3>
          <button
            onClick={onCerrar}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700">Nombre del Producto:</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
              placeholder="Ej: Coca Cola Sabor Original 350ml"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700">Referencia (Código de Barras/Interno):</label>
            <input
              type="text"
              value={editRef}
              onChange={(e) => setEditRef(e.target.value)}
              required
              placeholder="Ej: 744100123456"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700">Categoría:</label>
            <select
              value={editCategoria}
              onChange={(e) => setEditCategoria(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            >
              <option value="">Sin cambios</option>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">Precio de Venta (₡):</label>
              <input
                type="number"
                step="0.01"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                required
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">Costo Unitario (₡):</label>
              <input
                type="number"
                step="0.01"
                value={editCost}
                onChange={(e) => setEditCost(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-between items-center gap-3 mt-6">
            {/* Delete button (left side) */}
            <button
              type="button"
              onClick={onEliminar}
              disabled={deletingProduct || savingEdit}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all duration-200 disabled:opacity-50 ${
                confirmDelete
                  ? 'bg-red-600 text-white hover:bg-red-700 shadow-md'
                  : 'border border-red-200 text-red-500 hover:bg-red-50'
              }`}
            >
              {deletingProduct ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {confirmDelete ? '¿Confirmar?' : 'Eliminar'}
            </button>

            {/* Right side actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCerrar}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 font-semibold hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg text-sm hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {savingEdit ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Guardar Cambios
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
