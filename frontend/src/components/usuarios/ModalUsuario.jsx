import { useState } from 'react'
import { X, Loader2, AlertCircle, Shield, KeyRound } from 'lucide-react'
import TableroPermisos from './TableroPermisos'
import { useModal } from '../../hooks/useModal'

/**
 * Alta y edición de un usuario, con sus permisos en la misma pantalla.
 *
 * La contraseña solo se pide al crear. Para cambiársela a alguien que la
 * olvidó hay un botón aparte, que no exige la anterior — quien la olvidó no
 * la puede escribir.
 */
export default function ModalUsuario({ usuario, guardando, onGuardar, onCerrar, onRestablecer, esYoMismo }) {
  useModal(onCerrar)
  const editando = Boolean(usuario)

  const [nombreUsuario, setNombreUsuario] = useState(usuario?.usuario || '')
  const [nombre, setNombre] = useState(usuario?.nombre || '')
  const [password, setPassword] = useState('')
  const [esAdmin, setEsAdmin] = useState(usuario?.esAdmin || false)
  const [modulos, setModulos] = useState(usuario?.esAdmin ? [] : (usuario?.modulos || []))
  const [error, setError] = useState('')
  const [passwordNueva, setPasswordNueva] = useState('')
  const [cambiandoPassword, setCambiandoPassword] = useState(false)

  const guardar = () => {
    if (!editando) {
      if (nombreUsuario.trim().length < 3) return setError('El usuario debe tener al menos 3 caracteres.')
      if (!nombre.trim()) return setError('El nombre es obligatorio.')
      if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    }
    if (!esAdmin && modulos.length === 0) {
      return setError('Elija al menos un módulo, o hágalo administrador.')
    }
    setError('')
    onGuardar(
      editando
        ? { nombre: nombre.trim(), esAdmin, modulos }
        : { usuario: nombreUsuario.trim(), nombre: nombre.trim(), password, esAdmin, modulos }
    )
  }

  const restablecer = () => {
    if (passwordNueva.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    setError('')
    onRestablecer(passwordNueva)
    setPasswordNueva('')
    setCambiandoPassword(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />

      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-neutro-100 p-4">
          <h2 className="font-extrabold text-neutro-900">
            {editando ? `Editar ${usuario.usuario}` : 'Nuevo usuario'}
          </h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1 text-neutro-400 hover:text-neutro-700">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!editando && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="u-usuario" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutro-400">
                  Usuario
                </label>
                <input
                  id="u-usuario" type="text" autoFocus value={nombreUsuario}
                  onChange={(e) => setNombreUsuario(e.target.value)}
                  placeholder="con el que entra"
                  className="w-full rounded-xl border-2 border-neutro-200 px-3 py-2.5 text-sm font-semibold focus:border-primario-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="u-password" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutro-400">
                  Contraseña <span className="font-semibold normal-case text-neutro-300">(mínimo 8)</span>
                </label>
                <input
                  id="u-password" type="text" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="se la entrega usted"
                  className="w-full rounded-xl border-2 border-neutro-200 px-3 py-2.5 text-sm font-semibold focus:border-primario-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="u-nombre" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutro-400">
              Nombre completo
            </label>
            <input
              id="u-nombre" type="text" value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-xl border-2 border-neutro-200 px-3 py-2.5 text-sm font-semibold focus:border-primario-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => !esYoMismo && setEsAdmin(v => !v)}
            disabled={esYoMismo}
            className={`w-full flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${
              esAdmin ? 'border-exito-500 bg-exito-50' : 'border-neutro-200 hover:border-neutro-300'
            }`}
          >
            <Shield size={18} className={esAdmin ? 'text-exito-600' : 'text-neutro-300'} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-neutro-900">Administrador</p>
              <p className="text-[11px] text-neutro-500">
                {esYoMismo
                  ? 'No puede quitarse a usted mismo este rol.'
                  : 'Ve todos los módulos y puede gestionar usuarios.'}
              </p>
            </div>
          </button>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-neutro-400">Módulos que puede ver</p>
            <TableroPermisos
              seleccionados={modulos}
              onCambiar={setModulos}
              esAdmin={esAdmin}
              deshabilitado={Boolean(guardando)}
            />
          </div>

          {editando && (
            <div className="rounded-2xl border border-neutro-200 p-3">
              {cambiandoPassword ? (
                <div className="space-y-2">
                  <label htmlFor="u-nueva" className="block text-xs font-bold uppercase tracking-wider text-neutro-400">
                    Contraseña nueva <span className="font-semibold normal-case text-neutro-300">(mínimo 8)</span>
                  </label>
                  <input
                    id="u-nueva" type="text" autoFocus value={passwordNueva}
                    onChange={(e) => setPasswordNueva(e.target.value)}
                    className="w-full rounded-xl border-2 border-neutro-200 px-3 py-2 text-sm font-semibold focus:border-primario-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={restablecer}
                      className="flex-1 rounded-xl bg-neutro-900 py-2 text-sm font-bold text-white hover:bg-neutro-800">
                      Guardar contraseña
                    </button>
                    <button type="button" onClick={() => { setCambiandoPassword(false); setPasswordNueva('') }}
                      className="px-3 text-xs font-semibold text-neutro-400">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setCambiandoPassword(true)}
                  className="flex items-center gap-2 text-[13px] font-bold text-neutro-600 hover:text-neutro-900">
                  <KeyRound size={15} />
                  Ponerle una contraseña nueva
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-peligro-200 bg-peligro-50 px-3 py-2.5">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-peligro-600" />
              <p className="text-xs font-semibold text-peligro-700">{error}</p>
            </div>
          )}
        </div>

        <div className="border-t border-neutro-100 p-4">
          <button
            type="button"
            onClick={guardar}
            disabled={Boolean(guardando)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-exito-600 py-3 font-bold text-white transition-colors hover:bg-primario-900 disabled:bg-neutro-200"
          >
            {guardando ? <Loader2 size={16} className="animate-spin" /> : null}
            {editando ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </div>
      </div>
    </div>
  )
}
