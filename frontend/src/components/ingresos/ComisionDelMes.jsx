import { TrendingUp } from 'lucide-react'
import { colones } from '../../utils/colones'

/**
 * La comisión del mes (2026-10-30): el usuario la fijó en «2 % de ventas
 * netas», «sin IVA, menos devoluciones». Se calcula por mes y entra entera en
 * la 2.ª quincena; en la 1.ª se ve cómo va.
 */
export default function ComisionDelMes({ comision }) {
  const pie = comision.enEstaQuincena
    ? (comision.enCurso ? 'Sube con cada venta hasta fin de mes y entra en esta quincena.' : 'Entra en esta quincena.')
    : `Se paga con la 2.ª quincena de ${comision.nombre}.`
  return (
    <section aria-label="Comisión del mes" className="card space-y-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-neutro-900"><TrendingUp size={18} className="text-primario-500" />Comisión de {comision.nombre}</h2>
        <span className="text-2xl font-bold text-exito-700">{colones(comision.monto)}</span>
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-neutro-600">Ventas sin IVA · {comision.facturas} {comision.facturas === 1 ? 'factura' : 'facturas'}</dt><dd className="font-semibold">{colones(comision.ventas)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-neutro-600">Devoluciones · {comision.notas} {comision.notas === 1 ? 'nota' : 'notas'}</dt><dd className={`font-semibold ${comision.devoluciones > 0 ? 'text-peligro-700' : 'text-neutro-500'}`}>{comision.devoluciones > 0 ? '−' : ''}{colones(comision.devoluciones)}</dd></div>
        <div className="flex justify-between gap-3 border-t border-neutro-100 pt-1"><dt className="font-semibold text-neutro-800">Ventas netas × {comision.porcentaje} %</dt><dd className="font-bold">{colones(comision.netas)}</dd></div>
      </dl>
      {comision.netas < 0 && <p className="rounded-xl bg-alerta-50 px-3 py-2 text-sm text-alerta-800">Este mes las devoluciones pasan las ventas: la comisión queda en ₡0 y no descuenta de otro mes.</p>}
      <p className="text-xs text-neutro-500">{pie}</p>
    </section>
  )
}
