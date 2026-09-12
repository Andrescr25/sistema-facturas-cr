import { ArrowLeft, FileText, Ban, Undo2, Loader2, Building2 } from 'lucide-react'
import Insignia from '../ui/Insignia'
import { colones, colonesExacto } from '../../utils/colones'

/**
 * Una factura, en su propia pantalla.
 *
 * POR QUÉ NO ES UN DESPLEGABLE
 * Antes el detalle se abría dentro de la fila de la lista. Con veinte líneas
 * eso empuja las demás facturas fuera de la pantalla y obliga a recorrer todo
 * para volver a ver el listado. Un documento es un documento: se entra a él.
 *
 * SIGUE LA MISMA ESTRUCTURA QUE EL PDF a propósito —emisor, documento,
 * cliente, líneas, totales—, así lo que se ve en pantalla es lo que sale
 * impreso y nadie tiene que traducir mentalmente de una vista a la otra.
 */

const fecha = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '—')

const MEDIOS = {
  cash: 'Efectivo', transfer: 'Transferencia', 'credit-card': 'Tarjeta de crédito',
  'debit-card': 'Tarjeta de débito', check: 'Cheque', sinpe_movil: 'SINPE Móvil'
}
const medio = (v) => {
  if (!v) return null
  const k = String(v).trim().toLowerCase()
  return MEDIOS[k] || String(v).charAt(0).toUpperCase() + String(v).slice(1).toLowerCase()
}

function Estado({ f }) {
  if (f.estado === 'anulada') return <Insignia tono="peligro">Anulada</Insignia>
  if (f.estado === 'borrador') return <Insignia tono="neutro">Borrador</Insignia>
  if (f.saldo > 0) return <Insignia tono="alerta">Debe {colones(f.saldo)}</Insignia>
  return <Insignia tono="exito">Pagada</Insignia>
}

/** Etiqueta arriba, valor abajo: se lee de un vistazo sin buscar los dos puntos. */
function Dato({ etiqueta, children }) {
  if (!children) return null
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-neutro-400">{etiqueta}</dt>
      <dd className="text-sm text-neutro-800">{children}</dd>
    </div>
  )
}

