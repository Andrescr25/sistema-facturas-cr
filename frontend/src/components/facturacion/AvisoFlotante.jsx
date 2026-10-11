import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'

const TONOS = {
  success: { fondo: 'bg-exito-600', icono: CheckCircle2 },
  error: { fondo: 'bg-peligro-600', icono: XCircle },
  warning: { fondo: 'bg-alerta-600', icono: AlertTriangle },
  info: { fondo: 'bg-primario-600', icono: Info }
}

/**
 * El aviso de "factura creada", "sin conexión", etc.
 *
 * Antes salía fijo en `top-4 right-4`, que en el teléfono cae justo encima
 * de la cabecera pegada y tapaba el estado de conexión — el dato que uno
 * mira precisamente cuando algo salió mal. Ahora baja lo suficiente para
 * quedar debajo de la cabecera y ocupa el ancho disponible; en escritorio
 * vuelve a la esquina.
 *
 * Un aviso `fijo` no se va solo: es el que explica por qué una factura NO se
 * creó, y hay que leerlo antes de seguir. Se cierra tocándolo. Los demás se
 * van solos pero también se pueden cerrar así.
 */
export default function AvisoFlotante({ mensaje, onCerrar }) {
  if (!mensaje) return null

  const tono = TONOS[mensaje.tipo] || TONOS.info
  const Icono = tono.icono

  return (
    <button
      type="button"
      role={mensaje.fijo ? 'alert' : 'status'}
      onClick={onCerrar}
      /* top-32 en angosto: por debajo van dos barras pegadas —la del
         sistema (64px) y la de Facturación— y con top-20 el aviso caía
         justo encima de la segunda. En `lg` solo existe la de Facturación. */
      className={`fixed inset-x-4 top-36 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg animate-fade-in lg:inset-x-auto lg:right-6 lg:top-24 lg:max-w-sm ${tono.fondo} text-left`}
    >
      <Icono size={20} className="shrink-0" />
      <span className="min-w-0 flex-1">{mensaje.texto}</span>
      {mensaje.fijo && <X size={18} className="shrink-0 opacity-80" aria-label="Cerrar el aviso" />}
    </button>
  )
}
