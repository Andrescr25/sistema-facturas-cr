import { FileText, AlertCircle, Printer } from 'lucide-react'

/**
 * Vista de una factura "requiere cambios" antes de entrar al modo edición
 * completo: muestra los ajustes ya detectados (faltantes) que se
 * aplicarán automáticamente. Extraído de Impresion.jsx (era
 * renderCambiosAutomaticos).
 */
export default function CambiosAutomaticos({ factura, procesando, onEditar, onVerPDF, onGuardar }) {
  return (
    <div className="bg-neutro-50 border border-neutro-200 rounded-3xl p-6 mb-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
        <div>
          <h3 className="text-lg font-bold text-neutro-900 flex items-center gap-2">
            <FileText size={18} className="text-primario-600" />
            Cambios por Ajustes Previos
          </h3>
          <p className="text-sm text-neutro-500">
            Estos cambios se aplicarán automáticamente con precios actualizados.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onEditar(factura)}
            className="px-4 py-2 border border-neutro-200 hover:bg-neutro-100 text-neutro-700 text-sm font-semibold rounded-xl transition active:scale-[0.98]"
          >
            Editar Factura
          </button>
          <button
            onClick={() => onVerPDF(factura)}
            className="px-4 py-2 border border-neutro-200 hover:bg-neutro-100 text-neutro-700 text-sm font-semibold rounded-xl transition active:scale-[0.98]"
          >
            Ver PDF
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {factura.ajustes_realizados?.map((ajuste, index) => (
          <div key={index} className="bg-white rounded-2xl p-4 border border-neutro-100 shadow-xxs">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-neutro-900">{ajuste.producto_nombre}</p>
                <p className="text-xs text-neutro-400">Código: {ajuste.producto_codigo}</p>
              </div>
              <div className={`px-3 py-1 rounded-xl text-xs font-semibold border ${
                ajuste.estado === 'completo'
                  ? 'bg-exito-50 text-exito-700 border-exito-100'
                  : ajuste.estado === 'parcial'
                    ? 'bg-alerta-50 text-alerta-700 border-alerta-100'
                    : 'bg-peligro-50 text-peligro-700 border-peligro-100'
              }`}>
                {ajuste.estado === 'completo' ? 'Completo' :
                  ajuste.estado === 'parcial' ? 'Parcial' : 'No llegó'}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-neutro-500">Faltante:</span>
                <span className="ml-1.5 font-bold text-neutro-800">{ajuste.cantidad_faltante}</span>
              </div>
              <div>
                <span className="text-neutro-500">Entregado:</span>
                <span className="ml-1.5 font-bold text-neutro-800">{ajuste.cantidad_entregada}</span>
              </div>
            </div>
            {ajuste.requiere_actualizacion && (
              <p className="mt-2 text-xs text-alerta-700 font-semibold bg-alerta-50 px-2.5 py-1 rounded-lg border border-alerta-100 inline-flex items-center gap-1">
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
          className="px-5 py-2.5 bg-primario-600 hover:bg-primario-700 text-white font-bold rounded-xl shadow-sm text-sm active:scale-[0.98] transition disabled:opacity-50"
        >
          {procesando ? 'Procesando...' : 'Guardar'}
        </button>
        <button
          onClick={() => onGuardar(true)}
          disabled={procesando}
          className="px-5 py-2.5 bg-primario-800 hover:bg-primario-900 text-white font-bold rounded-xl shadow-sm text-sm active:scale-[0.98] transition disabled:opacity-50 flex items-center gap-1.5"
        >
          <Printer size={16} />
          {procesando ? 'Procesando...' : 'Guardar e Imprimir'}
        </button>
      </div>
    </div>
  )
}
