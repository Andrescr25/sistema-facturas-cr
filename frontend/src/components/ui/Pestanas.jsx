/**
 * Selector de pestañas del sistema.
 *
 * POR QUÉ EXISTE
 * Salió de TabsImpresion.jsx, que hacía exactamente esto para el Centro de
 * Impresión. Revisión de Precios tenía los mismos tres estados —relacionar,
 * revisar precios, historial— pero SIN pestañas: la única forma de moverse
 * era un botón enterrado al final de la lista. Con cincuenta facturas en
 * pantalla había que bajar hasta el fondo para volver del historial, y no
 * había nada arriba que dijera en qué paso estaba uno.
 *
 * `numerada` pone el número del paso en vez del icono: sirve cuando las
 * pestañas son etapas de un flujo y no vistas sueltas.
 */
export default function Pestanas({ activa, onCambiar, pestanas, numerada = false, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-1.5 rounded-2xl bg-neutro-100 p-1.5 ${className}`}>
      {pestanas.map((p, i) => {
        const Icono = p.icono
        const esActual = activa === p.clave
        return (
          <button
            key={p.clave}
            type="button"
            onClick={() => onCambiar(p.clave)}
            aria-current={esActual ? 'page' : undefined}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-center text-sm font-semibold transition-all duration-200 ${
              esActual
                ? 'bg-white text-primario-700 shadow-md ring-1 ring-black/5'
                : 'text-neutro-600 hover:text-neutro-900'
            }`}
          >
            {numerada ? (
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                esActual ? 'bg-primario-700 text-white' : 'bg-neutro-300 text-neutro-700'
              }`}>
                {i + 1}
              </span>
            ) : (
              Icono && <Icono size={16} className="shrink-0" />
            )}
            <span className="truncate">{p.texto}</span>
            {p.contador > 0 && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                esActual ? 'bg-primario-100 text-primario-800' : 'bg-neutro-200 text-neutro-700'
              }`}>
                {p.contador}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
