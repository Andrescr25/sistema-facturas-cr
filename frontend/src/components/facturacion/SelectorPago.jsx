import { Banknote, Smartphone, Landmark, CreditCard, Clock, Wallet } from 'lucide-react'

/**
 * Cómo paga el cliente, en el momento de facturar.
 *
 * POR QUÉ ESTO NO ES LA CONDICIÓN DE VENTA
 * "De contado" o "a 30 días" es lo que dice el documento y sale del plazo que
 * tiene el cliente en su ficha. Que HAYA PAGADO es otra cosa: un cliente con
 * crédito puede pagar de una en efectivo, y uno de contado puede quedar
 * debiendo. Por eso se elige acá, venta por venta.
 *
 * "Queda pendiente" no es un método de pago: es no cobrar ahora. La factura
 * sale con su saldo y aparece en Cuentas por Cobrar.
 */

const ICONOS = {
  efectivo: Banknote,
  sinpe_movil: Smartphone,
  transferencia: Landmark,
  tarjeta: CreditCard,
  tarjeta_credito: CreditCard,
  tarjeta_debito: CreditCard,
  cheque: Wallet
}

export default function SelectorPago({
  metodos = [], metodoId, onElegirMetodo, referencia, onCambiarReferencia, compacto = false
}) {
  const elegido = metodos.find(m => m.id === metodoId) || null
  const pideReferencia = Boolean(elegido?.pideReferencia)

  const opciones = [
    ...metodos.map(m => ({
      clave: m.id,
      etiqueta: m.name,
      Icono: ICONOS[m.type] || Wallet
    })),
    // Va de último y separado: es la única opción que NO cobra.
    { clave: null, etiqueta: 'Queda pendiente', Icono: Clock, pendiente: true }
  ]

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutro-500">
        ¿Cómo paga?
      </span>

      <div className={`grid gap-1.5 ${compacto ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {opciones.map(({ clave, etiqueta, Icono, pendiente }) => {
          const activa = metodoId === clave
          return (
            <button
              key={clave ?? 'pendiente'}
              type="button"
              onClick={() => onElegirMetodo(clave)}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition-all ${
                activa
                  ? pendiente
                    ? 'border-alerta-300 bg-alerta-50 text-alerta-800'
                    : 'border-exito-300 bg-exito-50 text-exito-800'
                  : 'border-neutro-200 bg-white text-neutro-600 hover:border-neutro-300'
              }`}
            >
              <Icono size={15} className="shrink-0" />
              <span className="truncate">{etiqueta}</span>
            </button>
          )
        })}
      </div>

      {/* SINPE y transferencia sin número son imposibles de cuadrar después
          contra el banco. El catálogo dice cuáles lo piden. */}
      {pideReferencia && (
        <input
          type="text"
          value={referencia}
          onChange={(e) => onCambiarReferencia(e.target.value)}
          placeholder={`Referencia del ${elegido.name.toLowerCase()}…`}
          className="input w-full text-sm"
          maxLength={60}
        />
      )}
    </div>
  )
}
