import { useRef, useState } from 'react'
import { FileText, Loader2, Mail } from 'lucide-react'
import Modal from '../ui/Modal'

/** La dirección se confirma aquí; el PDF y el remitente los arma el servidor. */
export default function ModalEnviarFacturaCorreo({ datos, onEnviar, onCerrar }) {
  const [para, setPara] = useState(datos.para || '')
  const [asunto, setAsunto] = useState(`Factura ${datos.numero}`)
  const [mensaje, setMensaje] = useState(`Adjuntamos la factura ${datos.numero}. Gracias por su compra.`)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [aceptado, setAceptado] = useState(false)
  const enCurso = useRef(false)
  const cerrar = () => { if (!enCurso.current) onCerrar() }

  const enviar = async (e) => {
    e.preventDefault()
    if (enCurso.current || aceptado || !datos.configurado || datos.bloqueado) return
    enCurso.current = true
    setEnviando(true)
    setError('')
    try {
      await onEnviar({ para: para.trim(), asunto: asunto.trim(), mensaje: mensaje.trim() })
      setAceptado(true)
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo confirmar el envío. Revisá los enviados antes de reintentar.')
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={`Enviar factura ${datos.numero} por correo`} onCerrar={cerrar} ancho="lg">
      <form onSubmit={enviar} className="flex flex-col gap-4 p-5">
        <p className="text-sm text-neutro-600">Desde: <strong>{datos.remitente || 'Sin configurar'}</strong></p>
        <label className="flex flex-col gap-1 text-sm font-semibold text-neutro-700">
          Correo del destinatario
          <input type="email" required maxLength={160} value={para} onChange={e => setPara(e.target.value)}
            className="input w-full font-normal" disabled={enviando || aceptado} autoFocus />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-neutro-700">
          Asunto
          <input required maxLength={200} value={asunto} onChange={e => setAsunto(e.target.value)}
            className="input w-full font-normal" disabled={enviando || aceptado} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-neutro-700">
          Mensaje
          <textarea required maxLength={4000} rows={4} value={mensaje} onChange={e => setMensaje(e.target.value)}
            className="input w-full font-normal" disabled={enviando || aceptado} />
        </label>
        <p className="flex items-center gap-2 rounded-xl bg-neutro-50 p-3 text-sm text-neutro-600">
          <FileText size={18} /> PDF adjunto de la factura {datos.numero}
        </p>
        {!datos.configurado && <p role="status" className="text-sm text-alerta-700">El envío de correo todavía no está configurado.</p>}
        {datos.bloqueado && <p role="status" className="text-sm text-alerta-700">El envío está bloqueado en esta copia de pruebas.</p>}
        {error && <p role="alert" className="rounded-xl bg-peligro-50 p-3 text-sm text-peligro-700">{error}</p>}
        {aceptado && <p role="status" className="rounded-xl bg-exito-50 p-3 text-sm text-exito-700">Correo aceptado por el servidor de envío. La recepción depende del buzón del destinatario.</p>}
        <div className="flex gap-2">
          <button type="button" onClick={cerrar} disabled={enviando} className="btn btn-outline flex-1 disabled:opacity-50">
            {aceptado ? 'Cerrar' : 'Cancelar'}
          </button>
          {!aceptado && <button type="submit" disabled={enviando || !datos.configurado || datos.bloqueado}
            className="btn btn-primary flex flex-1 items-center justify-center gap-2 disabled:opacity-50">
            {enviando ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />} Enviar correo
          </button>}
        </div>
      </form>
    </Modal>
  )
}
