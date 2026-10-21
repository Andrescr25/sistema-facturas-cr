import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Lock, User, Loader2, AlertCircle } from 'lucide-react'
import { usePortalCliente } from '../../contexts/PortalClienteContext'
import AccesoLayout from '../../components/acceso/AccesoLayout'

export default function PortalIngresar() {
  const { entrar } = usePortalCliente()
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
      navigate(location.state?.destino || '/catalogo', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo entrar. Revise su conexión.')
      setPassword('')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AccesoLayout
      eyebrow="Portal de clientes"
      titulo="Arme su pedido y consulte sus facturas"
      descripcion="Precios al día, sus productos de siempre y el estado de sus cuentas, todo en un mismo lugar."
    >
      <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-neutro-100 bg-white p-6 shadow-sm">
        <div>
          <label htmlFor="usuario" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutro-400">Usuario</label>
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-300" />
            <input
              id="usuario" type="text" autoComplete="username" autoFocus
              value={usuario} onChange={(e) => setUsuario(e.target.value)}
              className="w-full rounded-xl border-2 border-neutro-200 py-2.5 pl-9 pr-3 text-sm font-semibold focus:border-naranja-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutro-400">Contraseña</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-300" />
            <input
              id="password" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
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
          type="submit" disabled={enviando || !usuario.trim() || !password}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-azul-800 py-2.5 font-bold text-white transition-colors hover:bg-azul-900 disabled:bg-neutro-200"
        >
          {enviando ? <Loader2 size={16} className="animate-spin" /> : null}
          Entrar
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-neutro-400">
        <Link to="/catalogo" className="font-semibold text-naranja-600 hover:underline">Ver el catálogo sin entrar</Link>
      </p>
    </AccesoLayout>
  )
}
