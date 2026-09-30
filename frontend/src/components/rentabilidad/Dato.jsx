/**
 * Una tarjeta con un número: el título, la cifra grande y una línea abajo.
 * Si recibe `onClick` sirve de filtro (se marca cuando está `activo`).
 *
 * La cifra va con los números proporcionales de la fuente, no tabulares: en
 * tamaño grande, "121" con dígitos del ancho de un 0 se ve suelto.
 */
export default function Dato({ titulo, valor, pie, icono: Icono, tono = 'neutro', onClick, activo = false }) {
  const colorValor = {
    neutro: 'text-neutro-900',
    peligro: 'text-peligro-700',
    alerta: 'text-alerta-700',
    exito: 'text-exito-700'
  }[tono] || 'text-neutro-900'

  const contenido = (
    <>
      <p className="flex items-center gap-1.5 text-sm font-medium text-neutro-500">
        {Icono && <Icono size={15} className="shrink-0 text-neutro-400" />}
        {titulo}
      </p>
      <p className={`mt-1 text-2xl font-bold ${colorValor}`}>{valor}</p>
      {pie && <p className="mt-0.5 text-xs text-neutro-500">{pie}</p>}
    </>
  )

  if (!onClick) return <div className="card p-5">{contenido}</div>
  return (
    <button type="button" onClick={onClick} aria-pressed={activo}
      className={`card p-5 text-left transition hover:border-primario-200 hover:shadow-md ${activo ? 'ring-2 ring-primario-400' : ''}`}>
      {contenido}
    </button>
  )
}
