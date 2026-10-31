import SelectorQuincena from './SelectorQuincena'
import { colones } from '../../utils/colones'

// Lo mismo dicho al empleado («Mis ingresos») o a quien le paga («Empleados»).
const TEXTOS = {
  empleado: { enCurso: 'Llevás ganado', cerrada: 'Ganaste', pagado: 'Te pagaron', porPagar: 'Por cobrar', otras: 'Además te deben' },
  administrador: { enCurso: 'Lleva ganado', cerrada: 'Ganó', pagado: 'Pagado', porPagar: 'Por pagar', otras: 'Además se le deben' }
}

/**
 * Lo primero que se ve de una quincena (2026-10-30): cuánto lleva ganado,
 * cuánto ya se pagó y cuánto falta, con la quincena para recorrer arriba. Si
 * se debe algo de otras quincenas, lo dice. `accion`: «Pagar quincena».
 */
export default function TotalQuincena({ quincena: q, deuda, onElegir, nota, accion, para = 'empleado' }) {
  const t = TEXTOS[para]
  const deEsta = deuda.quincenas.find(x => x.clave === q.periodo.clave)?.debe ?? 0
  const otras = Math.round((deuda.total - deEsta) * 100) / 100
  return (
    <section aria-label="Lo ganado en la quincena" className="card overflow-hidden">
      <div className="bg-exito-50 px-2 pb-5 pt-2 text-center">
        <SelectorQuincena periodo={q.periodo} onElegir={onElegir} sinTarjeta />
        <p className="mt-3 text-sm font-semibold text-exito-800">{q.periodo.enCurso ? t.enCurso : t.cerrada}</p>
        <p className="text-5xl font-bold tracking-tight text-exito-900">{colones(q.total)}</p>
        {q.periodo.enCurso && <p className="mt-1 px-3 text-xs text-exito-800">Va sumando hasta el {Number(q.periodo.hasta.slice(8))}.{nota ? ` ${nota}` : ''}</p>}
      </div>
      <div className="grid grid-cols-2 divide-x divide-neutro-100 py-3 text-center">
        <div>
          <p className="text-xs font-semibold text-neutro-500">{t.pagado}</p>
          <p className="text-lg font-bold text-neutro-900">{colones(q.pagos.pagado)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-neutro-500">{q.pagos.porPagar < 0 ? 'Pagado de más' : t.porPagar}</p>
          <p className={`text-lg font-bold ${q.pagos.porPagar > 0 ? 'text-alerta-800' : 'text-exito-700'}`}>{colones(Math.abs(q.pagos.porPagar))}</p>
        </div>
      </div>
      {accion && <div className="border-t border-neutro-100 px-5 py-3">{accion}</div>}
      {otras > 0 && <p className="border-t border-neutro-100 bg-alerta-50 px-5 py-2 text-center text-sm font-semibold text-alerta-800">{t.otras} {colones(otras)} de otras quincenas.</p>}
    </section>
  )
}
