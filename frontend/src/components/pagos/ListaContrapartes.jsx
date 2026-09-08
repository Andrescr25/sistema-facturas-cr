import { AlertTriangle } from 'lucide-react'
import { formatCurrency } from '../../utils/pagos'

/**
 * La cuadrícula de clientes que deben, o de proveedores a los que se les
 * debe. Es la pantalla de entrada de los dos módulos.
 *
 * POR QUÉ AGRUPADO Y NO FACTURA POR FACTURA
 * Pagos a Proveedores listaba las facturas sueltas: una misma cooperativa
 * aparecía cuatro veces seguidas y no había forma de ver de un vistazo
 * cuánto se le debe en total, que es la pregunta que uno se hace antes de ir
 * a pagar. Cuentas por Cobrar ya agrupaba por cliente y entraba al detalle;
 * este componente es ese diseño, ahora para los dos.
 *
 * @param {Array<{id, nombre, subtitulo?, facturas, totalSaldo, urgente?}>} grupos
 */
export default function ListaContrapartes({
  grupos, icono: Icono, onSeleccionar,
  vacioTitulo, vacioDetalle, etiquetaUrgente = 'Tiene facturas vencidas'
}) {
  if (grupos.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutro-100 text-center py-16">
        <Icono className="mx-auto text-neutro-300 mb-4" size={64} />
        <h3 className="text-xl font-bold text-neutro-900 mb-2">{vacioTitulo}</h3>
        <p className="text-neutro-500">{vacioDetalle}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {grupos.map((grupo) => (
        <div
          key={grupo.id}
          onClick={() => onSeleccionar(grupo.id)}
          className={`group bg-white rounded-xl shadow-sm hover:shadow-lg border p-6 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden ${
            grupo.urgente ? 'border-peligro-200 ring-1 ring-peligro-100' : 'border-neutro-100'
          }`}
        >
          <div className="absolute top-0 right-0 w-16 h-16 bg-primario-50 rounded-bl-[100px] -z-10 group-hover:bg-primario-100 transition-colors" />

          <div className="flex items-center gap-3 mb-3">
            <div className={`p-2.5 rounded-lg ${grupo.urgente ? 'bg-peligro-100' : 'bg-primario-100'}`}>
              <Icono className={grupo.urgente ? 'text-peligro-600' : 'text-primario-600'} size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-neutro-900 truncate">{grupo.nombre}</h3>
              {grupo.subtitulo && (
                <p className="text-xs text-neutro-500 truncate">{grupo.subtitulo}</p>
              )}
            </div>
          </div>

          {grupo.urgente && (
            <div className="mb-3">
              <span className="text-[10px] bg-peligro-500 text-white px-2 py-0.5 rounded-full font-bold uppercase inline-flex items-center gap-1">
                <AlertTriangle size={10} /> {etiquetaUrgente}
              </span>
            </div>
          )}

          <div className="flex items-center gap-4 pt-3 border-t border-neutro-50">
            <div>
              <p className="text-xs text-neutro-400 uppercase tracking-wider font-semibold">Facturas</p>
              <p className="text-xl font-bold text-neutro-800">{grupo.facturas.length}</p>
            </div>
            <div className="h-8 w-[1px] bg-neutro-200" />
            <div>
              <p className="text-xs text-neutro-400 uppercase tracking-wider font-semibold">Saldo total</p>
              <p className="text-xl font-bold text-primario-600">{formatCurrency(grupo.totalSaldo)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
