import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'

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
 */
export default function AvisoFlotante({ mensaje }) {
  if (!mensaje) return null

  const tono = TONOS[mensaje.tipo] || TONOS.info
  const Icono = tono.icono

  return (
    <div
      role="status"
      /* top-32 en angosto: por debajo van dos barras pegadas —la del
         sistema (64px) y la de Facturación— y con top-20 el aviso caía
         justo encima de la segunda. En `lg` solo existe la de Facturación. */
      className={`fixed inset-x-4 top-36 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg animate-fade-in lg:inset-x-auto lg:right-6 lg:top-24 lg:max-w-sm ${tono.fondo}`}
    >
      <Icono size={20} className="shrink-0" />
      <span className="min-w-0">{mensaje.texto}</span>
    </div>
  )
}
