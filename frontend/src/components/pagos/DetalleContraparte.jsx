import { ArrowLeft } from 'lucide-react'
import { formatCurrency } from '../../utils/pagos'

/**
 * La cabecera del detalle: quién es, cuánto suma, y el camino de vuelta.
 *
 * El botón de volver va arriba de todo y no adentro de la tarjeta: cuando
 * uno entra a un cliente para cobrarle, lo primero que necesita después es
 * salir a buscar al siguiente.
 *
 * `acciones` es el hueco de cada módulo — en cobrar, mandar el recordatorio
 * por WhatsApp; en pagar, todavía nada.
 */
export default function DetalleContraparte({
  nombre, subtitulo, icono: Icono, cantidadFacturas, totalSaldo,
  etiquetaTotal = 'Saldo total', textoVolver, onVolver, acciones, children
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={onVolver} className="flex items-center text-neutro-500 hover:text-primario-600 transition-colors">
          <ArrowLeft className="mr-2" size={20} /> {textoVolver}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutro-100 p-6 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5 min-w-0">
          <div className="p-4 rounded-xl bg-primario-100 shrink-0">
            <Icono className="text-primario-600" size={32} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-neutro-900 truncate">{nombre}</h1>
            {subtitulo && <p className="text-sm text-neutro-500 mt-0.5">{subtitulo}</p>}
          </div>
        </div>

        {acciones}

        <div className="flex bg-neutro-50 p-4 rounded-xl divide-x divide-neutro-200 shrink-0">
          <div className="px-5 text-center">
            <p className="text-sm text-neutro-500 font-medium">Facturas</p>
            <p className="text-2xl font-bold text-neutro-900">{cantidadFacturas}</p>
          </div>
          <div className="px-5 text-center">
            <p className="text-sm text-neutro-500 font-medium">{etiquetaTotal}</p>
            <p className="text-2xl font-bold text-primario-600">{formatCurrency(totalSaldo)}</p>
          </div>
        </div>
      </div>

      {children}
    </div>
  )
}
