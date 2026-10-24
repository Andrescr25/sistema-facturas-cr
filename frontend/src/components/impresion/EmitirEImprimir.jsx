import { useEffect, useRef } from 'react'
import { Check, Mail, Printer, Receipt } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import useEmisionFactura from '../../hooks/useEmisionFactura'
import BotonEmitirFactura from '../facturacion/BotonEmitirFactura'
import PanelEmisionFactura from '../facturacion/PanelEmisionFactura'

/**
 * «Imprimir y emitir» (2026-10-20), después de que Impresión guardó la
 * factura: los faltantes ya se rebajaron y los precios ya se ajustaron.
 *
 * Al abrirse emite sola —el clic ya fue «Imprimir y emitir»— con los mismos
 * pasos, el mismo panel y las mismas preguntas que Facturación (el motivo de
 * un descuento, con qué paga el cliente): no hay una segunda forma de emitir.
 * Cuando Hacienda la acepta, el correo al cliente sale solo y el botón
 * imprime el PDF, que ahí ya dice «Factura electrónica» con su clave. Se
 * imprime con un clic aparte porque el navegador bloquea una pestaña que se
 * abre sola segundos después del clic.
 *
 * Si no se puede emitir ahora (Hacienda no contesta, la rechazó, falta un
 * dato), igual se puede imprimir y emitirla después desde Facturación.
 * Mientras se emite no se cierra: cortar a medio camino deja un comprobante
 * firmado sin enviar.
 *
 * `factura.comoTiquete` (2026-10-24): el cliente no tiene correo, así que sale
 * TIQUETE electrónico, sin dirigirlo a nadie, y se entrega impreso: no hay a
 * dónde mandar nada. Es el mismo camino y el mismo panel; el servidor elige el
 * tipo por el correo (unClic.service.js, `tipoDeFactura`) y acá solo cambia lo
 * que el modal promete (nada de «le llega a …»).
 */
export default function EmitirEImprimir({ factura, onImprimir, onCerrar }) {
  const comoTiquete = Boolean(factura.comoTiquete)
  const emision = useEmisionFactura(factura.factura_id)
  const arranco = useRef(false)
  useEffect(() => {
    if (arranco.current || !emision.estado) return
    arranco.current = true
    emision.emitir()
  }, [emision.estado]) // eslint-disable-line react-hooks/exhaustive-deps

  const c = emision.estado?.comprobante
  const aceptada = c?.estado === 'aceptada'
  const ocupado = Boolean(emision.fase) || (!emision.estado && !emision.error)
  const enProduccion = (c?.ambiente || emision.estado?.ambiente) === 'produccion'
  const cerrar = ocupado ? () => {} : onCerrar
  const imprimir = () => { onImprimir(factura); onCerrar() }

  const pie = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
      <Boton variante="secundario" tamano="lg" onClick={onCerrar} disabled={ocupado}>{aceptada ? 'Listo' : 'Cerrar'}</Boton>
      {aceptada ? (
        <Boton tamano="lg" icono={Printer} data-imprimir-emitida onClick={imprimir}>
          {enProduccion ? (comoTiquete ? 'Imprimir tiquete electrónico' : 'Imprimir factura electrónica') : 'Imprimir'}
        </Boton>
      ) : !ocupado && (
        <>
          <Boton variante="acento" tamano="lg" icono={Printer} data-imprimir-sin-emitir onClick={imprimir}>Imprimir sin emitir</Boton>
          {!emision.pidiendoDatos && <BotonEmitirFactura emision={emision} className="min-h-12" />}
        </>
      )}
    </div>
  )

  return (
    <Modal onCerrar={cerrar} titulo={`Imprimir y emitir${comoTiquete ? ' como tiquete' : ''} · ${factura.numero_factura}`} ancho="xl" pie={pie}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3 rounded-2xl border border-primario-100 bg-primario-50/60 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primario-600 ring-1 ring-primario-100">
            {comoTiquete ? <Receipt size={18} /> : <Mail size={18} />}
          </span>
          <div className="min-w-0">
            <p className="break-words font-bold text-neutro-900">{factura.cliente_nombre}</p>
            <p className="break-words text-xs text-neutro-600">
              {comoTiquete
                ? 'Sin correo: sale como tiquete electrónico, sin dirigirlo a nadie, y se le entrega impreso'
                : `Cuando Hacienda la acepte, le llega a ${factura.cliente_email}`}
            </p>
          </div>
        </div>

        <p data-ajustes-guardados className="flex items-center gap-2 text-sm font-semibold text-exito-700">
          <Check size={16} strokeWidth={3} className="shrink-0" />
          {factura.categoria === 'sin_pendientes'
            ? 'Marcada impresa: Bodega la despachó completa, sin ajustes.'
            : 'Ajustes guardados: faltantes rebajados y precios al día.'}
        </p>

        {!emision.estado && !emision.error && (
          <p role="status" className="text-sm text-neutro-500">Preparando la emisión…</p>
        )}
        <PanelEmisionFactura emision={emision} incrustado angosto />

        {!aceptada && !ocupado && (
          <p className="text-xs text-neutro-500">
            Si no se puede emitir ahora, imprimila igual: se emite después desde Facturación.
          </p>
        )}
      </div>
    </Modal>
  )
}
