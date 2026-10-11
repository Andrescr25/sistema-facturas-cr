import { FileText, ShieldCheck } from 'lucide-react'

/**
 * Qué clase de documento es: factura de venta o factura electrónica.
 *
 * SON DOS COSAS DISTINTAS DEL ESTADO. "Pagada" o "Anulada" dicen cómo va la
 * factura; esta etiqueta dice si ya se emitió ante Hacienda. Una factura
 * puede estar pagada y no ser electrónica, o ser electrónica y estar anulada.
 * Mezclarlas en una sola insignia obliga a adivinar cuál de las dos se está
 * leyendo.
 *
 * De las 5.398 copiadas de Alegra, 531 son electrónicas y 4.867 no: la marca
 * ya venía en los datos, no hubo que deducirla del número.
 */
export default function EtiquetaTipoFactura({ electronica, tipoDocumento, tamano = 'normal' }) {
  const esTiquete = tipoDocumento === 'tiquete'
  const Icono = electronica ? ShieldCheck : FileText

  const texto = electronica
    ? (esTiquete ? 'Tiquete electrónico' : 'Factura electrónica')
    : (esTiquete ? 'Tiquete' : 'Factura de venta')

  const tono = electronica
    ? 'border-activo-200 bg-activo-50 text-activo-700 border-primario-200 bg-primario-50 text-primario-700'
    : 'border-neutro-200 bg-neutro-50 text-neutro-600'

  const medida = tamano === 'chico'
    ? 'px-2 py-0.5 text-[10px] gap-1'
    : 'px-2.5 py-1 text-[11px] gap-1.5'

  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border font-bold uppercase tracking-wide ${medida} ${tono}`}>
      <Icono size={tamano === 'chico' ? 11 : 12} className="shrink-0" />
      {texto}
    </span>
  )
}
