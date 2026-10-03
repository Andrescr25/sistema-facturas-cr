import { useEffect, useState } from 'react'
import { X, Mail, Loader2, Paperclip, AlertTriangle, Plus, Trash2, UserPlus } from 'lucide-react'
import { useModal } from '../../hooks/useModal'

/**
 * Elige a quién mandarle los reportes del mes.
 *
 * Los contactos viven en la base, así que cambiar de contador no obliga a
 * volver a escribir la dirección ni pierde la del anterior. El último al que
 * se le envió queda preseleccionado.
 */
export default function ModalEnviarContador({
  abierto, onCerrar, onEnviar, onCrearContacto, onEliminarContacto,
  contactos, envioDisponible, etiquetaMes, adjuntos
}) {
  // `abierto` es imprescindible acá: este modal se monta siempre y decide
  // más abajo si dibujarse. Sin pasarlo, bloqueaba el scroll de la página
  // estando cerrado.
  useModal(onCerrar, abierto)
  const [contactoId, setContactoId] = useState('')
  const [agregando, setAgregando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoEmail, setNuevoEmail] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  // Al abrir, preselecciona el primero (el backend los ordena por último uso)
  // y abre el formulario directo si todavía no hay ninguno.
  useEffect(() => {
    if (!abierto) return
    setContactoId(contactos[0]?.id || '')
    setAgregando(contactos.length === 0)
    setNuevoNombre('')
    setNuevoEmail('')
    setError('')
  }, [abierto, contactos])

  if (!abierto) return null

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(nuevoEmail.trim())
  const puedeGuardar = nuevoNombre.trim().length > 0 && emailValido && !guardando
  const seleccionado = contactos.find(c => c.id === contactoId)

  const handleGuardarContacto = async () => {
    if (!puedeGuardar) return
    setGuardando(true)
    setError('')
    const resultado = await onCrearContacto({ nombre: nuevoNombre.trim(), email: nuevoEmail.trim() })
    setGuardando(false)
    if (!resultado?.ok) { setError(resultado?.mensaje || 'No se pudo guardar el contacto.'); return }
    setContactoId(resultado.contacto.id)
    setAgregando(false)
    setNuevoNombre('')
    setNuevoEmail('')
  }

  const handleEliminar = async () => {
    if (!seleccionado) return
    setError('')
    const resultado = await onEliminarContacto(seleccionado)
    if (!resultado?.ok) setError(resultado?.mensaje || 'No se pudo eliminar el contacto.')
  }

  const handleEnviar = async () => {
    if (!contactoId || enviando) return
    setEnviando(true)
    setError('')
    const resultado = await onEnviar(contactoId)
    setEnviando(false)
    if (resultado?.ok) onCerrar()
    else setError(resultado?.mensaje || 'No se pudo enviar el correo.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutro-100">
          <h3 className="text-base font-semibold text-neutro-900 flex items-center gap-2">
            <Mail size={17} className="text-primario-600" />
            Enviar al contador
          </h3>
          <button onClick={onCerrar} className="text-neutro-400 hover:text-neutro-700"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutro-500 mb-1.5">Enviar a</label>
            {contactos.length === 0 ? (
              <p className="text-sm text-neutro-400 py-2">Todavía no hay contactos guardados.</p>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={contactoId}
                  onChange={e => setContactoId(e.target.value)}
                  className="flex-1 border border-neutro-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primario-500/30 focus:border-primario-400"
                >
                  {contactos.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre} — {c.email}</option>
                  ))}
                </select>
                <button
                  onClick={handleEliminar}
                  title={seleccionado ? `Eliminar a ${seleccionado.nombre}` : 'Eliminar'}
                  className="p-2 text-neutro-300 hover:text-peligro-600 transition shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}

            {!agregando ? (
              <button
                onClick={() => setAgregando(true)}
                className="mt-2 text-xs text-primario-600 hover:text-primario-700 flex items-center gap-1.5"
              >
                <Plus size={13} /> Agregar otro contacto
              </button>
            ) : (
              <div className="mt-3 border border-neutro-200 rounded-lg p-3 space-y-2 bg-neutro-50/60">
                <p className="text-xs font-medium text-neutro-600 flex items-center gap-1.5">
                  <UserPlus size={13} className="text-neutro-400" /> Nuevo contacto
                </p>
                <input
                  type="text"
                  value={nuevoNombre}
                  onChange={e => setNuevoNombre(e.target.value)}
                  placeholder="Nombre (ej. Marta Solís)"
                  autoFocus
                  className="w-full border border-neutro-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primario-500/30"
                />
                <input
                  type="email"
                  value={nuevoEmail}
                  onChange={e => setNuevoEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleGuardarContacto()}
                  placeholder="correo@ejemplo.com"
                  className="w-full border border-neutro-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primario-500/30"
                />
                <div className="flex justify-end gap-2 pt-0.5">
                  {contactos.length > 0 && (
                    <button onClick={() => setAgregando(false)} className="text-xs text-neutro-500 hover:text-neutro-800 px-2 py-1">
                      Cancelar
                    </button>
                  )}
                  <button
                    onClick={handleGuardarContacto}
                    disabled={!puedeGuardar}
                    className="text-xs font-medium bg-neutro-900 text-white rounded-lg px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {guardando ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Guardar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Qué se manda exactamente: van los DOS períodos del mes, no solo
              el de la pestaña abierta. */}
          <div className="bg-neutro-50 rounded-lg px-3 py-2.5">
            <p className="text-xs font-medium text-neutro-600 mb-1.5">Se adjunta de {etiquetaMes}:</p>
            {adjuntos.length === 0 ? (
              <p className="text-xs text-neutro-400">Nada cargado para este mes.</p>
            ) : (
              <ul className="space-y-1">
                {adjuntos.map(a => (
                  <li key={a} className="text-xs text-neutro-600 flex items-center gap-1.5">
                    <Paperclip size={11} className="text-neutro-400 shrink-0" />
                    Reporte de {a} (con tus correcciones)
                  </li>
                ))}
              </ul>
            )}
            {adjuntos.length === 1 && (
              <p className="text-[11px] text-alerta-700 mt-1.5 flex items-start gap-1">
                <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                Falta el otro reporte del mes — traelo antes de enviar si lo necesitás.
              </p>
            )}
          </div>

          {!envioDisponible && (
            <p className="text-xs text-peligro-600 flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              El envío de correo no está configurado en el servidor.
            </p>
          )}
          {error && <p className="text-xs text-peligro-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-neutro-100">
          <button onClick={onCerrar} className="px-3 py-1.5 text-sm text-neutro-600 hover:text-neutro-900">
            Cancelar
          </button>
          <button
            onClick={handleEnviar}
            disabled={!contactoId || enviando || adjuntos.length === 0 || !envioDisponible}
            className="btn btn-primary !py-1.5 !px-4 text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            {enviando ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
