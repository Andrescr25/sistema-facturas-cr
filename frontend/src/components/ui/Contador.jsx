import { Minus, Plus } from 'lucide-react'

/**
 * El contador del sistema: «− cantidad +».
 *
 * POR QUÉ EXISTE (2026-10-20). Estaba escrito dos veces —la línea de la
 * factura en curso y el modal de cantidad— y la nota de crédito iba a ser la
 * tercera copia. El usuario pidió «recuerda reciclar codigo»: ahora es uno.
 *
 * Los botones miden 44 px (`md`) o 56 px (`lg`): lo que un dedo acierta sin
 * mirar. El campo se puede escribir; `onCambiar` recibe el número de los
 * botones o el texto tal cual se escribió, y quien lo usa decide cómo lo
 * valida (al salir del campo, o acotándolo en el momento).
 */

const TAMANOS = {
  md: { boton: 'h-11 w-11', campo: 'h-11 w-14 text-lg', icono: 18 },
  lg: { boton: 'h-14 w-14', campo: 'h-14 w-20 text-2xl', icono: 24 },
}

export default function Contador({
  valor, onCambiar, min = 0, max = Infinity, etiqueta, tamano = 'md', inputRef, onBlur, onEnter, className = ''
}) {
  const n = parseInt(valor) || 0
  const t = TAMANOS[tamano] || TAMANOS.md
  return (
    <div className={`inline-flex shrink-0 items-center overflow-hidden rounded-xl border border-neutro-300 bg-white focus-within:border-primario-500 ${className}`}>
      <button
        type="button"
        aria-label="Quitar uno"
        onClick={() => onCambiar(n - 1)}
        disabled={n <= min}
        className={`flex ${t.boton} items-center justify-center text-neutro-700 transition-colors hover:bg-neutro-100 active:bg-neutro-200 disabled:opacity-40`}
      >
        <Minus size={t.icono} strokeWidth={3} />
      </button>
      <input
        ref={inputRef}
        type="number"
        min={min}
        max={Number.isFinite(max) ? max : undefined}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        onBlur={onBlur}
        onFocus={(e) => e.target.select()}
        onKeyDown={onEnter && ((e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } })}
        aria-label={etiqueta}
        inputMode="numeric"
        className={`${t.campo} border-0 bg-transparent text-center font-extrabold text-neutro-900 [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
      />
      <button
        type="button"
        aria-label="Agregar uno"
        onClick={() => onCambiar(n + 1)}
        disabled={n >= max}
        className={`flex ${t.boton} items-center justify-center bg-primario-600 text-white transition-colors hover:bg-primario-700 active:bg-primario-800 disabled:bg-neutro-100 disabled:text-neutro-300`}
      >
        <Plus size={t.icono} strokeWidth={3} />
      </button>
    </div>
  )
}
