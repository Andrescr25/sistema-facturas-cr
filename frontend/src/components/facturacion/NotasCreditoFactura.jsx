import { Undo2 } from 'lucide-react'
import Insignia from '../ui/Insignia'
import { colones } from '../../utils/colones'
import {
  motivoDeNota, efectoDeNota, inventarioDeNota, aplicadaA, haciendaDeNota
} from '../../utils/notaCreditoTexto'
import useEmisionFactura from '../../integrations/hacienda/useEmisionFactura'
import BotonEmitirFactura from '../../integrations/hacienda/BotonEmitirFactura'
import PanelEmisionFactura from '../../integrations/hacienda/PanelEmisionFactura'

/**
 * Las notas de crédito de una factura, con lo que hizo cada una.
 *
 * POR QUÉ SON TARJETAS ARRIBA Y NO UN RENGLÓN ABAJO (2026-10-11). Eran una
 * línea gris al pie del documento —«número · fecha · motivo ₡monto»— y un
 * botón que abría el modal de Hacienda. El usuario hizo una y contó: «no
 * avisó nada y solo me salió la factura como pagada». Pidió saber «si se
 * aplicó, si anuló el documento o qué pasó» y «si la nota es aplicada a una
 * factura electrónica o una de venta normal».
 *
 * Cada tarjeta contesta eso en tres recuadros —qué hizo, a qué documento se
 * aplicó, cómo va ante Hacienda— y, si la factura es electrónica, emite la
 * nota con el mismo botón de un clic y los mismos pasos que la factura.
 * Los textos se deciden en utils/notaCreditoTexto.js.
 */

const fecha = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '—')

const TONO = {
  exito: 'border-exito-200 bg-exito-50',
  alerta: 'border-alerta-200 bg-alerta-50',
  peligro: 'border-peligro-200 bg-peligro-50',
  nota: 'border-nota-200 bg-nota-50',
  neutro: 'border-neutro-200 bg-neutro-50'
}

function Recuadro({ etiqueta, tono = 'neutro', titulo, detalle, children, dato }) {
  return (
    <div data-recuadro={dato} className={`rounded-xl border p-3 ${TONO[tono] || TONO.neutro}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutro-500">{etiqueta}</p>
      <p className="mt-0.5 break-words text-sm font-bold text-neutro-900">{titulo}</p>
      {detalle && <p className="mt-0.5 break-words text-xs text-neutro-600">{detalle}</p>}
      {children}
    </div>
  )
}

function TarjetaNota({ nota: n, factura: f, onCambio }) {
  // Una nota anulada o hecha en Alegra no se emite desde acá: no se le
  // pregunta nada al servidor.
  const emision = useEmisionFactura(n.id, {
    origen: 'nota_credito',
    activo: n.estado !== 'anulada' && !n.historica,
    onCambio
  })
  const efecto = efectoDeNota(n, f, colones)
  const inventario = inventarioDeNota(n)
  const destino = aplicadaA(f)
  const hacienda = haciendaDeNota(n, f, emision.estado)
  const enCurso = Boolean(emision.estado?.comprobante || emision.fase || emision.pidiendoDatos || emision.error)

  return (
    <article data-nota-credito={n.id} className="card rounded-2xl border-l-4 border-l-nota-400 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-nota-700">
            <Undo2 size={14} /> Nota de crédito
          </p>
          <p className="text-lg font-extrabold text-neutro-900">{n.numero}</p>
          <p className="text-sm text-neutro-600">
            {fecha(n.fecha)} · {motivoDeNota(n.motivo)}{n.motivoTexto ? ` — «${n.motivoTexto}»` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-xl font-extrabold ${n.estado === 'anulada' ? 'text-neutro-400 line-through' : 'text-nota-700'}`}>
            {colones(n.monto)}
          </p>
          <div className="mt-1 flex justify-end">
            {n.estado === 'anulada'
              ? <Insignia tono="peligro">Anulada</Insignia>
              : <Insignia tono="nota">Aplicada</Insignia>}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Recuadro dato="efecto" etiqueta="Qué hizo" tono={efecto.tono} titulo={efecto.titulo}
          detalle={[efecto.detalle, inventario].filter(Boolean).join(' ')} />
        <Recuadro dato="destino" etiqueta="Se aplicó a" tono={destino.electronica ? 'exito' : 'neutro'}
          titulo={destino.tipo} detalle={`${destino.numero} · ${destino.nota}`} />
        {hacienda && (
          <Recuadro dato="hacienda" etiqueta="Ante Hacienda" tono={hacienda.tono} titulo={hacienda.titulo} detalle={hacienda.detalle}>
            {hacienda.emitible && !enCurso && (
              <div className="mt-2"><BotonEmitirFactura emision={emision} /></div>
            )}
          </Recuadro>
        )}
      </div>

      {/* El avance de la emisión, con los mismos pasos que la factura. Si
          quedó a medias o fue rechazada, el botón para seguir va con él. */}
      {enCurso && (
        <div className="mt-3 flex flex-col gap-2">
          <PanelEmisionFactura emision={emision} incrustado />
          <div><BotonEmitirFactura emision={emision} /></div>
        </div>
      )}
    </article>
  )
}

export default function NotasCreditoFactura({ factura, onCambio }) {
  if (!factura.notasCredito?.length) return null
  return (
    <section data-notas-credito className="flex flex-col gap-3">
      {factura.notasCredito.map(n => (
        <TarjetaNota key={n.id} nota={n} factura={factura} onCambio={onCambio} />
      ))}
    </section>
  )
}
