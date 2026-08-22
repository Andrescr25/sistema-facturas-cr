import { LogOut, Shield } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

/**
 * Quién está usando el sistema, y cómo salirse.
 *
 * Hasta ahora NO había forma de cerrar sesión: se entraba y la única salida
 * era borrar el almacenamiento del navegador o esperar las 12 horas que dura
 * el token. En una computadora compartida —la de bodega, la del mostrador—
 * eso significa que el turno siguiente hereda la sesión del anterior.
 *
 * Va al pie de la barra lateral, en un solo componente para las dos barras
 * (la de móvil y la de escritorio): son dos <nav> distintos en Layout.jsx y
 * duplicar esto acá era condenarse a arreglarlo dos veces.
 */
export default function PieSesion({ onNavegar }) {
  const { usuario, salir } = useAuth()
  if (!usuario) return null

  const cerrar = () => {
    onNavegar?.()
    salir()
  }

  return (
    <div className="border-t border-gray-100 p-3">
      <div className="mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-bold text-gray-900">{usuario.nombre}</p>
          {usuario.esAdmin && (
            <span className="flex shrink-0 items-center gap-0.5 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-extrabold uppercase text-emerald-700">
              <Shield size={9} />
              Admin
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-gray-400">{usuario.usuario}</p>
      </div>

      <button
        type="button"
        onClick={cerrar}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <LogOut size={16} />
        Cerrar sesión
      </button>
    </div>
  )
}
