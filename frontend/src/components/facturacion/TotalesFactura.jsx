import { colones } from '../../utils/colones'

/**
 * Los totales del documento y, cuando ya hay cobros o notas, lo que queda.
 * El descuento se informa, no se vuelve a restar: la cuenta de arriba ya lo
 * trae (ver `totalesDe` en utils/facturaVista.js).
 */
export default function TotalesFactura({ factura: f, editando, totales }) {
  const { subtotal, descuento, porTarifa, total } = totales
  return (
    <div className="flex justify-end border-t border-neutro-100 p-5">
      <div className="w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between text-neutro-600">
          <span>Subtotal</span><span className="font-medium text-neutro-800">{colones(subtotal)}</span>
        </div>
        {descuento > 0 && (
          <p className="text-right text-xs text-alerta-600">
            Ya incluye {colones(descuento)} de descuento
          </p>
        )}
        {porTarifa.map(([tarifa, monto]) => (
          <div key={tarifa} className="flex justify-between text-neutro-600">
            <span>IVA {tarifa}%</span><span className="font-medium text-neutro-800">{colones(monto)}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between border-t-2 border-neutro-200 pt-2">
          <span className="font-bold text-neutro-900">Total</span>
          <span className="text-xl font-extrabold text-primario-600">{colones(total)}</span>
        </div>
        {!editando && (f.cobrado > 0 || f.acreditado > 0) && (
          <>
            {f.cobrado > 0 && (
              <div className="flex justify-between text-exito-700">
                <span>Pagado</span><span className="font-medium">−{colones(f.cobrado)}</span>
              </div>
            )}
            {f.acreditado > 0 && (
              <div className="flex justify-between text-nota-700">
                <span>Nota de crédito</span><span className="font-medium">−{colones(f.acreditado)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-neutro-200 pt-1.5 font-bold text-neutro-900">
              <span>Saldo</span><span>{colones(f.saldo)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
