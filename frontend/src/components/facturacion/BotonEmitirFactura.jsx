import { ShieldCheck } from 'lucide-react'
import Boton from '../ui/Boton'
import { botonDe } from '../../utils/emisionPasos'

/**
 * "Emitir electrónicamente": UN clic firma, envía y consulta. Sin modal.
 *
 * El avance no se ve acá sino en PanelEmisionFactura, dentro de la misma
 * factura. Cuando el clic va al ambiente de pruebas el botón lo dice, para
 * que nadie crea que emitió una factura con validez.
 */
export default function BotonEmitirFactura({ emision, className = '' }) {
  if (!emision.activo) return null
  const boton = botonDe(emision)
  if (!boton) return null
  const { estado, fase } = emision
  return (
    <Boton variante="primario" icono={ShieldCheck} data-emitir-electronica className={className}
      onClick={() => emision.emitir()} cargando={Boolean(fase)} disabled={Boolean(boton.ocupado)}>
      {boton.texto}
      {estado?.ambiente === 'pruebas' && !estado.comprobante && !fase && (
        <span className="rounded-full bg-alerta-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-alerta-700">
          Pruebas
        </span>
      )}
    </Boton>
  )
}
