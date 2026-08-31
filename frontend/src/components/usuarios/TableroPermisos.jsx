import { Check } from 'lucide-react'
import { porGrupo } from '../../utils/modulos'

/**
 * Las casillas de qué módulos ve un usuario, agrupadas como el menú.
 *
 * Cada grupo tiene su propio "todos", porque repartir permisos casi siempre
 * es por área: al de bodega se le da Ventas entero y nada más. Marcar 17
 * casillas de a una para el caso normal sería trabajo inventado.
 *
 * Con `esAdmin` el tablero se muestra completo y bloqueado: un administrador
 * ve todo por su rol, y dejar casillas editables ahí haría creer que se le
 * puede quitar una.
 */
export default function TableroPermisos({ seleccionados, onCambiar, esAdmin, deshabilitado }) {
  const grupos = porGrupo()
  const tiene = (clave) => esAdmin || seleccionados.includes(clave)

  const alternar = (clave) => {
    if (esAdmin || deshabilitado) return
    onCambiar(
      seleccionados.includes(clave)
        ? seleccionados.filter(c => c !== clave)
        : [...seleccionados, clave]
    )
  }

  const alternarGrupo = (modulos) => {
    if (esAdmin || deshabilitado) return
    const claves = modulos.map(m => m.clave)
    const todos = claves.every(c => seleccionados.includes(c))
    onCambiar(
      todos
        ? seleccionados.filter(c => !claves.includes(c))
        : [...new Set([...seleccionados, ...claves])]
    )
  }

  return (
    <div className={`space-y-3 ${esAdmin ? 'opacity-60' : ''}`}>
      {esAdmin && (
        <p className="rounded-xl bg-alerta-50 border border-alerta-200 px-3 py-2 text-[12px] font-semibold text-alerta-800">
          Es administrador: ve todos los módulos y además gestiona usuarios. Quítele el rol para elegir módulos uno por uno.
        </p>
      )}

      {grupos.map(({ grupo, modulos }) => {
        const claves = modulos.map(m => m.clave)
        const todos = claves.every(c => tiene(c))

        return (
          <div key={grupo} className="rounded-2xl border border-neutro-200 overflow-hidden">
            <button
              type="button"
              onClick={() => alternarGrupo(modulos)}
              disabled={esAdmin || deshabilitado}
              className="w-full flex items-center justify-between gap-2 bg-neutro-50 px-3 py-2 text-left disabled:cursor-not-allowed"
            >
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-neutro-500">{grupo}</span>
              <span className={`text-[11px] font-bold ${todos ? 'text-exito-700' : 'text-neutro-400'}`}>
                {todos ? 'Todos' : `${claves.filter(c => tiene(c)).length} de ${claves.length}`}
              </span>
            </button>

            <div className="divide-y divide-neutro-100">
              {modulos.map(m => {
                const marcado = tiene(m.clave)
                return (
                  <button
                    key={m.clave}
                    type="button"
                    onClick={() => alternar(m.clave)}
                    disabled={esAdmin || deshabilitado}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-neutro-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
                        marcado ? 'border-exito-600 bg-exito-600 text-white' : 'border-neutro-300 bg-white'
                      }`}
                    >
                      {marcado && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className={`text-[13px] ${marcado ? 'font-semibold text-neutro-900' : 'text-neutro-500'}`}>
                      {m.nombre}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
