import { useEffect, useState } from 'react'
import { Copy, Check, Loader2, FileText, Download } from 'lucide-react'
import HojaModal from '../pagos/HojaModal'
import Boton from '../ui/Boton'
import ModalEnviarWhatsApp from '../whatsapp/ModalEnviarWhatsApp'
import { textoCiclo } from '../SelectorCiclo'
import api from '../../services/api'

async function mensajeError(e, defecto) {
  const cuerpo = e.response?.data
  if (cuerpo instanceof Blob) {
    try { return JSON.parse(await cuerpo.text()).message || defecto } catch { return defecto }
  }
  return cuerpo?.message || defecto
}

/** Preparar guarda una copia privada. El envío adjunta esa misma copia revisada. */
export default function ModalPreventa({ clienteId, cicloId, onCerrar }) {
  const [datos, setDatos] = useState(null), [error, setError] = useState('')
  const [invitacion, setInvitacion] = useState(null), [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState(false), [enviando, setEnviando] = useState(false)
  const [alcance, setAlcance] = useState('completo'), [pdf, setPdf] = useState(null)
  const [urlPdf, setUrlPdf] = useState('')
  const base = `/portal-clientes/clientes/${clienteId}/preventa`
  useEffect(() => {
    let vigente = true
    api.get(base, { params: { cicloId } }).then(r => { if (vigente) setDatos(r.data.data) })
      .catch(e => { if (vigente) setError(e.response?.data?.message || 'No se pudo preparar el catálogo.') })
    return () => { vigente = false }
  }, [base, cicloId])
  // Revocar al reemplazar o cerrar: ningún archivo personal queda en una URL pública.
  useEffect(() => () => { if (urlPdf) URL.revokeObjectURL(urlPdf) }, [urlPdf])
  const enlace = datos ? `${window.location.origin}${invitacion ? `/portal/activar/${invitacion.token}` : '/catalogo'}?preventa=${encodeURIComponent(datos.token)}` : ''
  const invitar = async () => {
    setOcupado(true); setError('')
    try { setInvitacion((await api.post(`${base}/invitacion`, { cicloId })).data.data); setCopiado(false) }
    catch (e) { setError(await mensajeError(e, 'No se pudo preparar la invitación.')) }
    finally { setOcupado(false) }
  }
  const prepararPdf = async () => {
    setOcupado(true); setError(''); setPdf(null); setUrlPdf('')
    try {
      const documento = (await api.post(`${base}/pdf`, { cicloId, alcance })).data.data
      const archivo = await api.get(`${base}/pdf/${documento.id}`, { params: { cicloId }, responseType: 'blob' })
      setUrlPdf(URL.createObjectURL(archivo.data)); setPdf(documento)
    } catch (e) { setError(await mensajeError(e, 'No se pudo preparar el PDF.')) }
    finally { setOcupado(false) }
  }
  if (enviando) return <ModalEnviarWhatsApp titulo={`Catálogo para ${datos.cliente}`}
    subtitulo={`${textoCiclo(datos.ciclo)} · PDF adjunto: ${pdf.nombreArchivo} (${pdf.productos} productos)`}
    telefonos={datos.telefonos} telefonosSinReconocer={datos.telefonosSinReconocer}
    documento={{ tipo: 'preventa', referencia: `${cicloId}:${clienteId}` }}
    mensajeInicial={`Hola ${datos.cliente}. Te adjuntamos el catálogo para ${textoCiclo(datos.ciclo)}.\nPara pedir por WhatsApp, respondé con la referencia R${cicloId}-C${clienteId}, el código del producto y la cantidad (por ejemplo, P-123 × 3).\n\nTambién podés pedir en línea${invitacion ? ' creando tu cuenta con esta invitación (vence en 7 días)' : ' con tu cuenta'}:\n${enlace}`}
    onEnviar={async ({ telefono, mensaje }) => (await api.post(`${base}/whatsapp`, {
      cicloId, pdfId: pdf.id, token: datos.token, invitacionToken: invitacion?.token, telefono, mensaje
    })).data.data} onCerrar={() => setEnviando(false)} />
  return <HojaModal titulo="Catálogo de preventa" onCerrar={onCerrar} ancho="sm:max-w-lg">
    <div className="space-y-4">
      {!datos && !error && <Loader2 className="animate-spin" aria-label="Preparando catálogo" />}
      {datos && <>
        <p className="font-bold">{datos.cliente}</p><p className="text-sm font-semibold text-primario-700">{textoCiclo(datos.ciclo)}</p>
        <p className="text-sm text-neutro-600">Enviá el PDF y el enlace juntos. El cliente puede responder por WhatsApp con código y cantidad, o pedir en línea. Confirmá el pedido recibido por WhatsApp en Facturación con esta semana.</p>
        <div className="space-y-3 rounded-xl border border-neutro-200 p-3">
          <label className="block text-xs font-bold">Contenido del PDF
            <select aria-label="Contenido del PDF" className="input w-full mt-1" value={alcance} disabled={ocupado}
              onChange={e => { setAlcance(e.target.value); setPdf(null); setUrlPdf('') }}>
              <option value="completo">Catálogo completo, con sus habituales primero</option>
              <option value="seleccion">Selección: habituales, sugerencias y ofertas</option>
            </select>
          </label>
          <Boton variante="secundario" cargando={ocupado} onClick={prepararPdf}><FileText size={16} />{pdf ? 'Actualizar PDF' : 'Preparar PDF'}</Boton>
          {pdf && <>
            <p className="text-xs text-neutro-600">{pdf.productos} productos · {pdf.fotos} fotos · precios con IVA · {(pdf.bytes / 1024).toFixed(0)} KB</p>
            {pdf.sinFoto > 0 && <p className="text-xs text-alerta-700">{pdf.sinFoto} productos no tienen una imagen disponible; aparecen identificados en el PDF.</p>}
            {pdf.fallback && <p className="text-xs text-alerta-700">Todavía no hay una selección para este cliente; se incluyó el catálogo completo.</p>}
            <div className="flex flex-wrap gap-4 text-sm font-bold text-primario-700">
              <a href={urlPdf} target="_blank" rel="noopener noreferrer">Ver PDF</a>
              <a href={urlPdf} download={pdf.nombreArchivo} className="flex items-center gap-1"><Download size={16} />Descargar PDF</a>
            </div>
            <p className="text-xs text-neutro-500">Se enviará esta copia. Si cambiaron los precios, actualizá el PDF antes de enviarlo.</p>
          </>}
        </div>
        {datos.requiereInvitacion && !invitacion && <div className="space-y-3 rounded-xl bg-alerta-50 p-3">
          <p className="text-sm">Puede pedir por WhatsApp sin cuenta. Si también quiere comprar en línea, prepará una invitación de acceso.</p>
          <Boton variante="secundario" cargando={ocupado} onClick={invitar}>Preparar invitación de acceso</Boton>
        </div>}
        {invitacion && <div className="space-y-2">
          <p className="text-sm text-alerta-700">La invitación vence en {invitacion.diasVigencia} días y se usa una vez.</p>
          <button type="button" className="text-xs underline" disabled={ocupado} onClick={() => { setInvitacion(null); setCopiado(false) }}>Usar catálogo sin invitación</button>
        </div>}
        <label className="block text-xs font-bold">Enlace para este cliente<textarea readOnly value={enlace} rows={3} aria-label="Enlace de preventa" className="input w-full mt-1 break-all text-xs" /></label>
        <div className="flex flex-wrap gap-2"><Boton variante="secundario" onClick={async () => {
          try { await navigator.clipboard.writeText(enlace); setCopiado(true) }
          catch { setError('Seleccioná el enlace y copialo manualmente; el navegador no permitió usar el portapapeles.') }
        }}>{copiado ? <Check size={16} /> : <Copy size={16} />}{copiado ? 'Copiado' : 'Copiar enlace'}</Boton>
          <Boton disabled={!pdf || ocupado} onClick={() => setEnviando(true)}>Revisar envío por WhatsApp</Boton></div>
      </>}
      {error && <p role="alert" className="text-sm text-peligro-700">{error}</p>}
    </div>
  </HojaModal>
}
