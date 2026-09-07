import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Lock, User, Loader2, AlertCircle, Tablet, ShoppingBag } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import AccesoLayout from '../components/acceso/AccesoLayout'

export default function Ingresar() {
  const { entrar } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await entrar({ usuario: usuario.trim(), password })
      // Volver a donde el usuario quería ir antes de que lo mandaran acá.
      navigate(location.state?.destino || '/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo entrar. Revisá la conexión.')
      setPassword('')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AccesoLayout
      eyebrow="Sistema interno"
      titulo="Facturación, inventario y pedidos en un solo lugar"
      descripcion="Herramientas de uso diario para el equipo de Distribuidora Tachi."
    >
      <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-neutro-100 bg-white p-6 shadow-sm">
        <div>
          <label htmlFor="usuario" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutro-400">
            Usuario
          </label>
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-300" />
            <input
              id="usuario"
              type="text"
              autoComplete="username"
              autoFocus
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="w-full rounded-xl border-2 border-neutro-200 py-2.5 pl-9 pr-3 text-sm font-semibold focus:border-naranja-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutro-400">
            Contraseña
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-300" />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border-2 border-neutro-200 py-2.5 pl-9 pr-3 text-sm font-semibold focus:border-naranja-500 focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-peligro-200 bg-peligro-50 px-3 py-2.5">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-peligro-600" />
            <p className="text-xs font-semibold text-peligro-700">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={enviando || !usuario.trim() || !password}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-azul-800 py-2.5 font-bold text-white transition-colors hover:bg-azul-900 disabled:bg-neutro-200"
        >
          {enviando ? <Loader2 size={16} className="animate-spin" /> : null}
          Entrar
        </button>
      </form>

      {/* Los dos catálogos no piden cuenta, y el del agente es el motivo de
          que este bloque exista: la tablet se usa en zonas sin cobertura, y
          antes el agente llegaba acá, no podía pasar el login por falta de
          red, y se quedaba afuera de un catálogo que ya tenía descargado. El
          acceso tiene que estar a la vista, no sabido de memoria. */}
      <div className="mt-6 border-t border-neutro-100 pt-5">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-wider text-neutro-400">
          Sin cuenta
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/catalogo-agente"
            className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-neutro-200 px-3 py-3 text-center transition-colors hover:border-naranja-400 hover:bg-naranja-50"
          >
            <Tablet size={18} className="text-naranja-500" />
            <span className="text-xs font-bold text-neutro-800">Catálogo del agente</span>
            <span className="text-[10px] leading-tight text-neutro-400">Para las tablets en ruta</span>
          </Link>
          <Link
            to="/catalogo"
            className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-neutro-200 px-3 py-3 text-center transition-colors hover:border-neutro-300 hover:bg-neutro-50"
          >
            <ShoppingBag size={18} className="text-neutro-400" />
            <span className="text-xs font-bold text-neutro-800">Catálogo de clientes</span>
            <span className="text-[10px] leading-tight text-neutro-400">El que se manda por WhatsApp</span>
          </Link>
        </div>
      </div>
    </AccesoLayout>
  )
}
