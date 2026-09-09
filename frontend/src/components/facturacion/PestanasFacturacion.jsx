import { FilePlus2, PencilLine } from 'lucide-react'

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
    { clave: 'editar', etiqueta: 'Editar facturas', icono: PencilLine, insignia: edicionesPendientesCount }
  ]

  return (
    <div className="mb-4 flex max-w-md rounded-2xl bg-neutro-100 p-1.5 md:mb-6">
      {pestanas.map((p) => {
        const Icono = p.icono
        const activa = tabActiva === p.clave
        return (
          <button
            key={p.clave}
            onClick={() => onCambiarTab(p.clave)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all ${
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
