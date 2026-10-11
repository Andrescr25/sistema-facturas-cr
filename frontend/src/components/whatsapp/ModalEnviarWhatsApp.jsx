import { useEffect, useState } from 'react'
import { X, Check, AlertTriangle, Send, Loader2, Phone, Clock } from 'lucide-react'
import { useModal } from '../../hooks/useModal'
import api from '../../services/api'

/**
 * Mandar algo por WhatsApp: elegir el número, revisar el mensaje, enviar.
 *
 * ES UNO SOLO PARA LOS CINCO CASOS —invitación, cotización, factura,
 * recordatorio de saldo y aviso de pedido— y eso importa por una razón
 * concreta: por acá salen documentos del cliente, y la defensa contra
 * mandarlos a un desconocido es que el número esté a la vista antes de
 * apretar. Con cinco copias de esta pantalla, basta que una se quede atrás
 * para perder esa defensa justo donde nadie está mirando.
 *
 * Los teléfonos de las fichas vienen sucios (el nombre de quien contesta
 * pegado, dos números en el mismo campo, o ninguno), así que se muestran
 * TODOS los candidatos y elige una persona. Ver
 * backend/src/utils/telefonosCliente.js.
 *
 * `clienteId` ES EL ID PROPIO del cliente, nunca el de Alegra. El cliente
 * propio 8 es "AB CHANA" y el contacto 8 de Alegra es "EL LLANO": pasar uno
 * por el otro propone el celular de otra persona. Hubo una segunda prop,
 * `contactoId`, que iba a buscar el teléfono a Alegra; se retiró el
 * 2026-10-04, cuando ya nadie la pasaba.
 */
