/**
 * El encabezado de una pantalla: título, una línea de contexto y sus
 * acciones.
 *
 * POR QUÉ EXISTE
 * Cada módulo lo escribía a mano y cada uno terminó distinto: unos con
 * `text-3xl`, otros con `text-4xl`, unos con `flex items-start
 * justify-between` que en el teléfono empuja el botón contra el título hasta
 * partirlo. Es el primer elemento de toda pantalla y era el menos parejo.
 *
 * Las acciones bajan solas debajo del título cuando no hay ancho, en vez de
 * pelear con él.
 */
export default function EncabezadoPagina({ titulo, descripcion, icono: Icono, acciones, className = '' }) {
  return (
    <header className={`mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between md:mb-6 ${className}`}>
      <div className="flex min-w-0 items-start gap-3">
        {Icono && (
          <span className="mt-0.5 hidden shrink-0 text-primario-600 sm:block">
            <Icono size={28} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight text-neutro-900 md:text-3xl">{titulo}</h1>
          {descripcion && <p className="mt-1 text-sm text-neutro-500 md:text-base">{descripcion}</p>}
        </div>
      </div>

      {acciones && <div className="flex shrink-0 flex-wrap gap-2">{acciones}</div>}
    </header>
  )
}
