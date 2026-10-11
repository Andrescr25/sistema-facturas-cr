/** Una misma navegación para las áreas de un módulo y las secciones de su detalle. */
export default function NavegacionSecciones({ secciones, seleccion, onCambiar, etiqueta, compacta = false, disabled = false, verticalEnMovil = false }) {
  return <nav aria-label={etiqueta} className={compacta ? 'flex flex-wrap gap-3' : 'grid grid-cols-2 gap-3 lg:grid-cols-4'}>
    {secciones.map(({ id, titulo, detalle, icono: Icono, contador, tituloContador }) => {
      const activa = seleccion === id
      return <button key={id} type="button" aria-label={titulo} aria-pressed={activa} disabled={disabled} onClick={() => onCambiar(id)}
        className={`${verticalEnMovil ? 'flex-col items-start sm:flex-row sm:items-center' : 'items-center'} ${compacta ? 'min-h-12 rounded-xl px-4 py-3 text-sm' : 'flex min-h-24 gap-3 rounded-2xl border-2 p-4 text-left'} font-semibold transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primario-500 ${activa ? compacta ? 'bg-primario-800 text-white' : 'border-primario-700 bg-primario-50' : 'border border-neutro-200 bg-white text-neutro-600 hover:border-primario-300'}`}>
        {Icono && !compacta && <span className={`shrink-0 rounded-xl p-2.5 ${activa ? 'bg-primario-800 text-white' : 'bg-neutro-100 text-neutro-500'}`}><Icono size={22} aria-hidden="true" /></span>}
        <span className="min-w-0"><span className={`flex flex-wrap items-center gap-2 font-bold ${compacta ? '' : 'text-base text-neutro-900'}`}>{titulo}
          {contador > 0 && <span title={tituloContador} className="rounded-lg bg-alerta-100 px-2 py-0.5 text-xs text-alerta-700">{contador}</span>}
        </span>{detalle && !compacta && <span className="mt-1 hidden text-sm text-neutro-500 sm:block">{detalle}</span>}</span>
      </button>
    })}
  </nav>
}
