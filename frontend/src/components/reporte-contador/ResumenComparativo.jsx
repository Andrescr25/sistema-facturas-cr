import { Wallet, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import { formatCurrency } from '../../utils/reporteContadorUtils'

/**
 * El panorama completo del mes: ventas vs. compras, cada una con su cifra
 * original (tal como la exportó Alegra) y la ajustada (después de excluir
 * lo que se haya marcado). El IVA a pagar se calcula con ambas para que se
 * vea de un vistazo cuánto cambia por lo que se excluyó.
 *
 * Las devoluciones (notas de crédito) NO se restan de la base gravable —
 * igual que en el reporte de Alegra van aparte — pero sí bajan el débito
 * fiscal, así que entran en el cálculo del IVA a pagar.
 */
export default function ResumenComparativo({ ventas, compras, resumenVentas, resumenCompras }) {
  const baseVentasOriginal = ventas?.baseGravableOriginal ?? null
  const impVentasOriginal = ventas?.impuestoOriginal ?? null
  const baseVentasAjustada = resumenVentas?.baseGravableAjustada ?? baseVentasOriginal
  const impVentasAjustado = resumenVentas?.impuestoAjustado ?? impVentasOriginal

  const baseDevoluciones = resumenVentas?.baseDevoluciones ?? ventas?.baseDevolucionesOriginal ?? 0
  const impDevoluciones = resumenVentas?.impuestoDevoluciones ?? ventas?.impuestoDevolucionesOriginal ?? 0

  // Ajustadas, no originales: es lo que va en el Excel exportado y en el
  // correo al contador. Mostrar la original acá hacía que la pantalla y el
  // archivo dijeran cosas distintas.
  const baseCompras = resumenCompras?.baseGravableAjustada ?? compras?.baseGravableOriginal ?? null
  const impCompras = resumenCompras?.impuestoAjustado ?? compras?.impuestoOriginal ?? null
  const comprasAjustadas = compras && resumenCompras && Math.abs(compras.baseGravableOriginal - resumenCompras.baseGravableAjustada) >= 1

  const debitoOriginal = impVentasOriginal !== null ? impVentasOriginal - impDevoluciones : null
  const debitoAjustado = impVentasAjustado !== null ? impVentasAjustado - impDevoluciones : null

  const ivaOriginal = debitoOriginal !== null && impCompras !== null ? debitoOriginal - impCompras : null
  const ivaAjustado = debitoAjustado !== null && impCompras !== null ? debitoAjustado - impCompras : null

  const huboAjuste = impVentasOriginal !== null && impVentasAjustado !== null && Math.abs(impVentasOriginal - impVentasAjustado) >= 1

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="card">
        <p className="text-sm text-gray-500 flex items-center gap-1.5"><TrendingUp size={14} className="text-emerald-500" /> Ventas</p>
        {baseVentasOriginal === null ? (
          <p className="text-sm text-gray-400 mt-2">Sin cargar</p>
        ) : (
          <>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{formatCurrency(baseVentasAjustada)}</p>
            {huboAjuste && (
              <p className="text-xs text-gray-400 line-through">{formatCurrency(baseVentasOriginal)}</p>
            )}
            <span className="text-xs text-gray-500">IVA débito {formatCurrency(debitoAjustado)}</span>
            {baseDevoluciones > 0 && (
              <p className="text-xs text-purple-600 mt-0.5">
                − {formatCurrency(baseDevoluciones)} en devoluciones (IVA {formatCurrency(impDevoluciones)})
              </p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <p className="text-sm text-gray-500 flex items-center gap-1.5"><TrendingDown size={14} className="text-orange-500" /> Compras</p>
        {baseCompras === null ? (
          <p className="text-sm text-gray-400 mt-2">Sin cargar</p>
        ) : (
          <>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{formatCurrency(baseCompras)}</p>
            {comprasAjustadas && (
              <p className="text-xs text-gray-400 line-through">{formatCurrency(compras.baseGravableOriginal)}</p>
            )}
            <span className="text-xs text-gray-500">IVA crédito {formatCurrency(impCompras)}</span>
          </>
        )}
      </div>

      <div className="card">
        <p className="text-sm text-gray-500 flex items-center gap-1.5"><Wallet size={14} className="text-blue-500" /> IVA a pagar</p>
        {ivaAjustado === null ? (
          <p className="text-sm text-gray-400 mt-2">Cargá ambos reportes</p>
        ) : (
          <>
            <p className={`text-2xl font-semibold mt-1 ${ivaAjustado < 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
              {formatCurrency(ivaAjustado)}
            </p>
            {huboAjuste && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                {formatCurrency(ivaOriginal)} <ArrowRight size={11} /> {formatCurrency(ivaAjustado)}
              </p>
            )}
            <span className="text-xs text-gray-500">débito ventas − crédito compras</span>
          </>
        )}
      </div>
    </div>
  )
}
