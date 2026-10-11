/** Tarjeta de sección con el encabezado neutro que comparten los módulos. */
export default function PanelSeccion({ titulo, children, acciones, className = '', cuerpoClassName = 'p-5', ...resto }) {
  return <section className={`min-w-0 overflow-hidden rounded-2xl border border-neutro-200 bg-white ${className}`} {...resto}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutro-100 bg-neutro-50 px-5 py-4">
      <h3 className="break-words text-base font-bold text-neutro-800">{titulo}</h3>{acciones}
    </header><div className={cuerpoClassName}>{children}</div>
  </section>
}
