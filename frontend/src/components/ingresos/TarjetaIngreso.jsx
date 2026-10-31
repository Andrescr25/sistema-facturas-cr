import { ChevronRight } from 'lucide-react'

/**
 * Una parte de lo que gana, en grande (2026-10-30): tocarla abre su detalle,
 * como las tarjetas de Cuentas por Cobrar. `apagado`: se ve, pero no suma a
 * esta quincena (la comisión en la 1.ª).
 */
export default function TarjetaIngreso({ icono: Icono, titulo, valor, pie, onClick, apagado = false, className = '' }) {
  return (
    <button type="button" onClick={onClick}
      className={`card flex min-h-28 w-full flex-col justify-between gap-2 p-4 text-left transition-colors hover:border-primario-300 hover:bg-primario-50/40 ${className}`}>
      <span className="flex w-full items-center justify-between gap-2 text-sm font-semibold text-neutro-600">
        <span className="flex min-w-0 items-center gap-1.5"><Icono size={16} className="shrink-0 text-primario-500" /><span className="break-words">{titulo}</span></span>
        <ChevronRight size={16} className="shrink-0 text-neutro-400" />
      </span>
      <span className={`text-2xl font-bold ${apagado ? 'text-neutro-500' : 'text-neutro-900'}`}>{valor}</span>
      {pie && <span className="text-xs text-neutro-500">{pie}</span>}
    </button>
  )
}
