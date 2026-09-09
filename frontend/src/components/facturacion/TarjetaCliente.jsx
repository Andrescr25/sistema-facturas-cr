import { User, RefreshCcw } from 'lucide-react'

/**
 * El cliente ya elegido, arriba de todo mientras dura la factura.
 *
 * Compacta a propósito: una vez elegido el cliente deja de ser el
 * protagonista y lo que importa es la lista de productos. Antes ocupaba una
 * tarjeta verde grande con el nombre a 24px, que en el teléfono se comía la
 * primera pantalla entera.
 */
export default function TarjetaCliente({ cliente, onCambiarCliente }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-exito-200 bg-exito-50 p-3 md:p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-exito-100 text-exito-700">
        <User size={20} />
      </span>

      <div className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-exito-700">Facturando a</span>
        <p className="truncate font-bold leading-tight text-exito-900">{cliente.name}</p>
        {cliente.identification && (
          <p className="truncate text-xs text-exito-700">Cédula {cliente.identification}</p>
        )}
      </div>

      <button
        onClick={onCambiarCliente}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-exito-300 bg-white px-3 py-2 text-xs font-bold text-exito-800 transition-colors hover:bg-exito-100"
      >
        <RefreshCcw size={14} />
        <span className="hidden sm:inline">Cambiar</span>
      </button>
    </div>
  )
}
