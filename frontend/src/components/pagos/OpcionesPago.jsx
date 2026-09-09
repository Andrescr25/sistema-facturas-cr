import { CheckCircle2, Wallet, CircleDollarSign } from 'lucide-react'
import { formatCurrency } from '../../utils/pagos'

/**
 * Las dos formas de saldar una factura: todo, o una parte.
 *
 * Son dos tarjetas grandes y no un par de pestañas chiquitas porque esta es
 * la decisión del modal: todo lo demás —fecha, método, nota— es relleno de
 * lo que ya se eligió. Estaba solo en Cuentas por Cobrar y es la parte que
 * se quiso llevar también a Pagos a Proveedores.
 *
 * El pie de cada tarjeta lo pone quien la usa: en cobrar dice en cuánto
 * queda la factura, en pagar dice otra cosa.
 */
export default function OpcionesPago({
  saldo, seleccion, onSeleccionar,
  etiquetaTotal = 'Pagar todo el saldo',
  etiquetaParcial = 'Abonar otro monto',
  pieParcial = 'Pagar una parte del saldo',
  deshabilitado = false
}) {
  const opciones = [
    {
      clave: 'total',
      icono: Wallet,
      titulo: etiquetaTotal,
      pie: `${formatCurrency(saldo)} — queda en ₡0`,
      activo: 'border-exito-500 bg-exito-50 ring-2 ring-exito-200',
      inactivo: 'border-neutro-200 bg-white hover:border-exito-300 hover:bg-exito-50/50',
      circuloActivo: 'bg-exito-500 text-white',
      circuloInactivo: 'bg-exito-100 text-exito-600',
      textoActivo: 'text-exito-800',
      pieActivo: 'text-exito-600'
    },
    {
      clave: 'parcial',
      icono: CircleDollarSign,
      titulo: etiquetaParcial,
      pie: pieParcial,
      activo: 'border-primario-500 bg-primario-50 ring-2 ring-primario-200',
      inactivo: 'border-neutro-200 bg-white hover:border-primario-300 hover:bg-primario-50/50',
      circuloActivo: 'bg-primario-500 text-white',
      circuloInactivo: 'bg-primario-100 text-primario-600',
      textoActivo: 'text-primario-800',
      pieActivo: 'text-primario-600'
    }
  ]

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-neutro-700">¿Cómo se va a saldar?</p>

      {opciones.map((o) => {
        const Icono = o.icono
        const elegida = seleccion === o.clave
        return (
          <button
            key={o.clave}
            type="button"
            onClick={() => onSeleccionar(o.clave)}
            disabled={deshabilitado}
            className={`w-full rounded-2xl border-2 p-4 text-left transition-all disabled:opacity-50 ${elegida ? o.activo : o.inactivo}`}
          >
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${elegida ? o.circuloActivo : o.circuloInactivo}`}>
                <Icono size={20} />
              </span>
              <div className="min-w-0">
                <p className={`text-base font-bold ${elegida ? o.textoActivo : 'text-neutro-800'}`}>{o.titulo}</p>
                <p className={`text-sm ${elegida ? o.pieActivo : 'text-neutro-500'}`}>{o.pie}</p>
              </div>
              {elegida && <CheckCircle2 size={22} className={`ml-auto shrink-0 ${o.pieActivo}`} />}
            </div>
          </button>
        )
      })}
    </div>
  )
}
