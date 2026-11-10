import { colones } from '../../utils/colones'
import { duracion } from '../../utils/ingresosTexto'

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

/**
 * La cuenta de las horas de una quincena, en una línea (2026-11-09). Bodega:
 * horas normales y horas extra a tiempo y medio. Agente: horas y gasolina.
 * La ven el empleado («Mis ingresos») y el administrador («Empleados»).
 */
export default function ResumenHoras({ quincena: q }) {
  if (q.tipo === 'bodega') {
    return (
      <p className="text-sm text-neutro-600">
        {duracion(q.minutos - q.extra.minutos)} × {colones(q.tarifas.pagoHora)} = <b>{colones(q.porHoras)}</b>
        {' · '}Extra {duracion(q.extra.minutos)} × {colones(q.tarifas.pagoHora * q.extra.recargo)} = <b>{colones(q.extra.monto)}</b>
        <span className="block text-xs text-neutro-500">Es extra lo que pase de {q.extra.horasJornada} h en un día, a tiempo y medio.</span>
      </p>
    )
  }
  return (
    <p className="text-sm text-neutro-600">
      {duracion(q.minutos)} × {colones(q.tarifas.pagoHora)} = <b>{colones(q.porHoras)}</b> · Gasolina {plural(q.gasolina.dias.length, 'día', 'días')} = <b>{colones(q.gasolina.monto)}</b>
    </p>
  )
}
