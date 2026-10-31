import { useState } from 'react'
import { Fuel } from 'lucide-react'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import { colones } from '../../utils/colones'
import { fechaEnPalabras } from '../../utils/fechaCR'

const corta = (f) => fechaEnPalabras(f, { weekday: 'short', day: 'numeric', month: 'short' })

/**
 * La gasolina de la quincena, día por día (2026-10-30). El usuario: «₡5.000
 * de gasolina ya que es en moto, que ahí le salga si ya se lo pagué o no».
 * Con `onPagar`, se marcan los días pendientes y se pagan juntos.
 */
export default function GasolinaDeLaQuincena({ gasolina, onPagar }) {
  const [elegidos, setElegidos] = useState([])
  const pendientes = gasolina.dias.filter(d => !d.pagada)
  // Lo marcado que sigue pendiente: después de pagar, lo pagado sale solo.
  const marcados = pendientes.filter(d => elegidos.includes(d.fecha))
  const monto = marcados.reduce((s, d) => s + d.monto, 0)
  const alternar = (f) => setElegidos(x => (x.includes(f) ? x.filter(y => y !== f) : [...x, f]))

  return (
    <section aria-label="Gasolina" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-neutro-900"><Fuel size={18} className="text-primario-500" />Gasolina</h2>
        {onPagar && pendientes.length > 0 && (
          <Boton variante="secundario" disabled={!marcados.length} onClick={() => onPagar(marcados.map(d => d.fecha), monto)}>
            {marcados.length ? `Pagar ${marcados.length} ${marcados.length === 1 ? 'día' : 'días'} · ${colones(monto)}` : 'Marcá los días a pagar'}
          </Boton>
        )}
      </div>
      {gasolina.dias.length === 0 && <p className="card p-4 text-sm text-neutro-500">Cada día con jornada lleva {colones(gasolina.porDia)} de gasolina.</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {gasolina.dias.map(d => {
          const marcable = onPagar && !d.pagada
          const contenido = (
            <>
              <span className="min-w-0">
                <span className="block font-semibold text-neutro-800 first-letter:uppercase">{corta(d.fecha)}</span>
                <span className="text-sm text-neutro-500">{colones(d.monto)}{d.sinJornada ? ' · ya no tiene jornada' : ''}</span>
              </span>
              {d.pagada ? <Insignia tono="exito">Pagada {corta(d.pagadoEl)}</Insignia> : <Insignia tono="alerta">Pendiente</Insignia>}
            </>
          )
          return (
            <li key={d.fecha}>
              {marcable ? (
                <label className={`flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 p-3 ${elegidos.includes(d.fecha) ? 'border-primario-500 bg-primario-50' : 'border-neutro-200 bg-white'}`}>
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={elegidos.includes(d.fecha)} onChange={() => alternar(d.fecha)} aria-label={`Pagar gasolina del ${corta(d.fecha)}`} />
                  {contenido}
                </label>
              ) : <div className="card flex min-h-14 items-center justify-between gap-3 p-3">{contenido}</div>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