export default function ModalEnviarWhatsApp({
  titulo,
  subtitulo,
  // Los teléfonos ya resueltos, o de quién ir a buscarlos: `clienteId`, el
  // id propio del cliente.
  telefonos: telefonosIniciales,
  telefonosSinReconocer: sinReconocerInicial,
  clienteId,
  mensajeInicial = '',
  // Para avisar si ya se mandó antes: { tipo, referencia }
  documento,
  onEnviar,
  onCerrar
}) {
  useModal(onCerrar)

  const [telefonos, setTelefonos] = useState(telefonosIniciales || [])
  const [sinReconocer, setSinReconocer] = useState(sinReconocerInicial || [])
  const origen = clienteId ? `/envios-whatsapp/telefonos-cliente/${clienteId}` : null
  const [cargando, setCargando] = useState(Boolean(origen) && !telefonosIniciales)
  const [previos, setPrevios] = useState([])

  const [numero, setNumero] = useState(telefonosIniciales?.[0]?.numero || '')
  const [otro, setOtro] = useState('')
  const [mensaje, setMensaje] = useState(mensajeInicial)

  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { setMensaje(mensajeInicial) }, [mensajeInicial])

  useEffect(() => {
    if (!origen || telefonosIniciales) return
    let vivo = true
    setCargando(true)
    api.get(origen)
      .then(r => {
        if (!vivo) return
        const lista = r.data?.data?.telefonos || []
        setTelefonos(lista)
        setSinReconocer(r.data?.data?.telefonosSinReconocer || [])
        setNumero(lista[0]?.numero || '')
      })
      .catch(() => { if (vivo) { setTelefonos([]); setSinReconocer([]) } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [origen, telefonosIniciales])

  // "¿Ya le mandé esto?" — sin el aviso se termina mandando dos veces.
  useEffect(() => {
    if (!documento?.tipo || !documento?.referencia) return
    let vivo = true
    api.get('/envios-whatsapp/historial', { params: documento })
      .then(r => { if (vivo) setPrevios(r.data?.data || []) })
      .catch(() => { if (vivo) setPrevios([]) })
    return () => { vivo = false }
  }, [documento?.tipo, documento?.referencia])

  const escribiendo = numero === 'otro' || (!cargando && telefonos.length === 0)
  const elegido = telefonos.find(t => t.numero === numero)
  const yaEnviado = previos.find(p => p.exito)

  const enviar = async () => {
    setError('')
    const destino = escribiendo ? otro : elegido?.nacional
    if (!destino) return setError('Elegí o escribí el número.')

    setEnviando(true)
    try {
      const r = await onEnviar({ telefono: destino, mensaje })
      setEnviado(r?.telefono || destino)
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
          <div className="min-w-0">
            <h2 className="font-extrabold text-neutro-900 truncate">{titulo}</h2>
            {subtitulo && <p className="text-xs text-neutro-500 mt-0.5">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar"
            className="p-1 text-neutro-400 hover:text-neutro-700 shrink-0"><X size={20} /></button>
        </div>

        {enviado ? (
          <div className="flex items-start gap-2 bg-exito-50 border border-exito-200 rounded-2xl px-3 py-2.5">
            <Check size={15} className="text-exito-600 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-exito-800">Enviado al {enviado}.</p>
          </div>
        ) : cargando ? (
          <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-neutro-300" /></div>
        ) : (
          <>
            {yaEnviado && (
              <div className="flex items-start gap-2 bg-alerta-50 border border-alerta-200 rounded-2xl px-3 py-2.5">
                <Clock size={15} className="text-alerta-600 shrink-0 mt-0.5" />
                <p className="text-xs text-alerta-800">
                  Ya se mandó al {yaEnviado.telefono.replace(/^506/, '')} el{' '}
                  {new Date(yaEnviado.cuando).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })}
                  {yaEnviado.enviadoPor ? ` por ${yaEnviado.enviadoPor}` : ''}.
                </p>
              </div>
            )}

            {telefonos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {telefonos.map(t => (
                  <button key={t.numero} type="button" onClick={() => setNumero(t.numero)}
                    className={`flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors ${
                      numero === t.numero
                        ? 'border-primario-700 bg-primario-50 text-primario-900'
                        : 'border-neutro-200 text-neutro-600 hover:border-neutro-300'
                    }`}>
                    <Phone size={13} />
                    {t.formateado}
                    {/* Un fijo casi nunca tiene WhatsApp: se ofrece, pero
                        diciendo lo que es. */}
                    {!t.esMovil && <span className="text-[11px] font-semibold text-alerta-600">fijo</span>}
                  </button>
                ))}
                <button type="button" onClick={() => setNumero('otro')}
                  className={`rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors ${
                    numero === 'otro'
                      ? 'border-primario-700 bg-primario-50 text-primario-900'
                      : 'border-neutro-200 text-neutro-600 hover:border-neutro-300'
                  }`}>
                  Otro número
                </button>
              </div>
            )}

            {escribiendo && (
              <div>
                <input
                  type="tel" inputMode="numeric" value={otro}
                  onChange={(e) => setOtro(e.target.value)}
                  placeholder="8888 8888"
                  aria-label="Número de WhatsApp"
                  className="w-full rounded-xl border-2 border-neutro-200 px-3 py-2.5 text-sm font-semibold focus:border-acento-500 focus:outline-none"
                />
                {telefonos.length === 0 && (
                  <p className="mt-1.5 text-[11px] text-neutro-500">
                    {sinReconocer?.length > 0
                      ? `En Alegra este cliente tiene anotado "${sinReconocer.join('", "')}", que no es un número de 8 dígitos.`
                      : 'Este cliente no tiene teléfono en Alegra.'}
                  </p>
                )}
              </div>
            )}

            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows={8}
              aria-label="Mensaje"
              className="w-full rounded-2xl border-2 border-neutro-200 px-3 py-2.5 text-xs text-neutro-700 focus:border-acento-500 focus:outline-none"
            />

            {error && (
              <div className="flex items-start gap-2 bg-peligro-50 border border-peligro-200 rounded-2xl px-3 py-2.5">
                <AlertTriangle size={15} className="text-peligro-600 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-peligro-800">{error}</p>
              </div>
            )}

            <button
              type="button" onClick={enviar} disabled={enviando}
              className="w-full bg-exito-600 hover:bg-exito-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {enviando ? 'Enviando…' : `Enviar${escribiendo ? '' : ` al ${elegido?.formateado || ''}`}`}
            </button>

            {/* Fuera de martes/miércoles/jueves el servidor de WhatsApp duerme
                en Render y el primer envío lo despierta. Sin decirlo, el botón
                parece colgado. */}
            <p className="text-[11px] text-neutro-400 text-center">
              El primer envío del día puede tardar unos segundos.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
