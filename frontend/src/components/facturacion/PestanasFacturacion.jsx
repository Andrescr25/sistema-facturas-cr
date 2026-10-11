import { FilePlus2, PencilLine, Receipt } from 'lucide-react'

/**
 * Nueva factura / Editar facturas.
 *
 * Antes eran dos pestañas subrayadas que en el teléfono quedaban apretadas
 * contra el borde. Ahora es el mismo control segmentado que ya usa Cuentas
 * por Cobrar, para que las dos pantallas se cambien de pestaña igual.
 */
export default function PestanasFacturacion({
  tabActiva, onCambiarTab, modoEdicion, edicionesPendientesCount
}) {
  const pestanas = [
    { clave: 'nueva', etiqueta: modoEdicion ? 'Editando' : 'Nueva factura', icono: FilePlus2 },
    // Solo en el teléfono: es la edición rápida desde el mostrador. En
    // escritorio se corrige entrando a la factura, dentro de Facturas, en vez
    // de tener dos caminos que hacen lo mismo.
    { clave: 'editar', etiqueta: 'Editar facturas', icono: PencilLine, insignia: edicionesPendientesCount, soloMovil: true },
    // Las ya emitidas: hasta ahora se facturaba y el documento desaparecía de
    // la vista, sin dónde reimprimirlo ni ver quién queda debiendo.
    { clave: 'facturas', etiqueta: 'Facturas', icono: Receipt }
  ]

  // Envuelven en pantalla angosta: con dos pestañas cabían en una línea, con
  // tres se apretaban hasta chocar ("Nueva factura⁄Editar facturas") en un
  // teléfono de 400 px.
  return (
    <div className="mb-4 flex max-w-2xl flex-wrap gap-1 rounded-2xl bg-neutro-100 p-1.5 md:mb-6 md:flex-nowrap">
      {pestanas.map((p) => {
        const Icono = p.icono
        const activa = tabActiva === p.clave
        return (
          <button
            key={p.clave}
            onClick={() => onCambiarTab(p.clave)}
            className={`${p.soloMovil ? 'md:hidden ' : ''}flex min-w-[7.5rem] flex-1 items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-sm font-semibold transition-all ${
              activa
                ? 'bg-white text-primario-600 shadow-md ring-1 ring-black/5'
                : 'text-neutro-600 hover:text-neutro-900'
            }`}
          >
            <Icono size={16} className="shrink-0" />
            <span className="truncate">{p.etiqueta}</span>
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
