import { useState } from 'react'
import { Loader2, AlertCircle, UserPlus, Shield, Trash2, Pencil, UserX, UserCheck } from 'lucide-react'
import { useUsuarios } from '../hooks/useUsuarios'
import { useAuth } from '../contexts/AuthContext'
import { MODULOS } from '../utils/modulos'
import ModalUsuario from '../components/usuarios/ModalUsuario'
import ConfirmModal from '../components/ConfirmModal'

/**
 * Usuarios del sistema y qué módulos ve cada uno.
 *
 * Solo la ven administradores. El menú no la muestra a los demás, pero eso es
 * cosmética: lo que de verdad protege es requirePermiso en el backend, que
 * devuelve 403 en /usuarios a quien no sea admin.
 */
export default function Usuarios() {
  const { usuario: yo } = useAuth()
  const {
    usuarios, cargando, error, guardando, setError,
    crear, actualizar, restablecerPassword, eliminar
  } = useUsuarios()

  const [editando, setEditando] = useState(null)   // objeto usuario, o 'nuevo'
  const [porBorrar, setPorBorrar] = useState(null)

  const guardar = async (datos) => {
    const ok = editando === 'nuevo'
      ? await crear(datos)
      : await actualizar(editando.id, datos)
    if (ok) setEditando(null)
  }

  const resumenModulos = (u) => {
    if (u.esAdmin) {
      const ocultos = u.modulosOcultos || []
      const visibles = MODULOS.filter(m => !ocultos.includes(m.clave)).length
      return ocultos.length ? `${visibles} módulos visibles · todos los permisos` : 'Todos los módulos visibles'
    }
    if (!u.modulos?.length) return 'Sin acceso a ningún módulo'
    if (MODULOS.every(m => u.modulos.includes(m.clave))) return 'Todos los módulos'
    const nombres = u.modulos
      .map(c => MODULOS.find(m => m.clave === c)?.nombre)
      .filter(Boolean)
    return nombres.length <= 3
      ? nombres.join(' · ')
      : `${nombres.slice(0, 3).join(' · ')} y ${nombres.length - 3} más`
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-neutro-900">Usuarios y permisos</h1>
          <p className="text-sm text-neutro-500">Quién entra al sistema y qué puede ver cada uno.</p>
        </div>
        <button
          type="button"
          onClick={() => { setError(''); setEditando('nuevo') }}
          className="flex items-center gap-2 rounded-xl bg-exito-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primario-900"
        >
          <UserPlus size={16} />
          Nuevo usuario
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-peligro-200 bg-peligro-50 px-3 py-2.5">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-peligro-600" />
          <p className="text-xs font-semibold text-peligro-700">{error}</p>
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-exito-600" /></div>
      ) : (
        <div className="space-y-3">
          {usuarios.map(u => {
            const esYo = String(u.id) === String(yo?.id)
            const ocupado = guardando === u.id

            return (
              <div key={u.id} className={`rounded-2xl border bg-white p-4 ${u.activo ? 'border-neutro-100' : 'border-neutro-200 bg-neutro-50/60'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-neutro-900">{u.nombre}</p>
                      <span className="rounded-md bg-neutro-100 px-1.5 py-0.5 text-[11px] font-bold text-neutro-500">
                        {u.usuario}
                      </span>
                      {u.esAdmin && (
                        <span className="flex items-center gap-1 rounded-md bg-exito-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-exito-700">
                          <Shield size={10} />
                          Admin
                        </span>
                      )}
                      {esYo && (
                        <span className="rounded-md bg-primario-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-primario-700">
                          Usted
                        </span>
                      )}
                      {!u.activo && (
                        <span className="rounded-md bg-peligro-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-peligro-700">
                          Desactivado
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] text-neutro-500">{resumenModulos(u)}</p>
                    {u.rutas?.length > 0 && (
                      <p className="text-[12px] font-semibold text-primario-700">Rutas: {u.rutas.map(r => r.nombre).join(' · ')}</p>
                    )}
                    <p className="text-[11px] text-neutro-400">
                      {u.ultimoIngreso
                        ? `Último ingreso: ${new Date(u.ultimoIngreso).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`
                        : 'Nunca ha entrado'}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {ocupado && <Loader2 size={15} className="animate-spin text-neutro-400" />}

                    <button
                      type="button"
                      onClick={() => { setError(''); setEditando(u) }}
                      className="flex items-center gap-1.5 rounded-xl border-2 border-neutro-200 px-3 py-2 text-xs font-bold text-neutro-600 hover:border-exito-400 hover:text-exito-700"
                    >
                      <Pencil size={14} />
                      Editar
                    </button>

                    {/* Desactivar y borrar no se le ofrecen a uno mismo: el
                        backend los rechaza igual, pero mostrar un botón que
                        siempre falla es peor que no mostrarlo. */}
                    {!esYo && (
                      <>
                        <button
                          type="button"
                          onClick={() => actualizar(u.id, { activo: !u.activo })}
                          disabled={ocupado}
                          title={u.activo ? 'Desactivar' : 'Reactivar'}
                          className="rounded-xl border-2 border-neutro-200 p-2 text-neutro-500 hover:border-alerta-400 hover:text-alerta-600 disabled:opacity-40"
                        >
                          {u.activo ? <UserX size={14} /> : <UserCheck size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPorBorrar(u)}
                          disabled={ocupado}
                          title="Borrar"
                          className="rounded-xl border-2 border-neutro-200 p-2 text-neutro-500 hover:border-peligro-400 hover:text-peligro-600 disabled:opacity-40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editando && (
        <ModalUsuario
          usuario={editando === 'nuevo' ? null : editando}
          guardando={guardando}
          esYoMismo={editando !== 'nuevo' && String(editando.id) === String(yo?.id)}
          onGuardar={guardar}
          onRestablecer={(password) => restablecerPassword(editando.id, password)}
          onCerrar={() => setEditando(null)}
        />
      )}

      {porBorrar && (
        <ConfirmModal
          isOpen
          title={`¿Borrar a ${porBorrar.nombre}?`}
          message={`El usuario "${porBorrar.usuario}" y sus permisos se eliminan. No se puede deshacer.`}
          confirmLabel="Borrar"
          variant="danger"
          onConfirm={async () => { await eliminar(porBorrar.id); setPorBorrar(null) }}
          onCancel={() => setPorBorrar(null)}
        />
      )}
    </div>
  )
}
