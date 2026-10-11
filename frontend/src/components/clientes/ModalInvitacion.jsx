import { useState } from 'react'
import { X, Copy, Check, AlertTriangle } from 'lucide-react'
import { useModal } from '../../hooks/useModal'
import { mensajeInvitacion } from '../../utils/mensajeInvitacion'
import ModalEnviarWhatsApp from '../whatsapp/ModalEnviarWhatsApp'
import api from '../../services/api'

/**
 * Muestra el enlace recién generado y deja mandarlo por WhatsApp.
 *
 * Se ve UNA sola vez: en la base queda solo el hash del token, igual que con
 * una contraseña. Por eso el aviso es explícito — si se cierra sin copiarlo,
 * hay que generar otro.
 *
 * El envío lo hace ModalEnviarWhatsApp, el mismo que usan la cotización, la
 * factura, el recordatorio de saldo y el aviso de pedido. Tener una sola
 * pantalla de envío no es prolijidad: la defensa contra mandarle un documento
 * del cliente a un desconocido es que el número esté a la vista antes de
 * apretar, y con cinco copias basta que una se quede atrás.
 */
export default function ModalInvitacion({ invitacion, onCerrar }) {
  useModal(onCerrar)
  const [copiado, setCopiado] = useState(false)
  const [mandando, setMandando] = useState(false)

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

  if (mandando) {
    return (
      <ModalEnviarWhatsApp
        titulo={`Mandarle el enlace a ${invitacion.cliente}`}
        subtitulo={`Vence en ${invitacion.diasVigencia} días`}
        telefonos={invitacion.telefonos || []}
        telefonosSinReconocer={invitacion.telefonosSinReconocer}
        mensajeInicial={mensajeInvitacion(invitacion.enlace)}
        onEnviar={async ({ telefono, mensaje }) => {
          const { data } = await api.post(
            `/portal-clientes/clientes/${invitacion.clienteId}/invitacion/whatsapp`,
            { telefono, mensaje }
          )
          return data.data
        }}
        onCerrar={() => setMandando(false)}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />

      <div className="relative bg-white w-full max-w-lg rounded-3xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-neutro-900">Enlace para {invitacion.cliente}</h2>
            <p className="text-xs text-neutro-500 mt-0.5">
              Vence en {invitacion.diasVigencia} días.
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar"
            className="p-1 text-neutro-400 hover:text-neutro-700 shrink-0"><X size={20} /></button>
        </div>

        <div className="bg-neutro-50 border border-neutro-200 rounded-2xl p-3 break-all text-xs font-mono text-neutro-700">
          {invitacion.enlace}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={copiar}
            className="bg-primario-800 hover:bg-primario-900 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            {copiado ? <Check size={16} /> : <Copy size={16} />}
            {copiado ? 'Copiado' : 'Copiar enlace'}
          </button>
          <button
            type="button"
            onClick={() => setMandando(true)}
            className="bg-exito-600 hover:bg-exito-700 text-white font-bold py-2.5 rounded-xl transition-colors"
          >
            Mandar por WhatsApp
          </button>
        </div>

        <div className="flex items-start gap-2 bg-alerta-50 border border-alerta-200 rounded-2xl px-3 py-2.5">
          <AlertTriangle size={15} className="text-alerta-600 shrink-0 mt-0.5" />
          <p className="text-xs text-alerta-800">
            Copialo ahora: no se vuelve a mostrar. Si lo perdés, generá otro — el anterior deja de servir.
          </p>
        </div>
      </div>
    </div>
  )
}
