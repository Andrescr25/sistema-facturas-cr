import { Phone, Send } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'

/** El servidor devuelve el teléfono y mensaje de la copia que se enviará.
 * Presentarlos sin edición evita mostrar una propuesta distinta del PDF preparado. */
export default function ModalEnviarProveedor({ revision, enviando, onConfirmar, onReintentar, onCerrar }) {
  return (
    <Modal titulo="Enviar PDF a WhatsApp" ancho="lg" onCerrar={onCerrar} pie={
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar} disabled={enviando} className="min-h-12">Cancelar</Boton>
        {revision.error ? (
          <Boton onClick={onReintentar} className="min-h-12">Reintentar revisión</Boton>
        ) : (
          <Boton icono={Send} onClick={onConfirmar} cargando={enviando} disabled={revision.cargando || !revision.destino} className="min-h-12">Confirmar envío</Boton>
        )}
      </div>
    }>
      <div className="space-y-4 p-5">
        <p className="font-bold text-neutro-900 break-words">{revision.nombre}</p>
        {revision.cargando && <p role="status" className="text-sm text-neutro-500">Preparando número y mensaje…</p>}
        {revision.error && <p role="alert" className="text-sm text-peligro-700">{revision.error}</p>}
        {revision.destino && <>
          <div className="rounded-2xl border border-neutro-200 bg-neutro-50 p-4">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-neutro-500">Número de WhatsApp</p>
            <p className="flex items-center gap-2 text-lg font-bold text-neutro-900"><Phone size={18} className="text-primario-600" />{revision.destino.telefono}</p>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutro-500">Mensaje predeterminado</p>
            <p className="whitespace-pre-wrap break-words rounded-2xl border border-neutro-200 p-4 text-sm leading-relaxed text-neutro-800">{revision.destino.mensaje}</p>
          </div>
        </>}
      </div>
    </Modal>
  )
}
