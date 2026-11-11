import { Phone, Send } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'

// Lo que pasó con el reenvío, en palabras.
const RESULTADOS = {
  enviado: { tono: 'bg-exito-50 text-exito-800', texto: (r) => `Listo: se le volvió a enviar al +${r.numero}.` },
  no_enviado: { tono: 'bg-peligro-50 text-peligro-700', texto: (r) => r.motivo },
  incierto: { tono: 'bg-alerta-50 text-alerta-800', texto: (r) => r.motivo }
}

/**
 * Volver a enviar una orden ya enviada (2026-11-11): las mismas cantidades,
 * con o sin los códigos/nombres del proveedor en el PDF. La orden no cambia.
 */
export default function ModalReenviarOrden({ proveedor, reenvio }) {
  const r = reenvio.resultado
  const listo = Boolean(r)
  return (
    <Modal titulo="Volver a enviar la orden" ancho="lg" onCerrar={reenvio.cerrar} pie={
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={reenvio.cerrar} disabled={reenvio.enviando} className="min-h-12">{listo ? 'Cerrar' : 'Cancelar'}</Boton>
        {!listo && (
          <Boton icono={Send} onClick={reenvio.reenviar} cargando={reenvio.enviando} disabled={reenvio.cargando || !reenvio.telefono.trim()} className="min-h-12">
            Volver a enviar
          </Boton>
        )}
      </div>
    }>
      <div className="space-y-4 p-5">
        <p className="font-bold text-neutro-900 break-words">{proveedor.nombre}</p>
        <p className="text-sm text-neutro-600">Las mismas cantidades que ya se enviaron. La orden no cambia.</p>
        {reenvio.cargando && <p role="status" className="text-sm text-neutro-500">Preparando número y mensaje…</p>}

        <label className="flex items-start gap-3 rounded-2xl border border-neutro-200 bg-neutro-50 p-4 text-sm text-neutro-700">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={reenvio.conCodigos} disabled={reenvio.enviando || listo}
            onChange={(e) => reenvio.setConCodigos(e.target.checked)} />
          <span>
            <span className="block font-semibold text-neutro-900">Usar códigos/nombres propios del proveedor en el PDF</span>
            {reenvio.conCodigos ? 'Sale con los códigos y nombres del proveedor.' : 'Sale con nuestros códigos y nombres.'}
          </span>
        </label>

        <div className="space-y-3 rounded-2xl border border-neutro-200 bg-neutro-50 p-4">
          {reenvio.telefonos.length > 1 && (
            <div>
              <label htmlFor="reenvio-registrado" className="mb-1 block text-xs font-bold text-neutro-600">Números registrados</label>
              <select id="reenvio-registrado" className="input min-h-12 w-full rounded-xl border border-neutro-300"
                value={reenvio.telefonos.some(t => t.formateado === reenvio.telefono) ? reenvio.telefono : ''}
                onChange={(e) => reenvio.setTelefono(e.target.value)} disabled={reenvio.enviando || listo}>
                <option value="">Elegí un número o escribí otro</option>
                {reenvio.telefonos.map(t => <option key={t.formateado} value={t.formateado}>+506 {t.formateado}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="reenvio-telefono" className="mb-1 flex items-center gap-2 text-xs font-bold text-neutro-600"><Phone size={16} />Número para este envío</label>
            <input id="reenvio-telefono" type="tel" value={reenvio.telefono} placeholder="8827 2453" maxLength={30}
              onChange={(e) => reenvio.setTelefono(e.target.value)} disabled={reenvio.enviando || listo}
              className="input min-h-12 w-full rounded-xl border border-neutro-300 text-lg font-bold text-neutro-900" />
          </div>
        </div>

        {reenvio.mensaje && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutro-500">Mensaje</p>
            <p className="whitespace-pre-wrap break-words rounded-2xl border border-neutro-200 p-4 text-sm text-neutro-800">{reenvio.mensaje}</p>
          </div>
        )}

        {reenvio.error && <p role="alert" className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{reenvio.error}</p>}
        {r && <p role="status" className={`rounded-xl px-3 py-2 text-sm font-semibold ${RESULTADOS[r.estado].tono}`}>{RESULTADOS[r.estado].texto(r)}</p>}
      </div>
    </Modal>
  )
}
