import { ChevronRight } from 'lucide-react'
import { formatCurrency, formatDate, diasLabel, estiloEstado, colorVencimiento } from '../../utils/pagos'

/**
 * Las facturas de una contraparte: tarjetas en el teléfono, tabla en la
 * pantalla grande.
 *
 * Es el diseño que tenía Cuentas por Cobrar y que ahora usan los dos. Pagos
 * a Proveedores mostraba cada factura como una tarjeta grande con todos los
 * datos —emisión, vencimiento, condición, plazo, notas— y cuatro facturas
 * llenaban la pantalla. Acá se muestra lo que sirve para decidir a cuál
 * entrar: número, cuándo vence, en qué estado está y cuánto queda. El resto
 * sigue estando, en el detalle de cada una.
 *
 * `accion` es el botón de la derecha que agrega cada módulo (mandar la
 * factura por WhatsApp, en cobrar).
 */
export default function TablaFacturas({
  facturas, columnaFecha = 'Vencimiento', onSeleccionar, accion, vacio
}) {
  if (facturas.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutro-100 text-center py-12">
        <p className="text-neutro-500">{vacio}</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutro-100 overflow-hidden">
      {/* Teléfono */}
      <div className="block sm:hidden divide-y divide-neutro-100">
        {facturas.map((f) => {
          const estilo = estiloEstado(f.estado)
          return (
            <div
              key={f.id}
              onClick={() => onSeleccionar(f)}
              className={`p-4 active:bg-neutro-50 cursor-pointer flex flex-col gap-2 border-l-4 ${estilo.borde}`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h4 className="font-bold text-neutro-900 truncate">Factura #{f.numero}</h4>
                  <p className="text-xs text-neutro-400">
                    {formatDate(f.fechaVencimiento)} • {diasLabel(f.diasRestantes)}
                  </p>
                </div>
                <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${estilo.badge}`}>
                  {estilo.etiqueta}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-xs text-neutro-500">Saldo</span>
                <strong className="text-lg text-neutro-900">{formatCurrency(f.saldo)}</strong>
              </div>
              {f.nota && (
                <p className="text-xs text-exito-700 bg-exito-50 rounded-lg px-2 py-1">{f.nota}</p>
              )}
              {accion && (
                <div className="self-start" onClick={(e) => e.stopPropagation()}>
                  {accion(f)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Pantalla grande */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-neutro-50 text-xs font-bold text-neutro-400 uppercase tracking-wider border-b border-neutro-100">
              <th className="px-6 py-4">Factura</th>
              <th className="px-6 py-4">{columnaFecha}</th>
              <th className="px-6 py-4">Estado</th>
              <th className="px-6 py-4 text-right">Saldo</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutro-100 text-sm">
            {facturas.map((f) => {
              const estilo = estiloEstado(f.estado)
              return (
                <tr
                  key={f.id}
                  onClick={() => onSeleccionar(f)}
                  className="hover:bg-neutro-50/70 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4">
                    <p className="font-bold text-neutro-900 group-hover:text-primario-700 transition-colors">#{f.numero}</p>
                  </td>
                  <td className="px-6 py-4 text-neutro-500">
                    {formatDate(f.fechaVencimiento)}
                    <span className={`block text-xs mt-0.5 ${colorVencimiento(f.diasRestantes)}`}>
                      {diasLabel(f.diasRestantes)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center font-bold text-xs px-3 py-1 rounded-full uppercase tracking-wider ${estilo.badge}`}>
                      {estilo.etiqueta}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-extrabold text-neutro-900">{formatCurrency(f.saldo)}</span>
                    {f.nota && (
                      <span className="block text-xs text-exito-700 mt-0.5">{f.nota}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    {/* stopPropagation: la fila entera abre el detalle; sin
                        esto, la acción de al lado lo abriría también. */}
                    {accion && (
                      <span className="mr-3" onClick={(e) => e.stopPropagation()}>{accion(f)}</span>
                    )}
                    <ChevronRight className="text-neutro-400 group-hover:text-primario-600 transition-colors inline-block" size={20} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
