import { Check, AlertCircle } from 'lucide-react'

/**
 * En qué etapa va un pedido, como línea de tiempo.
 *
 * Las etapas las decide el servidor (portal-clientes/seguimiento.js), que
 * devuelve claves; los textos viven acá, que es donde vive el resto del texto
 * de cara al cliente. Este componente es el ÚNICO lugar donde se nombran las
 * etapas: lo usan la confirmación al enviar y "Mis pedidos", así que el
 * cliente nunca ve dos nombres distintos para lo mismo.
 *
 * Va en USTED, como el resto del portal: el lector es el dueño de otro
 * negocio, no alguien de la casa.
 */

export const ETIQUETA = {
  en_revision: 'En revisión',
  en_preparacion: 'En preparación',
  listo_para_envio: 'Listo para envío',
  no_procesado: 'No procesado'
}

/** Colores del chip de estado, para las listas donde no cabe la línea entera. */
export const CLASE_CHIP = {
  en_revision: 'bg-amber-100 text-amber-700',
  en_preparacion: 'bg-sky-100 text-sky-700',
  listo_para_envio: 'bg-emerald-100 text-emerald-700',
  no_procesado: 'bg-red-100 text-red-700'
}

/** "21 ago, 3:14 p. m." — sin año: son pedidos recientes. */
function fechaCorta(valor) {
  if (!valor) return null
  return new Date(valor).toLocaleString('es-CR', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'
  })
}

export default function SeguimientoPedido({ etapa, seguimiento, motivoRechazo }) {
  // Rechazado o anulado: el servidor no manda línea de tiempo a propósito.
  // Dibujar pasos que nunca van a completarse al lado de un "No procesado"
  // solo confunde; lo que el cliente necesita es el motivo.
  if (etapa === 'no_procesado') {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-red-150 bg-red-50 px-3 py-2.5">
        <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-600" />
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-red-700">{ETIQUETA.no_procesado}</p>
          {motivoRechazo && <p className="text-[11px] text-red-600">{motivoRechazo}</p>}
        </div>
      </div>
    )
  }

  if (!seguimiento?.length) return null

  return (
    <ol className="space-y-0">
      {seguimiento.map((paso, i) => {
        const ultimo = i === seguimiento.length - 1
        const fecha = fechaCorta(paso.fecha)
        return (
          <li
            key={paso.clave}
            className="fade-in flex gap-2.5"
            // Escalonado: los pasos entran uno tras otro en vez de aparecer
            // todos de golpe. Se anula con prefers-reduced-motion (index.css).
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <div className="flex flex-col items-center">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  paso.alcanzada ? 'bg-emerald-600 text-white' : 'border-2 border-slate-200 bg-white'
                }`}
              >
                {paso.alcanzada && <Check size={12} strokeWidth={3} />}
              </span>
              {/* La línea que une los pasos; el último no la lleva. */}
              {!ultimo && (
                <span className={`w-0.5 flex-1 ${paso.alcanzada ? 'bg-emerald-600/30' : 'bg-slate-150'}`} />
              )}
            </div>

            <div className={`min-w-0 flex-1 ${ultimo ? 'pb-0' : 'pb-3'}`}>
              <p className={`text-[12px] font-bold leading-tight ${paso.alcanzada ? 'text-slate-900' : 'text-slate-400'}`}>
                {ETIQUETA[paso.clave]}
              </p>
              {/* Una etapa alcanzada puede no tener fecha: las facturas
                  anteriores a la columna bodega_procesado_en. Se deja en
                  blanco en vez de inventar una. */}
              {fecha && <p className="text-[11px] leading-tight text-slate-400">{fecha}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