export default function VistaFactura({ factura, empresa, onVolver, onPdf, onAnular, onNotaCredito, abriendoPdf }) {
  const f = factura
  const emisor = empresa || {}
  const direccionEmisor = [emisor.provincia, emisor.canton, emisor.distrito, emisor.barrio, emisor.otras_senas]
    .filter(Boolean).join(' ')

  // El impuesto desglosado por tarifa, igual que en el papel: acá se vende al
  // 1 %, 2 %, 4 % y 13 % en la misma factura y una sola línea de "IVA" lo
  // esconde.
  const porTarifa = [...f.lineas.reduce((m, l) => {
    const t = Number(l.tarifa) || 0
    return m.set(t, (m.get(t) || 0) + (Number(l.impuestoMonto) || 0))
  }, new Map())].filter(([, monto]) => monto > 0).sort((a, b) => a[0] - b[0])

  const importe = (l) => l.cantidad * l.precioUnitario * (1 - (l.descuentoPorcentaje || 0) / 100)
  const hayDescuento = f.lineas.some(l => (l.descuentoMonto || 0) > 0)

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- Barra de acciones ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onVolver} className="btn btn-outline flex items-center gap-2">
          <ArrowLeft size={16} /> Volver
        </button>

        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={() => onPdf(f.id)} className="btn btn-outline flex items-center gap-2">
            {abriendoPdf === f.id ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            Ver PDF
          </button>
          {f.estado === 'emitida' && (
            <>
              <button onClick={() => onNotaCredito(f)} className="btn btn-outline flex items-center gap-2 text-nota-700">
                <Undo2 size={16} /> Nota de crédito
              </button>
              <button onClick={() => onAnular(f)} className="btn btn-outline flex items-center gap-2 text-peligro-600">
                <Ban size={16} /> Anular
              </button>
            </>
          )}
        </div>
      </div>

      {/* ---------- El documento ---------- */}
      <div className="card overflow-hidden rounded-2xl">
        {/* Emisor y documento */}
        <div className="flex flex-col gap-4 border-b border-neutro-100 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="shrink-0 text-naranja-500 text-primario-600" />
              <span className="font-bold text-neutro-900">{emisor.nombre || 'Distribuidora Tachi'}</span>
            </div>
            <div className="mt-1 space-y-0.5 text-xs text-neutro-500">
              {emisor.identificacion && (
                <p>{emisor.tipo_identificacion === 'CJ' ? 'Cédula jurídica' : 'Cédula física'} {emisor.identificacion}</p>
              )}
              {direccionEmisor && <p>{direccionEmisor}</p>}
              <p>{[emisor.correo, emisor.telefono].filter(Boolean).join(' · ')}</p>
              {emisor.actividad_economica && (
                <p>
                  <span className="font-semibold">Actividad económica:</span>{' '}
                  {emisor.actividad_economica}
                  {emisor.actividad_economica_nombre ? ` - ${emisor.actividad_economica_nombre}` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0 sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutro-400">
              {f.tipoDocumento === 'tiquete' ? 'Tiquete' : 'Factura de venta'}
            </p>
            <p className="text-xl font-extrabold text-primario-600">{f.numero}</p>
            <div className="mt-1 flex sm:justify-end"><Estado f={f} /></div>
            <p className="mt-2 text-xs text-neutro-500">
              Creación: <strong className="text-neutro-700">{fecha(f.fecha)}</strong>
            </p>
            {f.fechaVencimiento && (
              <p className="text-xs text-neutro-500">
                Vencimiento: <strong className="text-neutro-700">{fecha(f.fechaVencimiento)}</strong>
              </p>
            )}
          </div>
        </div>

        {/* Cliente y condiciones */}
        <div className="grid gap-4 border-b border-neutro-100 bg-neutro-50/60 p-5 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutro-400">Señor(es)</p>
            <p className="text-lg font-bold text-neutro-900">{f.cliente.nombre}</p>
            <div className="mt-1 space-y-0.5 text-sm text-neutro-600">
              {f.cliente.identificacion && (
                <p>{f.cliente.tipoIdentificacion === 'CJ' ? 'Cédula jurídica' : 'Cédula física'}: {f.cliente.identificacion}</p>
              )}
              {f.cliente.telefono && <p>Teléfono: {f.cliente.telefono}</p>}
              {f.cliente.direccion && <p>Dirección: {f.cliente.direccion}</p>}
              {f.cliente.correo && <p>Email: {f.cliente.correo}</p>}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:justify-items-end">
            <Dato etiqueta="Condición">{f.condicionVenta === 'credito' ? (f.plazo || 'Crédito') : 'Contado'}</Dato>
            <Dato etiqueta="Moneda">{f.moneda || 'CRC'}</Dato>
            <Dato etiqueta="Medio de pago">{medio(f.metodoPago)}</Dato>
            <Dato etiqueta="Vendedor">{f.vendedor}</Dato>
          </dl>
        </div>

        {/* Líneas */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-neutro-200 bg-neutro-50 text-left text-[10px] uppercase tracking-wider text-neutro-500">
                <th className="px-4 py-2 font-semibold">Producto / servicio</th>
                <th className="px-2 py-2 text-center font-semibold">Cant.</th>
                <th className="px-2 py-2 text-right font-semibold">Precio unit.</th>
                {hayDescuento && <th className="px-2 py-2 text-right font-semibold">Descuento</th>}
                <th className="px-2 py-2 text-right font-semibold">Impuesto</th>
                <th className="px-4 py-2 text-right font-semibold">Total línea</th>
              </tr>
            </thead>
            <tbody>
              {f.lineas.map((l) => (
                <tr key={l.numeroLinea} className="border-b border-neutro-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-neutro-800">{l.nombre}</p>
                    <p className="text-[11px] text-neutro-400">
                      {[l.referencia && `Ref: ${l.referencia}`, l.cabys && `CAByS: ${l.cabys}`].filter(Boolean).join('   ')}
                    </p>
                  </td>
                  <td className="px-2 py-2.5 text-center font-semibold text-neutro-800">{l.cantidad}</td>
                  <td className="px-2 py-2.5 text-right text-neutro-600">{colonesExacto(l.precioUnitario)}</td>
                  {hayDescuento && (
                    <td className="px-2 py-2.5 text-right text-alerta-600">
                      {l.descuentoMonto > 0 ? `−${colones(l.descuentoMonto)}` : '—'}
                    </td>
                  )}
                  <td className="px-2 py-2.5 text-right text-neutro-600">
                    {colones(l.impuestoMonto)}
                    <span className="ml-1 text-[11px] text-neutro-400">{l.tarifa}%</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-neutro-900">{colones(importe(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div className="flex justify-end border-t border-neutro-100 p-5">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-neutro-600">
              <span>Subtotal</span><span className="font-medium text-neutro-800">{colones(f.subtotal)}</span>
            </div>
            {f.descuento > 0 && (
              <div className="flex justify-between text-alerta-600">
                <span>Descuento</span><span className="font-medium">−{colones(f.descuento)}</span>
              </div>
            )}
            {porTarifa.map(([tarifa, monto]) => (
              <div key={tarifa} className="flex justify-between text-neutro-600">
                <span>IVA {tarifa}%</span><span className="font-medium text-neutro-800">{colones(monto)}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between border-t-2 border-neutro-200 pt-2">
              <span className="font-bold text-neutro-900">Total</span>
              <span className="text-xl font-extrabold text-primario-600">{colones(f.total)}</span>
            </div>
            {(f.cobrado > 0 || f.acreditado > 0) && (
              <>
                {f.cobrado > 0 && (
                  <div className="flex justify-between text-exito-700">
                    <span>Pagado</span><span className="font-medium">−{colones(f.cobrado)}</span>
                  </div>
                )}
                {f.acreditado > 0 && (
                  <div className="flex justify-between text-nota-700">
                    <span>Nota de crédito</span><span className="font-medium">−{colones(f.acreditado)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-neutro-200 pt-1.5 font-bold text-neutro-900">
                  <span>Saldo</span><span>{colones(f.saldo)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Cobros, notas y observaciones */}
        {(f.cobros?.length > 0 || f.notasCredito?.length > 0 || f.observaciones || f.motivoAnulacion) && (
          <div className="grid gap-4 border-t border-neutro-100 bg-neutro-50/60 p-5 sm:grid-cols-2">
            {f.cobros?.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutro-400">Cobros</p>
                <div className="flex flex-col gap-1">
                  {f.cobros.map(c => (
                    <div key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-neutro-600">{fecha(c.fecha)} · {medio(c.metodo) || 'sin método'}</span>
                      {c.referencia && <span className="text-xs text-neutro-400">ref. {c.referencia}</span>}
                      <span className="font-semibold text-neutro-800">{colones(c.monto)}</span>
                      {/* Marcado, no escondido: el cliente va a preguntar por
                          ese cobro y tiene que haber rastro. */}
                      {c.anulado && <Insignia tono="peligro">Anulado</Insignia>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {f.notasCredito?.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutro-400">Notas de crédito</p>
                <div className="flex flex-col gap-1">
                  {f.notasCredito.map(n => (
                    <div key={n.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-neutro-600">{n.numero} · {fecha(n.fecha)} · {n.motivo || 'sin motivo'}</span>
                      <span className="font-semibold text-nota-700">{colones(n.monto)}</span>
                      {n.estado === 'anulada' && <Insignia tono="peligro">Anulada</Insignia>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {f.observaciones && (
              <div className="sm:col-span-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutro-400">Observaciones</p>
                <p className="text-sm text-neutro-700">{f.observaciones}</p>
              </div>
            )}

            {f.motivoAnulacion && (
              <p className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700 sm:col-span-2">
                <strong>Anulada:</strong> {f.motivoAnulacion}
              </p>
            )}
          </div>
        )}

        {/* Términos de pago: por dónde le pagan a la empresa */}
        {emisor.terminos_pago && (
          <div className="border-t border-neutro-100 p-5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutro-400">
              Términos y condiciones
            </p>
            <p className="whitespace-pre-line text-sm text-neutro-600">{emisor.terminos_pago}</p>
          </div>
        )}
      </div>
    </div>
  )
}
