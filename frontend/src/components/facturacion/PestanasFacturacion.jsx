import { FilePlus2, PencilLine, Receipt } from 'lucide-react'

/**
 * Nueva factura / Editar facturas.
 *
 * Antes eran dos pestañas subrayadas que en el teléfono quedaban apretadas
 * contra el borde. Ahora es el mismo control segmentado que ya usa Cuentas
 * por Cobrar, para que las dos pantallas se cambien de pestaña igual.
 */
export default function PestanasFacturacion({
  tabActiva, onCambiarTab, modoEdicion, edicionesPendientesCount, facturasPendientesCount = 0
}) {
  // Lo que espera subir: ventas hechas sin señal y ediciones sin mandar.
  const porSubir = (Number(edicionesPendientesCount) || 0) + (Number(facturasPendientesCount) || 0)
  const pestanas = [
    { clave: 'nueva', etiqueta: modoEdicion ? 'Editando' : 'Nueva factura', icono: FilePlus2 },
    // Solo en el teléfono: es la edición rápida desde el mostrador. En
    // escritorio se corrige entrando a la factura, dentro de Facturas, en vez
    // de tener dos caminos que hacen lo mismo.
    //
    // SALVO CUANDO HAY ALGO POR SUBIR. La cola de ventas sin enviar —con su
    // motivo si el servidor rechazó una, y los botones de reintentar y
    // descartar— vive solo en este panel. Una tablet (768 px o más) no lo
    // veía nunca: la cabecera marcaba "1" y no había dónde tocar. Con algo
    // pendiente, la pestaña sale en cualquier ancho.
    { clave: 'editar', etiqueta: porSubir > 0 ? 'Por subir' : 'Editar facturas', icono: PencilLine, insignia: porSubir, soloMovil: porSubir === 0, etiquetaMovil: 'Editar facturas' },
    // Las ya emitidas: hasta ahora se facturaba y el documento desaparecía de
    // la vista, sin dónde reimprimirlo ni ver quién queda debiendo.
    { clave: 'facturas', etiqueta: 'Facturas', icono: Receipt }
  ]

  // Envuelven en pantalla angosta: con dos pestañas cabían en una línea, con
  // tres se apretaban hasta chocar ("Nueva factura⁄Editar facturas") en un
  // teléfono de 400 px.
  return (
    <div className="mb-4 grid max-w-2xl auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-neutro-100 p-1.5 md:mb-6 md:flex">
      {pestanas.map((p) => {
        const Icono = p.icono
        const activa = tabActiva === p.clave
        return (
          <button
            key={p.clave}
            onClick={() => onCambiarTab(p.clave)}
            className={`${p.soloMovil ? 'md:hidden ' : ''}flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-xs font-semibold transition-all sm:flex-row sm:gap-2 sm:px-2 sm:text-sm md:min-w-[7.5rem] md:flex-1 ${
              activa
                ? 'bg-white text-primario-600 shadow-md ring-1 ring-black/5'
                : 'text-neutro-600 hover:text-neutro-900'
            }`}
          >
            <Icono size={16} className="shrink-0" />
            {p.etiquetaMovil && p.etiquetaMovil !== p.etiqueta ? (
              <>
                <span className="truncate md:hidden">{p.etiquetaMovil}</span>
                <span className="hidden truncate md:inline">{p.etiqueta}</span>
              </>
            ) : (
              <span className="truncate">{p.etiqueta}</span>
            )}
            {p.insignia > 0 && (
              <span className="shrink-0 rounded-full bg-alerta-100 px-1.5 py-0.5 text-[11px] font-bold text-alerta-800">
                {p.insignia}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
