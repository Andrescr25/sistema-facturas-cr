import { Link } from 'react-router-dom'
import { ArrowLeft, CalendarDays } from 'lucide-react'

/**
 * Se factura desde una visita de Preventa: el camino de vuelta a la agenda,
 * siempre a la vista (F3 del agente, 2026-10-29). Si el cliente no está en la
 * copia del dispositivo, se dice qué hacer.
 */
export default function VolverAPreventa({ volverA, clienteNoEsta }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primario-200 bg-primario-50 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-primario-800">
        <CalendarDays size={16} />
        {clienteNoEsta
          ? 'Ese cliente no está en el catálogo de este dispositivo: actualizalo y volvé a tocar Facturar.'
          : 'Facturando desde una visita de Preventa.'}
      </p>
      <Link to={volverA} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-primario-700 hover:bg-primario-100">
        <ArrowLeft size={15} />Volver a la agenda
      </Link>
    </div>
  )
}
