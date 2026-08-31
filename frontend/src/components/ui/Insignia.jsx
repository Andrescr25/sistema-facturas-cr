/**
 * La insignia de estado: "Pendiente", "Pagada", "Vencida", "Anulada".
 *
 * POR QUÉ EXISTE
 * El mismo estado se pintaba distinto según la pantalla, y peor: el mismo
 * color significaba cosas distintas. Con un tono por significado, quien
 * trabaja en bodega y en cuentas por cobrar el mismo día no tiene que
 * reaprender el código de colores al cambiar de pantalla.
 *
 *   neutro   sin empezar, informativo
 *   activo   en curso, en camino
 *   exito    terminado bien, pagado, entregado
 *   alerta   necesita atención pronto (vence en 7 días)
 *   peligro  vencido, rechazado, anulado
 *   nota     nota de crédito, rectificación
 */

const TONOS = {
  neutro: 'bg-neutro-100 text-neutro-600 border-neutro-200',
  activo: 'bg-primario-50 text-primario-700 border-primario-200',
  exito: 'bg-exito-50 text-exito-700 border-exito-200',
  alerta: 'bg-alerta-50 text-alerta-700 border-alerta-200',
  peligro: 'bg-peligro-50 text-peligro-700 border-peligro-200',
  nota: 'bg-nota-50 text-nota-700 border-nota-200',
}

export default function Insignia({ tono = 'neutro', icono: Icono, children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
        TONOS[tono] || TONOS.neutro
      } ${className}`}
    >
      {Icono && <Icono size={11} />}
      {children}
    </span>
  )
}
