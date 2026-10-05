import { useEffect, useState } from 'react'
import { Copy, Check, Loader2 } from 'lucide-react'
import HojaModal from '../pagos/HojaModal'
import Boton from '../ui/Boton'
import ModalEnviarWhatsApp from '../whatsapp/ModalEnviarWhatsApp'
import { textoCiclo } from '../SelectorCiclo'
import api from '../../services/api'

/** Preparar no envía: número y mensaje se revisan en el modal compartido. */
export default function ModalPreventa({ clienteId, cicloId, onCerrar }) {
  const [datos, setDatos] = useState(null), [error, setError] = useState('')
  const [invitacion, setInvitacion] = useState(null), [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState(false), [enviando, setEnviando] = useState(false)
  const base = `/portal-clientes/clientes/${clienteId}/preventa`
  useEffect(() => {
    let vigente = true
    api.get(base, { params: { cicloId } }).then(r => { if (vigente) setDatos(r.data.data) })
      .catch(e => { if (vigente) setError(e.response?.data?.message || 'No se pudo preparar el catálogo.') })
    return () => { vigente = false }
  }, [base, cicloId])
  const enlace = datos ? `${window.location.origin}${invitacion ? `/portal/activar/${invitacion.token}` : '/catalogo'}?preventa=${encodeURIComponent(datos.token)}` : ''
  const listo = datos && (!datos.requiereInvitacion || invitacion)
  const invitar = async () => {
    setOcupado(true); setError('')
    try { setInvitacion((await api.post(`${base}/invitacion`, { cicloId })).data.data); setCopiado(false) }
    catch (e) { setError(e.response?.data?.message || 'No se pudo preparar la invitación.') }
    finally { setOcupado(false) }
  }
  if (enviando) return <ModalEnviarWhatsApp titulo={`Catálogo para ${datos.cliente}`} subtitulo={textoCiclo(datos.ciclo)}
    telefonos={datos.telefonos} telefonosSinReconocer={datos.telefonosSinReconocer}
    documento={{ tipo: 'preventa', referencia: `${cicloId}:${clienteId}` }}
    mensajeInicial={`Hola ${datos.cliente}. Ya podés preparar tu pedido para ${textoCiclo(datos.ciclo)}.\n${invitacion ? 'Creá tu usuario y contraseña con esta invitación (vence en 7 días).' : 'Entrá con tu cuenta para ver tus productos habituales y hacer el pedido.'}\n\n${enlace}`}
    onEnviar={async ({ telefono, mensaje }) => (await api.post(`${base}/whatsapp`, {
      cicloId, token: datos.token, invitacionToken: invitacion?.token, telefono, mensaje
    })).data.data} onCerrar={() => setEnviando(false)} />
  return <HojaModal titulo="Catálogo de preventa" onCerrar={onCerrar} ancho="sm:max-w-lg">
    <div className="space-y-4">
      {!datos && !error && <Loader2 className="animate-spin" aria-label="Preparando catálogo" />}
      {datos && <>
        <p className="font-bold">{datos.cliente}</p><p className="text-sm font-semibold text-primario-700">{textoCiclo(datos.ciclo)}</p>
        <p className="text-sm text-neutro-600">Al entrar verá sus productos habituales, ofertas y catálogo completo. El pedido conservará esta semana.</p>
        {datos.requiereInvitacion && !invitacion && <div className="space-y-3 rounded-xl bg-alerta-50 p-3">
          <p className="text-sm">Este cliente todavía necesita acceso al portal. Prepará su invitación antes de compartir el catálogo.</p>
          <Boton cargando={ocupado} onClick={invitar}>Preparar invitación de acceso</Boton>
        </div>}
        {invitacion && <p className="text-sm text-alerta-700">La invitación vence en {invitacion.diasVigencia} días y se usa una vez. Copiá o enviá este enlace antes de cerrar.</p>}
        {listo && <>
          <label className="block text-xs font-bold">Enlace para este cliente<textarea readOnly value={enlace} rows={3} aria-label="Enlace de preventa" className="input w-full mt-1 break-all text-xs" /></label>
          <div className="flex flex-wrap gap-2"><Boton variante="secundario" onClick={async () => {
            try { await navigator.clipboard.writeText(enlace); setCopiado(true) }
            catch { setError('Seleccioná el enlace y copialo manualmente; el navegador no permitió usar el portapapeles.') }
          }}>{copiado ? <Check size={16} /> : <Copy size={16} />}{copiado ? 'Copiado' : 'Copiar enlace'}</Boton>
            <Boton onClick={() => setEnviando(true)}>Revisar envío por WhatsApp</Boton></div>
        </>}
      </>}
      {error && <p role="alert" className="text-sm text-peligro-700">{error}</p>}
    </div>
  </HojaModal>
}
