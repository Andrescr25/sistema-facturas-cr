/**
 * Las categorías, para saltar sin scrollear.
 *
 * POR QUÉ EXISTE
 * El catálogo entero medía trece mil píxeles de alto y la única forma de
 * llegar a "Limpieza" era pasar por "Ferretería", "Aceites" y todo lo demás.
 * Un agente de pie frente a un cliente no scrollea trece mil píxeles: busca
 * por texto o se rinde.
 *
 * Se queda fija bajo el buscador porque el problema aparece justamente
 * cuando uno ya bajó y quiere cambiar de rubro.
 */
export default function BarraCategorias({ categorias, activa, onElegir }) {
  if (!categorias || categorias.length === 0) return null

  return (
    <nav aria-label="Categorías"
      className="sticky top-[57px] z-20 border-b border-neutro-200 bg-white/95 backdrop-blur">
      {/* scrollbar-none: en la tablet la barra de scroll horizontal tapaba la
          fila de chips y no aporta nada — se arrastra con el dedo. */}
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-3 py-2">
        {categorias.map((c) => {
          const esActiva = activa === c.clave
          return (
            <button
              key={c.clave}
              type="button"
              onClick={() => onElegir(c.clave)}
              aria-pressed={esActiva}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                esActiva
                  ? 'bg-primario-800 text-white'
                  : 'bg-neutro-100 text-neutro-600 hover:bg-neutro-200'
              }`}
            >
              {c.icono && <c.icono size={13} />}
              {c.texto}
              {c.contador > 0 && (
                <span className={`rounded px-1 text-[10px] font-extrabold ${
                  esActiva ? 'bg-white/20 text-white' : 'bg-white text-neutro-500'
                }`}>
                  {c.contador}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
