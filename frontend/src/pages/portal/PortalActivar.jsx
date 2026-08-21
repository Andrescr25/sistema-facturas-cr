import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Lock, User, Loader2, AlertCircle } from 'lucide-react'
import { usePortalCliente } from '../../contexts/PortalClienteContext'
import apiPortal from '../../services/apiPortal'
import AccesoLayout from '../../components/acceso/AccesoLayout'

/**
 * El cliente abre el enlace que le mandaron y elige usuario y contraseña.
 *
 * El usuario lo escribe él, en blanco. No es el correo (solo el 13% de los
 * clientes tiene uno cargado en Alegra) ni la cédula: la que hay en Alegra
 * muchas veces es un relleno tipo "100000000" porque en el mostrador nadie la
 * pide. Pre-cargarla —como se hacía antes— dejaba al cliente con un usuario
 * que no es suyo y que no va a recordar.
 */
export default function PortalActivar() {
  const { token } = useParams()
  const { activar } = usePortalCliente()
  const navigate = useNavigate()

  const [invitacion, setInvitacion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorEnlace, setErrorEnlace] = useState('')

  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    apiPortal.get(`/portal/invitacion/${token}`)
      .then(({ data }) => setInvitacion(data.data))
      .catch((err) => setErrorEnlace(err.response?.data?.message || 'No se pudo abrir el enlace.'))
      .finally(() => setCargando(false))
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== password2) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setError('')
    setEnviando(true)
    try {
      await activar({ token, usuario: usuario.trim(), password })
      navigate('/catalogo', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear la cuenta.')
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) {
    return (
      <AccesoLayout eyebrow="Activación de cuenta" titulo="Cree su acceso" descripcion="Estamos abriendo su invitación.">
        <div className="flex justify-center py-10">
          <Loader2 size={28} className="animate-spin text-azul-800" />
        </div>
      </AccesoLayout>
    )
  }

  if (errorEnlace) {
    return (
      <AccesoLayout eyebrow="Activación de cuenta" titulo="Cree su acceso" descripcion="Un enlace personal para crear su contraseña.">
        <div className="space-y-3 rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-sm">
          <AlertCircle size={36} className="mx-auto text-naranja-500" />
          <p className="font-bold text-slate-900">{errorEnlace}</p>
          <p className="text-sm text-slate-500">Solicítenos un enlace nuevo para crear su cuenta.</p>
          <Link to="/catalogo" className="inline-block text-sm font-bold text-naranja-600 hover:underline">
            Ver el catálogo
          </Link>
        </div>
      </AccesoLayout>
    )
  }

  return (
    <AccesoLayout
      eyebrow="Activación de cuenta"
      titulo="Cree su acceso en un minuto"
      descripcion="Elija usuario y contraseña para entrar cuando quiera, armar su pedido y ver sus facturas."
    >
      <div className="mb-4 text-center">
        <h1 className="text-xl font-extrabold text-slate-900">Cree su cuenta</h1>
        <p className="mt-1 text-sm text-slate-500">{invitacion?.nombre}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div>
          <label htmlFor="usuario" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
            Usuario para entrar <span className="font-semibold normal-case text-slate-300">(mínimo 4)</span>
          </label>
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              id="usuario" type="text" autoComplete="username" autoFocus value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="El nombre con que va a entrar"
              className="w-full rounded-xl border-2 border-slate-200 py-2.5 pl-9 pr-3 text-sm font-semibold focus:border-naranja-500 focus:outline-none"
            />
          </div>
          {/* El campo llega vacío a propósito (ver el encabezado): sin una
              indicación, un campo en blanco no dice qué se espera. */}
          <p className="mt-1.5 text-[11px] text-slate-400">
            Elija el que quiera y anótelo. Lo va a usar cada vez que entre.
          </p>
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
            Contraseña <span className="font-semibold normal-case text-slate-300">(mínimo 8)</span>
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              id="password" type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border-2 border-slate-200 py-2.5 pl-9 pr-3 text-sm font-semibold focus:border-naranja-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password2" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
            Repítala
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              id="password2" type="password" autoComplete="new-password" value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className="w-full rounded-xl border-2 border-slate-200 py-2.5 pl-9 pr-3 text-sm font-semibold focus:border-naranja-500 focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-150 bg-red-50 px-3 py-2.5">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-600" />
            <p className="text-xs font-semibold text-red-700">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={enviando || usuario.trim().length < 4 || password.length < 8 || !password2}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-azul-800 py-2.5 font-bold text-white transition-colors hover:bg-azul-900 disabled:bg-slate-200"
        >
          {enviando ? <Loader2 size={16} className="animate-spin" /> : null}
          Crear cuenta
        </button>
      </form>
    </AccesoLayout>
  )
}
