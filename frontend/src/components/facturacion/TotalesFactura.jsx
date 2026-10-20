import { colones } from '../../utils/colones'
import { renglonesDeTotales } from '../../utils/facturaVista'

/**
 * Los totales del documento, iguales al PDF: Subtotal (antes del descuento),
 * Descuento, un Impuesto por tarifa y el Total; y, cuando ya hay cobros o
 * notas, lo que queda. Ver `renglonesDeTotales` en utils/facturaVista.js.
 */
export default function TotalesFactura({ factura: f, editando, totales }) {
  const { total } = totales
  return (
    <div className="flex justify-end border-t border-neutro-100 p-5">
      <div className="w-full max-w-xs space-y-1.5 text-sm">
        {renglonesDeTotales(totales).map(({ etiqueta, monto }) => (
          <div key={etiqueta} className="flex justify-between text-neutro-600">
            <span>{etiqueta}</span>
            <span className={`font-medium ${monto < 0 ? 'text-alerta-700' : 'text-neutro-800'}`}>
              {monto < 0 ? `−${colones(-monto)}` : colones(monto)}
            </span>
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
