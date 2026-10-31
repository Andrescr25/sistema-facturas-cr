import { colones } from '../../utils/colones'
import { duracion } from '../../utils/ingresosTexto'

function Fila({ nombre, detalle, monto }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="font-semibold text-neutro-800">{nombre}</span>
        <span className="block text-xs text-neutro-500">{detalle}</span>
      </span>
      <span className="shrink-0 text-base font-bold text-neutro-900">{colones(monto)}</span>
    </li>
  )
}

/**
 * Lo ganado en la quincena, en grande, y de qué sale (2026-10-30). El usuario
 * quiere que el agente lo vea «como para motivarlo»: el número arriba y cada
 * parte con su cuenta (horas × tarifa, clientes × incentivo, días × gasolina,
 * y la comisión del mes en la 2.ª quincena), y cuánto ya se le pagó.
 */
export default function ResumenQuincena({ quincena: q, titulo, nota, accion }) {
  // Las de su pago si ya se pagó; si no, las de hoy (las elige el servidor).
  const tarifas = q.tarifas
  const dias = q.gasolina.dias.length
  return (
    <section aria-label="Lo ganado en la quincena" className="card overflow-hidden">
      <div className="bg-exito-50 p-5">
        <p className="text-sm font-semibold text-exito-800">{titulo}</p>
        <p className="mt-1 text-4xl font-bold tracking-tight text-exito-900">{colones(q.total)}</p>
        {q.periodo.enCurso && <p className="mt-1 text-xs text-exito-800">Va sumando hasta el {Number(q.periodo.hasta.slice(8))}.{nota ? ` ${nota}` : ''}</p>}
      </div>
      <ul className="divide-y divide-neutro-100 px-5 py-2">
        <Fila nombre="Horas trabajadas" detalle={`${duracion(q.minutos)} × ${colones(tarifas.pagoHora)} la hora`} monto={q.porHoras} />
        <Fila nombre="Clientes nuevos" detalle={`${q.clientesNuevos.cuentan.length} × ${colones(tarifas.incentivoClienteNuevo)}`} monto={q.clientesNuevos.monto} />
        <Fila nombre="Gasolina" detalle={`${dias} ${dias === 1 ? 'día' : 'días'} × ${colones(q.gasolina.porDia)}`} monto={q.gasolina.monto} />
        {q.comision.enEstaQuincena && (
          <Fila nombre={`Comisión de ${q.comision.nombre}`} detalle={`${q.comision.porcentaje} % de ${colones(Math.max(0, q.comision.netas))} en ventas netas`} monto={q.comision.monto} />
        )}
      </ul>
      {(q.pagos.pagado > 0 || accion) && (
        <div className="space-y-2 border-t border-neutro-100 bg-neutro-50 px-5 py-3 text-sm">
          <div className="flex justify-between gap-3"><span className="text-neutro-600">Ya pagado</span><span className="font-bold text-neutro-900">{colones(q.pagos.pagado)}</span></div>
          <div className="flex justify-between gap-3">
            <span className="text-neutro-600">{q.pagos.porPagar < 0 ? 'Pagado de más' : 'Por pagar'}</span>
            <span className={`font-bold ${q.pagos.porPagar > 0 ? 'text-alerta-800' : 'text-exito-700'}`}>{colones(Math.abs(q.pagos.porPagar))}</span>
          </div>
          {accion}
        </div>
      )}
    </section>
  )
}
