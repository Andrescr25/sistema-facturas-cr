import { ArrowLeft, Download, Upload, Wallet } from 'lucide-react'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import DatosGasto from './DatosGasto'
import RevisionFiscalGasto from './RevisionFiscalGasto'
import { categoriaGasto, pagoDelGasto, camposCambiadosGasto } from '../../utils/gastosOperativos'
import { fechaCorta } from '../../utils/fechaCR'
import { formatearMoneda } from '../../utils/moneda'

export default function DetalleGasto({ estado: e }) {
  const g = e.detalle
  if (e.abriendo || !g) return <div className="mx-auto max-w-5xl"><Boton variante="fantasma" onClick={e.volver}><ArrowLeft size={17} /> Volver a gastos</Boton><p className="py-12 text-center text-neutro-500">{e.abriendo ? 'Abriendo comprobante…' : 'No se pudo abrir el gasto.'}</p></div>
  const pago = pagoDelGasto(g)
  const resumen = g.originales?.resumen?.totales || {}
  const lineas = g.originales?.productos || []
  const dinero = n => formatearMoneda(n, g.moneda)
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Boton variante="fantasma" onClick={e.volver}><ArrowLeft size={17} /> Volver a gastos</Boton>
      <section className="rounded-2xl border border-neutro-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-sm text-neutro-500">{categoriaGasto(g.categoria)} · {fechaCorta(g.fecha_emision)}</p><h1 className="mt-1 break-words text-2xl font-extrabold text-neutro-900">{g.proveedor_nombre}</h1><p className="mt-1 break-all text-sm text-neutro-500">Factura {g.numero_consecutivo}</p></div><p className="text-3xl font-extrabold text-neutro-900">{dinero(g.total_factura)}</p></div>
        <div className="mt-4 flex flex-wrap gap-2"><Insignia tono={pago.tono}>{pago.texto}</Insignia><Insignia tono={g.validacion === 'validado' ? 'exito' : 'alerta'}>{g.validacion === 'validado' ? 'XML validado localmente' : 'Comprobante por revisar'}</Insignia></div>
        {g.motivo_validacion && <div className="mt-4 space-y-2 rounded-xl bg-alerta-50 p-3 text-sm text-alerta-800"><p>{g.motivo_validacion}</p><Boton variante="secundario" onClick={e.revalidar} disabled={Boolean(e.ocupado)}>Reintentar validación</Boton></div>}
        {!g.tiene_xml && <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-primario-700"><Upload size={16} /> Adjuntar XML original<input type="file" accept=".xml" className="sr-only" aria-label="Adjuntar XML original" disabled={Boolean(e.ocupado)} onChange={ev => { e.adjuntarXml(ev.target.files?.[0]); ev.target.value = '' }} /></label>}
        <div className="mt-4 flex flex-wrap gap-2"><Boton variante="secundario" onClick={() => e.descargar('xml')} disabled={!g.tiene_xml || Boolean(e.ocupado)}><Download size={16} /> XML original</Boton>{g.tiene_pdf ? <Boton variante="secundario" onClick={() => e.descargar('pdf')} disabled={Boolean(e.ocupado)}><Download size={16} /> PDF del proveedor</Boton> : <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-neutro-100 px-4 py-2 text-sm font-bold text-neutro-800"><Upload size={16} /> Adjuntar PDF<input aria-label="Adjuntar PDF del proveedor" type="file" className="sr-only" accept=".pdf,application/pdf" disabled={Boolean(e.ocupado)} onChange={ev => { e.adjuntarPdf(ev.target.files?.[0]); ev.target.value = '' }} /></label>}</div>
        <details className="mt-4 text-sm text-neutro-500"><summary className="cursor-pointer">Datos del comprobante</summary><p className="mt-2 break-all">Clave: {g.clave}</p><p>Subtotal: {dinero(resumen.venta)} · descuentos: {dinero(resumen.descuentos)} · impuestos: {dinero(resumen.impuesto)}</p><p className="mt-1">La validación local comprueba estructura e identidad. La recepción no confirma aceptación del comprobante por Hacienda.</p></details>
      </section>
      <DatosGasto key={`datos-${g.id}-${g.version}`} gasto={g} ocupado={e.ocupado} onGuardar={e.guardar} />
      <section className="rounded-2xl border border-neutro-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-neutro-900">Pago</h2><p className="mt-1 text-sm text-neutro-500">Saldo pendiente: {g.compra_id ? dinero(g.saldo) : 'por validar'}</p></div>{g.compra_id && Number(g.saldo) > 0 && <Boton variante="exito" disabled={Boolean(e.ocupado) || g.moneda !== 'CRC'} onClick={() => e.setModalPago(true)}><Wallet size={17} /> Registrar pago</Boton>}</div>
        <p className="mt-3 text-sm text-neutro-500">Se registra en Caja General y en Pago Proveedores. Recibir una factura no significa que se haya pagado.</p>
        {g.pagos.length > 0 && <ul className="mt-3 divide-y divide-neutro-100">{g.pagos.map(p => <li key={p.id} className={`py-2 text-sm ${p.anulado ? 'text-neutro-400 line-through' : 'text-neutro-700'}`}>{fechaCorta(p.fecha)} · {p.metodo} · {dinero(p.monto)}{p.referencia ? ` · ${p.referencia}` : ''}{p.anulado ? ' · Anulado' : ''}</li>)}</ul>}
      </section>
      <RevisionFiscalGasto key={g.id} gasto={g} fiscal={e.fiscal} ocupado={e.ocupado} onGuardar={e.guardar} onResponder={e.responderFiscal} />
      <details className="rounded-2xl border border-neutro-200 bg-white p-5"><summary className="cursor-pointer font-bold text-neutro-900">Detalle original · {lineas.length} líneas</summary><div className="mt-3 divide-y divide-neutro-100">{lineas.map((l, i) => <div key={i} className="flex justify-between gap-4 py-3 text-sm"><div className="min-w-0"><p className="break-words font-semibold text-neutro-800">{l.descripcion}</p><p className="mt-1 text-neutro-500">{l.cantidad} {l.unidadMedida} · {dinero(l.precioUnitario)} por unidad</p><p className="text-xs text-neutro-400">Descuentos {dinero(l.descuento?.monto)} · impuestos {dinero(l.impuesto?.monto)}</p></div><span className="shrink-0 font-bold text-neutro-800">{dinero(l.montoTotalLinea)}</span></div>)}</div><p className="mt-3 text-xs text-neutro-500">Detalle documental del proveedor, sin productos ni movimientos de inventario.</p></details>
      <details className="rounded-2xl border border-neutro-200 bg-white p-5"><summary className="cursor-pointer font-bold text-neutro-900">Historial de cambios</summary><ul className="mt-3 space-y-3">{g.historial.map(h => <li key={h.id} className="text-sm text-neutro-600"><p>{fechaCorta(h.creado_en)} · {h.usuario || 'Recepción automática'} · {h.accion === 'editar' ? 'Datos actualizados' : h.accion === 'crear' ? 'Gasto registrado' : h.accion === 'adjuntar_pdf' ? 'PDF conservado' : 'Validación revisada'}</p>{h.motivo && <p className="text-xs text-neutro-500">{h.motivo}</p>}{h.cambios && <p className="text-xs text-neutro-400">{camposCambiadosGasto(h.cambios)}</p>}</li>)}</ul></details>
    </div>
  )
}
