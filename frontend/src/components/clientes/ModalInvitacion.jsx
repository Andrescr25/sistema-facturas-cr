import { useState } from 'react'
import { X, Copy, Check, AlertTriangle, Send, Loader2, Phone } from 'lucide-react'
import { useModal } from '../../hooks/useModal'
import { mensajeInvitacion } from '../../utils/mensajeInvitacion'
import api from '../../services/api'

/**
 * Muestra el enlace recién generado y deja mandarlo por WhatsApp.
 *
 * Se ve UNA sola vez: en la base queda solo el hash del token, igual que con
 * una contraseña. Por eso el aviso es explícito — si se cierra sin copiarlo,
 * hay que generar otro.
 *
 * EL NÚMERO SE ELIGE, NO SE ADIVINA
 * Los teléfonos de las fichas de Alegra vienen sucios: con el nombre de quien
 * contesta pegado, con dos números en el mismo campo, o sin ningún número.
 * Este enlace deja crear la cuenta del cliente y ver sus facturas, así que
 * mandarlo al número equivocado es entregarle esa cuenta a un desconocido.
 * El servidor devuelve todos los candidatos y acá se muestran para que sea
 * una persona la que decida, con el número a la vista antes de mandar.
 */
export default function ModalInvitacion({ invitacion, onCerrar }) {
  useModal(onCerrar)
  const [copiado, setCopiado] = useState(false)

  const telefonos = invitacion.telefonos || []
  const [numero, setNumero] = useState(telefonos[0]?.numero || '')
  const [otro, setOtro] = useState('')
  const [mensaje, setMensaje] = useState(() => mensajeInvitacion(invitacion.enlace))

  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(null)
  const [error, setError] = useState('')

  // Sin candidatos utilizables se escribe a mano, sin más vueltas.
  const escribiendo = numero === 'otro' || telefonos.length === 0
  const elegido = telefonos.find(t => t.numero === numero)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(invitacion.enlace)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // Sin permiso de portapapeles el texto igual está a la vista para
      // seleccionarlo a mano.
      setCopiado(false)
    }
  }

  const enviar = async () => {
    setError('')
    const destino = escribiendo ? otro : elegido?.nacional
    if (!destino) return setError('Elegí o escribí el número.')

    setEnviando(true)
    try {
      const { data } = await api.post(
        `/portal-clientes/clientes/${invitacion.alegraContactId}/invitacion/whatsapp`,
        { telefono: destino, mensaje }
      )
      setEnviado(data.data?.telefono || destino)
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo mandar el mensaje.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />

      <div className="relative bg-white w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-neutro-900">Enlace para {invitacion.cliente}</h2>
            <p className="text-xs text-neutro-500 mt-0.5">
              Vence en {invitacion.diasVigencia} días.
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1 text-neutro-400 hover:text-neutro-700 shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="bg-neutro-50 border border-neutro-200 rounded-2xl p-3 break-all text-xs font-mono text-neutro-700">
          {invitacion.enlace}
        </div>

        <button
          type="button"
          onClick={copiar}
          className="w-full bg-primario-800 hover:bg-primario-900 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          {copiado ? <Check size={16} /> : <Copy size={16} />}
          {copiado ? 'Copiado' : 'Copiar enlace'}
        </button>

        <div className="flex items-start gap-2 bg-alerta-50 border border-alerta-200 rounded-2xl px-3 py-2.5">
          <AlertTriangle size={15} className="text-alerta-600 shrink-0 mt-0.5" />
          <p className="text-xs text-alerta-800">
            Copialo ahora: no se vuelve a mostrar. Si lo perdés, generá otro — el anterior deja de servir.
          </p>
        </div>

        {/* ---- Mandarlo por WhatsApp ---- */}
        <div className="border-t border-neutro-200 pt-4">
          {enviado ? (
            <div className="flex items-start gap-2 bg-exito-50 border border-exito-200 rounded-2xl px-3 py-2.5">
              <Check size={15} className="text-exito-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-exito-800">
                Mensaje enviado al {enviado}.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-neutro-400 mb-2">
                Mandarlo por WhatsApp
              </p>

              {telefonos.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {telefonos.map(t => (
                    <button
                      key={t.numero}
                      type="button"
                      onClick={() => setNumero(t.numero)}
                      className={`flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors ${
                        numero === t.numero
                          ? 'border-primario-700 bg-primario-50 text-primario-900'
                          : 'border-neutro-200 text-neutro-600 hover:border-neutro-300'
                      }`}
                    >
                      <Phone size={13} />
                      {t.formateado}
                      {/* Un fijo casi nunca tiene WhatsApp: se ofrece, pero
                          diciendo lo que es. */}
                      {!t.esMovil && <span className="text-[11px] font-semibold text-alerta-600">fijo</span>}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setNumero('otro')}
                    className={`rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors ${
                      numero === 'otro'
                        ? 'border-primario-700 bg-primario-50 text-primario-900'
                        : 'border-neutro-200 text-neutro-600 hover:border-neutro-300'
                    }`}
                  >
                    Otro número
                  </button>
                </div>
              )}

              {escribiendo && (
                <div className="mb-2">
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={otro}
                    onChange={(e) => setOtro(e.target.value)}
                    placeholder="8888 8888"
                    aria-label="Número de WhatsApp"
                    className="w-full rounded-xl border-2 border-neutro-200 px-3 py-2.5 text-sm font-semibold focus:border-acento-500 focus:outline-none"
                  />
                  {/* Se dice qué tiene guardado la ficha: casi siempre hay
                      algo escrito, solo que no es un teléfono. */}
                  {telefonos.length === 0 && (
                    <p className="mt-1.5 text-[11px] text-neutro-500">
                      {invitacion.telefonosSinReconocer?.length > 0
                        ? `En Alegra este cliente tiene anotado "${invitacion.telefonosSinReconocer.join('", "')}", que no es un número de 8 dígitos.`
                        : 'Este cliente no tiene teléfono en Alegra.'}
                    </p>
                  )}
                </div>
              )}

              <textarea
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                rows={7}
                aria-label="Mensaje"
                className="w-full rounded-2xl border-2 border-neutro-200 px-3 py-2.5 text-xs text-neutro-700 focus:border-acento-500 focus:outline-none"
              />

              {error && (
                <div className="flex items-start gap-2 bg-peligro-50 border border-peligro-200 rounded-2xl px-3 py-2.5 mt-2">
                  <AlertTriangle size={15} className="text-peligro-600 shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-peligro-800">{error}</p>
                </div>
              )}

              <button
                type="button"
                onClick={enviar}
                disabled={enviando}
                className="mt-2 w-full bg-exito-600 hover:bg-exito-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {enviando
                  ? 'Enviando…'
                  : `Enviar${escribiendo ? '' : ` al ${elegido?.formateado || ''}`}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
