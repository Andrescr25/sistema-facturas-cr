/**
 * Qué se está haciendo en este paso y para qué.
 *
 * Eran tres bloques escritos a mano, casi calcados, de diez líneas cada uno
 * —mismo `rounded-2xl p-6`, mismo `text-2xl`, solo cambiaba el color y el
 * texto—. Ahora es una tabla de datos: agregar un paso es una fila, no otro
 * bloque de JSX que hay que recordar mantener igual a los otros dos.
 *
 * También bajó de tamaño. Ocupaba 110px fijos arriba de la lista repitiendo
 * lo que la pestaña ya seleccionada dice; sirve como recordatorio, no como
 * portada.
 */
const PASOS = {
  PENDIENTE_RELACIONAR: {
    numero: 1,
    titulo: 'Relacionar productos',
    detalle: 'Asociá cada producto de la factura con tu catálogo para poder revisar sus costos.',
    tono: 'border-alerta-200 bg-alerta-50 text-alerta-900',
    circulo: 'bg-alerta-500'
  },
  LISTAS_REVISION: {
    numero: 2,
    titulo: 'Revisar precios de venta',
    detalle: 'Mirá el costo nuevo de cada producto y ajustá el precio antes de registrar la compra.',
    tono: 'border-primario-200 bg-primario-50 text-primario-900',
    circulo: 'bg-primario-600'
  },
  ENVIADAS: {
    numero: 3,
    titulo: 'Compras registradas',
    detalle: 'Ya procesadas. Se pueden consultar, pero no volver a registrar: ya existe una compra propia.',
    tono: 'border-exito-200 bg-exito-50 text-exito-900',
    circulo: 'bg-exito-600'
  }
}

export default function PasoActual({ paso }) {
  const info = PASOS[paso]
  if (!info) return null

  return (
    <div className={`mb-4 flex items-start gap-3 rounded-xl border p-3 md:p-4 ${info.tono}`}>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${info.circulo}`}>
        {info.numero}
      </span>
      <div className="min-w-0">
        <p className="font-bold leading-tight">{info.titulo}</p>
        <p className="mt-0.5 text-sm opacity-90">{info.detalle}</p>
      </div>
    </div>
  )
}
