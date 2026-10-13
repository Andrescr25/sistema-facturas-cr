import { ShieldCheck, Upload, Loader2 } from 'lucide-react'
import useAceptacionCompra from '../../hooks/useAceptacionCompra'
import BotonEmitirFactura from '../facturacion/BotonEmitirFactura'
import PanelEmisionFactura from '../facturacion/PanelEmisionFactura'
import { aceptacionDeCompra, declaradoDe } from '../../utils/aceptacionCompraTexto'
import { formatCurrency } from '../../utils/pagos'

/**
 * Cómo quedó esta compra ante Hacienda, dentro de la compra ya registrada.
 *
 * QUÉ REEMPLAZA (2026-10-12). Acá había un botón «Respuesta a Hacienda» que
 * abría un formulario: ambiente (en pruebas por omisión), respuesta, detalle,
 * condición del IVA, IVA a acreditar, gasto aplicable, y después tres botones
 * en orden. El usuario pidió que «se haga solo» al registrar la compra,
 * «siempre como totalmente aceptada y ya en producción». La aceptación sale
 * sola; esto la MUESTRA —firmada, enviada, respuesta de Hacienda— y deja
 * terminarla con un clic si no salió.
 *
 * Los textos se deciden en utils/aceptacionCompraTexto.js y todo lo que
 * habla con el servidor está en hooks/useAceptacionCompra.js.
 */

const TONO = {
  exito: 'border-exito-200 bg-exito-50',
  alerta: 'border-alerta-200 bg-alerta-50',
  peligro: 'border-peligro-200 bg-peligro-50'
}

export default function AceptacionCompra({ factura }) {
  const { emision, subirXml, subiendo, errorXml } = useAceptacionCompra(factura.id)
  const { estado } = emision
  const cabecera = aceptacionDeCompra(estado)
  if (!cabecera) return null
  const declarado = declaradoDe(estado, formatCurrency)

  return (
    <section data-aceptacion-compra className="mt-4 flex flex-col gap-3">
      <div className={`rounded-2xl border p-4 ${TONO[cabecera.tono]}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldCheck size={20} className="mt-0.5 shrink-0 text-primario-600" />
            <div className="min-w-0">
              <p data-aceptacion-titulo className="font-bold text-neutro-900">{cabecera.titulo}</p>
              <p className="mt-1 break-words text-sm text-neutro-600">{cabecera.detalle}</p>
              {declarado && <p data-aceptacion-declarado className="mt-1 text-sm text-neutro-700">Se declaró: {declarado}.</p>}
            </div>
          </div>
          {/* Con algo por arreglar antes (el XML, la condición del IVA) el
              botón no puede hacer nada: lo que falta ya está dicho arriba. */}
          {!estado.motivoNoEmitible && <BotonEmitirFactura emision={emision} />}
        </div>

        {/* Sin el XML del proveedor no se arma la aceptación: la clave, el
            total y el impuesto salen de ese archivo. */}
        {estado.necesitaXml && (
          <label className="mt-3 flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold text-neutro-700">
            <span className="btn btn-outline btn-sm inline-flex items-center gap-1.5">
              {subiendo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Subir el XML del proveedor
            </span>
            <input
              type="file"
              accept=".xml"
              data-xml-proveedor
              disabled={subiendo}
              className="sr-only"
              onChange={(e) => { subirXml(e.target.files?.[0]); e.target.value = '' }}
            />
            <span className="font-normal text-neutro-500">Es el archivo .xml que mandó el proveedor con su factura.</span>
          </label>
        )}
        {errorXml && <p role="alert" className="mt-2 text-sm text-peligro-700">{errorXml}</p>}
      </div>

      <PanelEmisionFactura emision={emision} />
    </section>
  )
}
