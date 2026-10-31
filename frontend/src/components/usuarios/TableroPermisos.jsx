import Casilla from './Casilla'
import { alternarVistaModulos, porGrupo } from '../../utils/modulos'

/**
 * Las casillas de qué módulos ve un usuario, agrupadas como el menú.
 *
 * Cada grupo tiene su propio "todos", porque repartir permisos casi siempre
 * es por área: al de bodega se le da Ventas entero y nada más. Marcar 17
 * casillas de a una para el caso normal sería trabajo inventado.
 *
 * Para el administrador las casillas eligen su vista; sus permisos de
 * administración se conservan. Para el personal siguen repartiendo acceso.
 */
export default function TableroPermisos({ seleccionados, onCambiar, esAdmin, deshabilitado, modulosOcultos = [], onCambiarOcultos }) {
  const grupos = porGrupo()
  const tiene = (clave) => esAdmin ? !modulosOcultos.includes(clave) : seleccionados.includes(clave)

  // Quitar un módulo quita también sus permisos de acción: sin la pantalla
  // no significan nada, y si se le vuelve a dar el módulo arranca sin ellos.
  const sinAccionesDe = (lista, modulos) => {
    const huerfanas = modulos.flatMap(m => (m.acciones || []).map(a => a.clave))
    return lista.filter(c => !huerfanas.includes(c))
  }

  const alternar = (clave, modulo = null) => {
    if (deshabilitado) return
    if (esAdmin) return onCambiarOcultos(alternarVistaModulos(modulosOcultos, [clave]))
    if (seleccionados.includes(clave)) {
      const sin = seleccionados.filter(c => c !== clave)
      onCambiar(modulo ? sinAccionesDe(sin, [modulo]) : sin)
    } else {
      onCambiar([...seleccionados, clave])
    }
  }

  const alternarGrupo = (modulos) => {
    if (deshabilitado) return
    const claves = modulos.map(m => m.clave)
    if (esAdmin) return onCambiarOcultos(alternarVistaModulos(modulosOcultos, claves))
    const todos = claves.every(c => seleccionados.includes(c))
    onCambiar(
      todos
        ? sinAccionesDe(seleccionados.filter(c => !claves.includes(c)), modulos)
        : [...new Set([...seleccionados, ...claves])]
    )
  }

  return (
    <div className="space-y-3">
      {esAdmin && (
        <p className="rounded-xl bg-alerta-50 border border-alerta-200 px-3 py-2 text-[12px] font-semibold text-alerta-800">
          Elegí qué módulos aparecen en su menú. Conserva sus permisos de administrador y el acceso a Usuarios y permisos.
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
              disabled={deshabilitado}
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
                    <Casilla marcado={marcado} nombre={m.nombre} onClick={() => alternar(m.clave, m)} deshabilitado={deshabilitado} />
                    {/* Sus permisos de acción, debajo y solo si tiene el módulo. */}
                    {!esAdmin && marcado && (m.acciones || []).map(a => (
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
