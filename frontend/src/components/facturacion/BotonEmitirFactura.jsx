import { ShieldCheck, Loader2 } from 'lucide-react'
import { botonDe } from '../../utils/emisionPasos'

/**
 * "Emitir electrónicamente": UN clic firma, envía y consulta. Sin modal.
 *
 * El avance no se ve acá sino en PanelEmisionFactura, dentro de la misma
 * factura. Cuando el clic va al ambiente de pruebas el botón lo dice, para
 * que nadie crea que emitió una factura con validez.
 */
export default function BotonEmitirFactura({ emision }) {
  if (!emision.activo) return null
  const boton = botonDe(emision)
  if (!boton) return null
  const { estado, fase } = emision
  return (
    <button
      type="button"
      data-emitir-electronica
      onClick={() => emision.emitir()}
      disabled={Boolean(boton.ocupado)}
      className="btn btn-outline flex items-center gap-2 disabled:opacity-60"
    >
      {fase ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
      {boton.texto}
      {estado?.ambiente === 'pruebas' && !estado.comprobante && !fase && (
        <span className="rounded-full bg-alerta-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-alerta-700">
          Pruebas
        </span>
      )}
    </button>
  )
}
