import { useState } from 'react'
import { X, Edit, Loader2, Trash2, Check, Plus } from 'lucide-react'
import { useModal } from '../../hooks/useModal'

/**
 * Modal para editar nombre/referencia/precio/costo de un producto, con
 * eliminación (doble click de confirmación) integrada. Extraído de
 * GestionCatalogo.jsx.
 *
 * LOS DOS NÚMEROS NO ESTÁN EN LA MISMA BASE, Y AHORA SE DICE
 * En Alegra el precio se guarda SIN impuesto y el costo CON él. Los dos
 * campos estaban uno al lado del otro sin ninguna etiqueta, así que de
 * ₡5.625 de precio contra ₡4.764,64 de costo se leía un margen del 15%
 * cuando el real es del 25%.
 *
 * El precio con IVA se calcula mientras se escribe: es el número que ve el
 * cliente, y es el que hay que poder comparar contra el costo.
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
  producto,
  subcategorias = [],
  onCrearSubcategoria,
  onAsignarSubcategoria,
  taxPercentage,
  savingEdit,
  confirmDelete,
  deletingProduct,
  onSubmit,
  onEliminar,
  onCerrar
}) {
  useModal(onCerrar)

  // La subcategoría es NUESTRA y se guarda aparte: no viaja a Alegra con el
  // resto del formulario, así que se aplica al elegirla y no al guardar. Si
  // fuera al guardar, cambiarla obligaría a mandar también nombre y precio a
  // Alegra sin necesidad.
  const categoriaDelProducto = producto?.category || ''
  const suyas = subcategorias.filter(s => s.categoria === categoriaDelProducto && s.activo)
  const [nueva, setNueva] = useState('')
  const [creando, setCreando] = useState(false)
  const [errorSub, setErrorSub] = useState(null)

  const crear = async () => {
    const nombre = nueva.trim()
    if (!nombre) return
    setCreando(true); setErrorSub(null)
    try {
      const s = await onCrearSubcategoria(categoriaDelProducto, nombre)
      await onAsignarSubcategoria(producto.alegraId, s.id)
      setNueva('')
    } catch (e) {
      setErrorSub(e?.response?.data?.message || 'No se pudo crear.')
    } finally {
      setCreando(false)
    }
  }

  // null/undefined es "todavía no se sincronizó el impuesto de este
  // producto", que no es lo mismo que exento: ahí no se muestra un número
  // inventado.
  const iva = taxPercentage === null || taxPercentage === undefined ? null : Number(taxPercentage)
  const precioNum = parseFloat(editPrice)
  const precioConIva = iva !== null && Number.isFinite(precioNum)
    ? Math.round(precioNum * (1 + iva / 100) * 100) / 100
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutro-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-neutro-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-5 border-b border-neutro-100 bg-neutro-50">
          <h3 className="text-base font-bold text-neutro-900 flex items-center gap-1.5">
            <Edit className="h-5 w-5 text-primario-500" /> Editar Producto
          </h3>
          <button
            onClick={onCerrar}
            className="p-2 text-neutro-400 hover:text-neutro-600 rounded-lg hover:bg-neutro-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-neutro-700">Nombre del Producto:</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
              placeholder="Ej: Coca Cola Sabor Original 350ml"
              className="w-full px-3 py-2 bg-neutro-50 border border-neutro-200 rounded-lg text-sm text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500 focus:bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-neutro-700">Referencia (Código de Barras/Interno):</label>
            <input
              type="text"
              value={editRef}
              onChange={(e) => setEditRef(e.target.value)}
              required
              placeholder="Ej: 744100123456"
              className="w-full px-3 py-2 bg-neutro-50 border border-neutro-200 rounded-lg text-sm text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500 focus:bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-neutro-700">Categoría:</label>
            <select
              value={editCategoria}
              onChange={(e) => setEditCategoria(e.target.value)}
              className="w-full px-3 py-2 bg-neutro-50 border border-neutro-200 rounded-lg text-sm text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500 focus:bg-white"
            >
              <option value="">Sin cambios</option>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Subcategoría. No va a Alegra: es nuestra, y sirve para que
              "Productos de PVC" deje de ser una bolsa de 118 piezas. Se aplica
              al elegirla, no al guardar. */}
          {categoriaDelProducto && onAsignarSubcategoria && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutro-700">
                Subcategoría <span className="font-normal text-neutro-400">· dentro de {categoriaDelProducto}</span>
              </label>
              <select
                value={producto?.subcategoria?.id ? String(producto.subcategoria.id) : ''}
                onChange={(e) => onAsignarSubcategoria(producto.alegraId, e.target.value || null)}
                className="w-full px-3 py-2 bg-neutro-50 border border-neutro-200 rounded-lg text-sm text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500 focus:bg-white"
              >
                <option value="">Sin clasificar</option>
                {suyas.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.nombre}</option>
                ))}
              </select>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crear() } }}
                  placeholder={`Nueva subcategoría en ${categoriaDelProducto}`}
                  maxLength={80}
                  className="flex-1 px-3 py-1.5 bg-white border border-neutro-200 rounded-lg text-xs text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500"
                />
                <button
                  type="button"
                  onClick={crear}
                  disabled={creando || !nueva.trim()}
                  className="inline-flex items-center gap-1 rounded-lg border border-neutro-200 bg-neutro-50 px-2.5 py-1.5 text-xs font-bold text-neutro-700 disabled:opacity-40"
                >
                  {creando ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Crear
                </button>
              </div>
              {errorSub && <p className="text-xs font-semibold text-peligro-600">{errorSub}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutro-700">Precio de Venta (₡) — sin IVA:</label>
              <input
                type="number"
                step="0.01"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                required
                className="w-full px-3 py-2 bg-neutro-50 border border-neutro-200 rounded-lg text-sm text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500 focus:bg-white"
              />
              <p className="text-[11px] text-neutro-500">
                {precioConIva !== null
                  ? <>Con IVA ({iva}%): <span className="font-bold text-neutro-800">₡{precioConIva.toLocaleString('es-CR')}</span></>
                  : 'Sin dato de impuesto todavía: sincronizá el catálogo para ver el precio con IVA.'}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutro-700">Costo Unitario (₡) — con IVA:</label>
              <input
                type="number"
                step="0.01"
                value={editCost}
                onChange={(e) => setEditCost(e.target.value)}
                className="w-full px-3 py-2 bg-neutro-50 border border-neutro-200 rounded-lg text-sm text-neutro-900 focus:outline-none focus:ring-2 focus:ring-primario-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-neutro-100 flex justify-between items-center gap-3 mt-6">
            {/* Delete button (left side) */}
            <button
              type="button"
              onClick={onEliminar}
              disabled={deletingProduct || savingEdit}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all duration-200 disabled:opacity-50 ${
                confirmDelete
                  ? 'bg-peligro-600 text-white hover:bg-peligro-700 shadow-md'
                  : 'border border-peligro-200 text-peligro-500 hover:bg-peligro-50'
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
                className="px-4 py-2 border border-neutro-200 rounded-lg text-sm text-neutro-600 font-semibold hover:bg-neutro-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="px-5 py-2 bg-primario-600 text-white font-bold rounded-lg text-sm hover:bg-primario-700 transition-colors flex items-center gap-1.5 shadow-md disabled:opacity-50"
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
