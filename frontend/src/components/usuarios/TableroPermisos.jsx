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

  // Quitar un módulo quita también sus permisos de acción: sin la pantalla
  // no significan nada, y si se le vuelve a dar el módulo arranca sin ellos.
  const sinAccionesDe = (lista, modulos) => {
    const huerfanas = modulos.flatMap(m => (m.acciones || []).map(a => a.clave))
    return lista.filter(c => !huerfanas.includes(c))
  }

  const alternar = (clave, modulo = null) => {
    if (esAdmin || deshabilitado) return
    if (seleccionados.includes(clave)) {
      const sin = seleccionados.filter(c => c !== clave)
      onCambiar(modulo ? sinAccionesDe(sin, [modulo]) : sin)
    } else {
      onCambiar([...seleccionados, clave])
    }
  }

  const alternarGrupo = (modulos) => {
    if (esAdmin || deshabilitado) return
    const claves = modulos.map(m => m.clave)
    const todos = claves.every(c => seleccionados.includes(c))
    onCambiar(
      todos
        ? sinAccionesDe(seleccionados.filter(c => !claves.includes(c)), modulos)
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
                  <div key={m.clave}>
                    <Casilla marcado={marcado} nombre={m.nombre} onClick={() => alternar(m.clave, m)} deshabilitado={esAdmin || deshabilitado} />
                    {/* Sus permisos de acción, debajo y solo si tiene el módulo. */}
                    {marcado && (m.acciones || []).map(a => (
                      <Casilla key={a.clave} sangria marcado={tiene(a.clave)} nombre={a.nombre} onClick={() => alternar(a.clave)} deshabilitado={esAdmin || deshabilitado} />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Una casilla del tablero: la de un módulo o, con `sangria`, la de un permiso de acción. */
function Casilla({ marcado, nombre, onClick, deshabilitado, sangria = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className={`flex w-full items-center gap-2.5 py-2 pr-3 text-left hover:bg-neutro-50 disabled:cursor-not-allowed disabled:hover:bg-transparent ${sangria ? 'pl-9' : 'pl-3'}`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
          marcado ? 'border-exito-600 bg-exito-600 text-white' : 'border-neutro-300 bg-white'
        }`}
      >
        {marcado && <Check size={11} strokeWidth={3} />}
      </span>
      <span className={`${sangria ? 'text-[12px]' : 'text-[13px]'} ${marcado ? 'font-semibold text-neutro-900' : 'text-neutro-500'}`}>
        {nombre}
      </span>
    </button>
  )
}
