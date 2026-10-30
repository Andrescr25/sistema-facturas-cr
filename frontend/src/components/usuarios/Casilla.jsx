import { Check } from 'lucide-react'

/**
 * Una casilla de la ficha del usuario: un módulo, o con `sangria` un permiso de
 * acción, o una ruta que atiende. Una sola copia para el tablero y las rutas.
 */
export default function Casilla({ marcado, nombre, onClick, deshabilitado, sangria = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className={`flex w-full items-center gap-2.5 py-2 pr-3 text-left hover:bg-neutro-50 disabled:cursor-not-allowed disabled:hover:bg-transparent ${sangria ? 'pl-9' : 'pl-3'}`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
          marcado ? 'border-exito-600 bg-exito-600 text-white' : 'border-neutro-300 bg-white'
        }`}
      >
        {marcado && <Check size={11} strokeWidth={3} />}
      </span>
      <span className={`${sangria ? 'text-[12px]' : 'text-[13px]'} ${marcado ? 'font-semibold text-neutro-900' : 'text-neutro-500'}`}>
        {nombre}
      </span>
    </button>
  )
}
