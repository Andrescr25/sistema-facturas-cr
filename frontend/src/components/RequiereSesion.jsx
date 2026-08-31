import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * Envuelve todo el sistema interno. Mientras se revalida el token guardado
 * no se decide nada: sin esta espera, al recargar la página se vería un
 * parpadeo a la pantalla de ingreso antes de confirmar que la sesión sigue
 * viva, y peor, se perdería la ruta en la que estaba el usuario.
 *
 * Esto es una barrera de interfaz, no de seguridad — la de verdad es
 * requireAuth en el backend, que es quien no entrega los datos. Acá solo se
 * evita dibujar pantallas que igual van a fallar.
 */
export default function RequiereSesion({ children }) {
  const { usuario, cargando } = useAuth()
  const location = useLocation()

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutro-50">
        <div className="w-8 h-8 border-4 border-neutro-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!usuario) {
    return <Navigate to="/ingresar" replace state={{ destino: location.pathname + location.search }} />
  }

  return children
}
