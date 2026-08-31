import { Plus, Printer } from 'lucide-react'
import { formatDate } from '../../utils/impresionUtils'
import BuscadorProductoNuevo from './BuscadorProductoNuevo'

/**
 * Formulario completo de edición de una factura antes de reimprimir:
 * datos generales, tabla de productos editables (con buscador para los
 * nuevos), y las acciones de guardar/guardar e imprimir. Extraído de
 * Impresion.jsx (era renderFormularioEdicion).
 */
export default function FormularioEdicionFactura({
  facturaEditando,
  itemsEditados,
  procesando,
  productoBusqueda,
  onCancelar,
  onAgregarItem,
  onEliminarItem,
  onItemChange,
  onIniciarBusqueda,
  onCambiarTermino,
  onSeleccionarProducto,
  onGuardar
}) {
  return (
    <div className="bg-white border border-neutro-100 rounded-3xl p-6 mb-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-neutro-900">
          Editando Factura #{facturaEditando.numero_factura}
        </h3>
        <button
          onClick={onCancelar}
          className="px-4 py-2 border border-neutro-200 hover:bg-neutro-50 text-neutro-700 text-sm font-semibold rounded-xl transition"
        >
          Cancelar
        </button>
      </div>

      <div className="mb-5 p-4 bg-primario-50/50 rounded-2xl border border-primario-100">
        <p className="text-sm text-primario-900">
          <strong>Cliente:</strong> {facturaEditando.cliente_nombre} |
          <strong className="ml-3">Fecha:</strong> {formatDate(facturaEditando.fecha_emision)} |
          <strong className="ml-3">Total Original:</strong> ₡{(facturaEditando.total || 0).toLocaleString('es-CR')}
        </p>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h4 className="text-base font-bold text-neutro-900">Productos en la factura</h4>
        <button
          onClick={onAgregarItem}
          className="px-3.5 py-1.5 border border-primario-200 text-primario-600 hover:bg-primario-50 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
          type="button"
        >
          <Plus size={14} />
          Agregar producto
        </button>
      </div>

      <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
        {itemsEditados.map((item, index) => (
          <div key={index} className="bg-neutro-50/50 rounded-2xl border border-neutro-100 p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-neutro-400">Producto #{index + 1}</p>
                {!item.esNuevo && (
                  <p className="text-xxs text-neutro-400 font-medium">Importado desde Alegra</p>
                )}
                {!item.esNuevo && item.eliminar_por_faltante && (
                  <p className="mt-1 text-xs text-peligro-700 bg-peligro-50 border border-peligro-100 px-3 py-1 rounded-xl">
                    Este producto se eliminará automáticamente al reimprimir (faltante sin recibir)
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onEliminarItem(index)}
                className="px-2.5 py-1.5 border border-peligro-200 text-peligro-600 hover:bg-peligro-50 text-xs font-bold rounded-lg transition"
              >
                Quitar
              </button>
            </div>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-3">
                <label className="text-xxs uppercase tracking-wider text-neutro-500 font-semibold mb-1 block">Referencia</label>
                <input
                  type="text"
                  value={item.reference || ''}
                  onChange={(e) => onItemChange(index, 'reference', e.target.value)}
                  onFocus={() => item.esNuevo && onIniciarBusqueda(index)}
                  className="input input-sm w-full rounded-xl border-neutro-200 text-sm"
                  disabled={!item.esNuevo}
                  placeholder="Código o referencia"
                />
                {item.esNuevo ? (
                  <span className="inline-block mt-1 text-xxs text-alerta-700 bg-alerta-50 px-2 py-0.5 rounded-full border border-alerta-100 font-semibold">
                    Nuevo producto
                  </span>
                ) : (
                  <span className="inline-block mt-1 text-xxs text-neutro-400 font-medium">
                    Código original (no editable)
                  </span>
                )}
              </div>
              <div className="col-span-4">
                <label className="text-xxs uppercase tracking-wider text-neutro-500 font-semibold mb-1 block">Descripción</label>
                <input
                  type="text"
                  value={item.description || ''}
                  onChange={(e) => onItemChange(index, 'description', e.target.value)}
                  className={`input input-sm w-full rounded-xl border-neutro-200 text-sm ${item.esNuevo ? '' : 'bg-neutro-100/50 text-neutro-500'}`}
                  disabled={!item.esNuevo}
                  placeholder="Descripción del producto"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xxs uppercase tracking-wider text-neutro-500 font-semibold mb-1 block">Cantidad</label>
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => onItemChange(index, 'quantity', e.target.value)}
                  className="input input-sm w-full rounded-xl border-neutro-200 text-sm"
                  min="0"
                  step="1"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xxs uppercase tracking-wider text-neutro-500 font-semibold mb-1 block">Precio Unit.</label>
                <input
                  type="number"
                  value={item.price}
                  onChange={(e) => onItemChange(index, 'price', e.target.value)}
                  className="input input-sm w-full rounded-xl border-neutro-200 text-sm"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="col-span-1">
                <label className="text-xxs uppercase tracking-wider text-neutro-500 font-semibold mb-1 block">Subtotal</label>
                <div className="input input-sm w-full bg-neutro-100 flex items-center rounded-xl border-neutro-200 text-sm">
                  ₡{(item.quantity * item.price).toLocaleString('es-CR')}
                </div>
              </div>
            </div>
            <BuscadorProductoNuevo
              item={item}
              index={index}
              productoBusqueda={productoBusqueda}
              onIniciarBusqueda={onIniciarBusqueda}
              onCambiarTermino={onCambiarTermino}
              onSeleccionarProducto={onSeleccionarProducto}
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-3 justify-end border-t pt-4">
        <button
          onClick={() => onGuardar(false)}
          disabled={procesando}
          className="px-5 py-2.5 bg-primario-600 hover:bg-primario-700 text-white font-bold rounded-xl shadow-sm text-sm active:scale-[0.98] transition disabled:opacity-50"
        >
          {procesando ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          onClick={() => onGuardar(true)}
          disabled={procesando}
          className="px-5 py-2.5 bg-primario-800 hover:bg-primario-900 text-white font-bold rounded-xl shadow-sm text-sm active:scale-[0.98] transition disabled:opacity-50 flex items-center gap-1.5"
        >
          <Printer size={16} />
          {procesando ? 'Guardando...' : 'Guardar e Imprimir'}
        </button>
      </div>
    </div>
  )
}
