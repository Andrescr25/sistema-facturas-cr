import { Phone, Send } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'

/** Cambiar destino exige revisar otra copia antes de confirmar. El teléfono
 * elegido aquí sólo corresponde a este envío; la ficha se edita aparte. */
export default function ModalEnviarProveedor({ revision, enviando, onConfirmar, onReintentar, onCambiarTelefono, onCerrar }) {
  const requiereRevision = revision.requiereRevision || revision.error
  const telefonos = revision.telefonos || []
  return (
    <Modal titulo="Enviar PDF a WhatsApp" ancho="lg" onCerrar={onCerrar} pie={
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar} disabled={enviando} className="min-h-12">Cancelar</Boton>
        {requiereRevision ? (
          <Boton onClick={onReintentar} cargando={revision.cargando} disabled={enviando} className="min-h-12">
            {revision.requiereRevision ? 'Revisar número' : 'Reintentar revisión'}
          </Boton>
        ) : (
          <Boton icono={Send} onClick={onConfirmar} cargando={enviando} disabled={revision.cargando || !revision.destino} className="min-h-12">Confirmar envío</Boton>
        )}
      </div>
    }>
      <div className="space-y-4 p-5">
        <p className="font-bold text-neutro-900 break-words">{revision.nombre}</p>
        {revision.cargando && <p role="status" className="text-sm text-neutro-500">Preparando número y mensaje…</p>}
        {revision.error && <p role="alert" className="text-sm text-peligro-700">{revision.error}</p>}
        <div className="space-y-3 rounded-2xl border border-neutro-200 bg-neutro-50 p-4">
          {telefonos.length > 1 && <div>
            <label htmlFor="envio-proveedor-registrado" className="mb-1 block text-xs font-bold text-neutro-600">Números registrados</label>
            <select id="envio-proveedor-registrado" className="input min-h-12 w-full rounded-xl border border-neutro-300"
              value={telefonos.some(t => t.numero === revision.telefono) ? revision.telefono : ''}
              onChange={e => onCambiarTelefono(e.target.value)} disabled={enviando}>
              <option value="">Elegí un número o escribí otro</option>
              {telefonos.map(t => <option key={t.numero} value={t.numero}>+506 {t.formateado}</option>)}
            </select>
          </div>}
          <div>
            <label htmlFor="envio-proveedor-telefono" className="mb-1 flex items-center gap-2 text-xs font-bold text-neutro-600"><Phone size={16} />Número para este envío</label>
            <input id="envio-proveedor-telefono" type="tel" value={revision.telefono || ''} placeholder="8827 2453"
              onChange={e => onCambiarTelefono(e.target.value)} disabled={enviando} maxLength={30}
              className="input min-h-12 w-full rounded-xl border border-neutro-300 text-lg font-bold text-neutro-900" />
          </div>
          <p className="text-xs text-neutro-500">Para registrar números, editá la ficha del proveedor.</p>
          {revision.destino?.telefono && !revision.requiereRevision && <p className="text-xs font-semibold text-exito-700">Se enviará a: +{revision.destino.telefono}</p>}
        </div>
        {revision.mensaje && <>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutro-500">Mensaje predeterminado</p>
            <p className="whitespace-pre-wrap break-words rounded-2xl border border-neutro-200 p-4 text-sm leading-relaxed text-neutro-800">{revision.mensaje}</p>
          </div>
        </>}
      </div>
    </Modal>
  )
}
