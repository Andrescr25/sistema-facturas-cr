import { Link, useLocation } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { puedeVer } from '../utils/modulos'

/**
 * Bloquea una pantalla para quien no tenga su módulo.
 *
 * Esconder la opción del menú no alcanza: la URL se puede escribir a mano, y
 * quedaba una pantalla a medio dibujar tirando 403 por todos lados sin
 * explicar por qué. Esto lo dice de frente.
 *
 * NO es la seguridad del sistema —el navegador es del usuario y puede hacer
 * lo que quiera con él—; el permiso lo hace valer requirePermiso en el
 * backend, que es quien entrega o niega los datos. Acá se trata de que el
 * sistema se comporte de forma entendible.
 */
export default function RequierePermiso({ children }) {
  const { usuario } = useAuth()
  const { pathname } = useLocation()

  if (puedeVer(usuario, pathname)) return children

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-sm space-y-3 rounded-3xl border border-gray-100 bg-white p-8 text-center">
        <ShieldOff size={36} className="mx-auto text-gray-300" />
        <p className="font-bold text-gray-900">No tiene acceso a esta pantalla</p>
        <p className="text-sm text-gray-500">
          Pídale a un administrador que le habilite el módulo si lo necesita para su trabajo.
        </p>
        <Link to="/" className="inline-block text-sm font-bold text-emerald-700 hover:underline">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
