import { FileText, AlertCircle, Printer } from 'lucide-react'

/**
 * Vista de una factura "requiere cambios" antes de entrar al modo edición
 * completo: muestra los ajustes ya detectados (faltantes) que se
 * aplicarán automáticamente. Extraído de Impresion.jsx (era
 * renderCambiosAutomaticos).
 */
export default function CambiosAutomaticos({ factura, procesando, onEditar, onVerPDF, onGuardar }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 mb-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileText size={18} className="text-blue-600" />
            Cambios por Ajustes Previos
          </h3>
          <p className="text-sm text-gray-500">
            Estos cambios se aplicarán automáticamente con precios actualizados.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onEditar(factura)}
            className="px-4 py-2 border border-gray-200 hover:bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl transition active:scale-[0.98]"
          >
            Editar Factura
          </button>
          <button
            onClick={() => onVerPDF(factura)}
            className="px-4 py-2 border border-gray-200 hover:bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl transition active:scale-[0.98]"
          >
            Ver PDF
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {factura.ajustes_realizados?.map((ajuste, index) => (
          <div key={index} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xxs">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900">{ajuste.producto_nombre}</p>
                <p className="text-xs text-gray-400">Código: {ajuste.producto_codigo}</p>
              </div>
              <div className={`px-3 py-1 rounded-xl text-xs font-semibold border ${
                ajuste.estado === 'completo'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : ajuste.estado === 'parcial'
                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                    : 'bg-rose-50 text-rose-700 border-rose-100'
              }`}>
                {ajuste.estado === 'completo' ? 'Completo' :
                  ajuste.estado === 'parcial' ? 'Parcial' : 'No llegó'}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-500">Faltante:</span>
                <span className="ml-1.5 font-bold text-gray-800">{ajuste.cantidad_faltante}</span>
              </div>
              <div>
                <span className="text-gray-500">Entregado:</span>
                <span className="ml-1.5 font-bold text-gray-800">{ajuste.cantidad_entregada}</span>
              </div>
            </div>
            {ajuste.requiere_actualizacion && (
              <p className="mt-2 text-xs text-amber-700 font-semibold bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100 inline-flex items-center gap-1">
                <AlertCircle size={12} />
                Se actualizará cantidad y precio en la factura
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-3 justify-end">
        <button
          onClick={() => onGuardar(false)}
          disabled={procesando}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm text-sm active:scale-[0.98] transition disabled:opacity-50"
        >
          {procesando ? 'Procesando...' : 'Guardar'}
        </button>
        <button
          onClick={() => onGuardar(true)}
          disabled={procesando}
          className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-sm text-sm active:scale-[0.98] transition disabled:opacity-50 flex items-center gap-1.5"
        >
          <Printer size={16} />
          {procesando ? 'Procesando...' : 'Guardar e Imprimir'}
        </button>
      </div>
    </div>
  )
}
