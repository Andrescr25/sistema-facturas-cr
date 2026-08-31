import { MessageCircle } from 'lucide-react'
import { useModal } from '../../hooks/useModal'

/**
 * Modal para enviar la orden de compra por WhatsApp: teléfono destino y
 * mensaje adicional. Extraído de ReporteProveedores.jsx.
 */
export default function ModalWhatsApp({
  telefonoProveedor,
  setTelefonoProveedor,
  mensajeWhatsApp,
  setMensajeWhatsApp,
  loading,
  onEnviar,
  onCerrar
}) {
  useModal(onCerrar)
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fade-in-up">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
        <div className="bg-exito-500 p-6 text-center">
          <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"><MessageCircle className="text-white" size={32} /></div>
          <h2 className="text-xl font-bold text-white mb-1">Enviar PDF por WhatsApp</h2>
        </div>
        <div className="p-6 pb-2">
          <label className="block text-sm font-semibold text-neutro-700 mb-2">Destino / Contacto</label>
          <input type="tel" value={telefonoProveedor} onChange={e => setTelefonoProveedor(e.target.value)} placeholder="Ej: +506 8888 8888" className="w-full px-4 py-3 border border-neutro-300 rounded-xl focus:ring-2 focus:ring-primario-500 outline-none text-lg text-center font-medium placeholder-neutro-400 mb-4" />

          <label className="block text-sm font-semibold text-neutro-700 mb-2">Mensaje Adicional</label>
          <textarea value={mensajeWhatsApp} onChange={e => setMensajeWhatsApp(e.target.value)} placeholder="Escribe el mensaje..." rows={3} className="w-full px-4 py-3 border border-neutro-300 rounded-xl focus:ring-2 focus:ring-primario-500 outline-none text-sm placeholder-neutro-400 resize-none font-normal" />

          <p className="text-xs text-center text-neutro-500 mt-3 px-2 leading-relaxed">Se generará el archivo con la orden de compra y se enviará de fondo con el mensaje redactado.</p>
        </div>
        <div className="p-6 grid grid-cols-2 gap-3">
          <button onClick={onCerrar} className="py-3 px-4 bg-neutro-100 hover:bg-neutro-200 text-neutro-800 font-semibold rounded-xl transition text-sm">Cancelar</button>
          <button onClick={onEnviar} disabled={!telefonoProveedor || loading} className="py-3 px-4 bg-exito-500 hover:bg-primario-800 disabled:opacity-50 text-white font-semibold rounded-xl transition text-sm flex items-center justify-center shadow-md shadow-exito-500/30">
            {loading ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
