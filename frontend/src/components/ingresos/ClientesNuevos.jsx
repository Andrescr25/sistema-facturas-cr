import { UserPlus, Hourglass, CheckCircle2 } from 'lucide-react'
import { colones } from '../../utils/colones'
import { fechaEnPalabras } from '../../utils/fechaCR'

const corta = (f) => fechaEnPalabras(f, { day: 'numeric', month: 'short' })

/**
 * Los clientes que consiguió (2026-10-30): los que ya hicieron su primera
 * compra en esta quincena, cada uno con su incentivo, y los que todavía no
 * compran («cuenta cuando compre», para que sepa a quién volver a visitar).
 */
export default function ClientesNuevos({ clientes, incentivo }) {
  const { cuentan, esperando } = clientes
  return (
    <section aria-label="Clientes nuevos" className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold text-neutro-900"><UserPlus size={18} className="text-primario-500" />Clientes nuevos</h2>
      {cuentan.length === 0 && esperando.length === 0 && (
        <p className="card p-4 text-sm text-neutro-500">Registrá clientes desde Preventa con «Cliente nuevo»: cada uno suma {colones(incentivo)} con su primera compra.</p>
      )}
      {cuentan.length > 0 && (
        <ul className="space-y-2">
          {cuentan.map(c => (
            <li key={c.id} className="card flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-bold text-neutro-900"><CheckCircle2 size={16} className="shrink-0 text-exito-600" />{c.nombre}</p>
                <p className="text-sm text-neutro-500">{c.ruta ? `${c.ruta} · ` : ''}primera compra el {corta(c.primeraCompra)}</p>
              </div>
              <span className="shrink-0 text-lg font-bold text-exito-700">+{colones(incentivo)}</span>
            </li>
          ))}
        </ul>
      )}
      {esperando.length > 0 && (
        <ul className="space-y-2">
          {esperando.map(c => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-neutro-300 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold text-neutro-800"><Hourglass size={16} className="shrink-0 text-alerta-600" />{c.nombre}</p>
                <p className="text-sm text-neutro-500">{c.ruta ? `${c.ruta} · ` : ''}registrado el {corta(c.captado)} · cuenta cuando haga su primera compra</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
