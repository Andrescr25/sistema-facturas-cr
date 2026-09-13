import { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft, FileText, Ban, Undo2, Loader2, Building2,
  PencilLine, ShieldCheck, Save, X, Trash2, Plus, Search
} from 'lucide-react'
import Insignia from '../ui/Insignia'
import EtiquetaTipoFactura from './EtiquetaTipoFactura'
import { colones, colonesExacto } from '../../utils/colones'

/**
 * Una factura, en su propia pantalla — y en el mismo lugar se corrige.
 *
 * POR QUÉ EL MODO EDICIÓN VIVE ACÁ Y NO EN OTRA PANTALLA
 * Editar en un formulario aparte obliga a comparar de memoria: uno cambia un
 * precio en una lista de campos y tiene que imaginarse cómo va a quedar el
 * documento. Acá los campos editables se vuelven inputs EN SU PROPIO LUGAR —
 * el nombre del cliente donde está el nombre, la cantidad en su columna—, así
 * que lo que se está tocando es el documento y no una representación suya.
 *
 * QUÉ SE PUEDE CAMBIAR Y QUÉ NO
 *   · Cliente, productos, cantidades, precios, descuentos y observaciones: sí.
 *   · El IMPUESTO no se escribe a mano: la tarifa sale del maestro del
 *     producto. Dejarla editable es el agujero por el que se facturaron
 *     productos al 1 % cobrando 13 %.
 *   · El número, la serie y la fecha tampoco: es el mismo documento con otro
 *     contenido, no otro papel.
 */

const fecha = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '—')
const num = (v) => Number(v) || 0

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

/** El input de una celda: mismo tamaño que el texto que reemplaza. */
const CELDA = 'w-full rounded-lg border border-primario-200 bg-primario-50/40 px-1.5 py-1 text-sm ' +
  'focus:border-primario-400 focus:outline-none focus:ring-1 focus:ring-primario-300'

export default function VistaFactura({
  factura, empresa, editando, productos = [], clientes = [],
  onVolver, onPdf, onAnular, onNotaCredito, onEditar, onGuardar, onCancelarEdicion, abriendoPdf
}) {
  const f = factura
  const emisor = empresa || {}
  const direccionEmisor = [emisor.provincia, emisor.canton, emisor.distrito, emisor.barrio, emisor.otras_senas]
    .filter(Boolean).join(' ')

  // ---- Lo que se está editando (copia de trabajo) ----
  const [lineas, setLineas] = useState([])
  const [cliente, setCliente] = useState(null)
  const [observaciones, setObservaciones] = useState('')
  const [motivo, setMotivo] = useState('')
  const [textoCliente, setTextoCliente] = useState(null)   // null = no se está buscando
  const [textoProducto, setTextoProducto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  // Al entrar a editar se copia el documento; al salir, lo copiado se
  // descarta. Cancelar no puede dejar nada a medias.
  useEffect(() => {
    if (!editando) return
    setLineas(f.lineas.map(l => ({
      productoId: l.productoId,
      nombre: l.nombre,
      referencia: l.referencia,
      cabys: l.cabys,
      cantidad: num(l.cantidad),
      precioUnitario: num(l.precioUnitario),
      descuentoPorcentaje: num(l.descuentoPorcentaje),
      tarifa: num(l.tarifa)
    })))
    setCliente({ ...f.cliente })
    setObservaciones(f.observaciones || '')
    setMotivo('')
    setTextoCliente(null)
    setTextoProducto('')
    setError('')
  }, [editando, f.id])

  const razonNoEditable =
    f.estado === 'anulada' ? 'Está anulada.'
    : f.estado !== 'emitida' ? 'Todavía es un borrador.'
    : f.electronica ? 'Ya se emitió electrónicamente: se corrige con una nota de crédito.'
    : f.cobrado > 0 ? 'Tiene un cobro aplicado: primero hay que revertirlo.'
    : f.acreditado > 0 ? 'Tiene una nota de crédito aplicada.'
    : null

  // En edición manda la copia de trabajo; si no, el documento guardado.
  const filas = editando ? lineas : f.lineas.map(l => ({
    productoId: l.productoId, nombre: l.nombre, referencia: l.referencia, cabys: l.cabys,
    cantidad: num(l.cantidad), precioUnitario: num(l.precioUnitario),
    descuentoPorcentaje: num(l.descuentoPorcentaje), tarifa: num(l.tarifa),
    impuestoMonto: num(l.impuestoMonto)
  }))

  const base = (l) => l.cantidad * l.precioUnitario * (1 - (l.descuentoPorcentaje || 0) / 100)
  const impuestoDe = (l) => (editando ? base(l) * l.tarifa / 100 : l.impuestoMonto)

  const subtotal = editando ? filas.reduce((s, l) => s + base(l), 0) : f.subtotal
  const impuesto = editando ? filas.reduce((s, l) => s + impuestoDe(l), 0) : f.impuesto
  const total = editando ? subtotal + impuesto : f.total

  const porTarifa = [...filas.reduce((m, l) => {
    const t = num(l.tarifa)
    return m.set(t, (m.get(t) || 0) + impuestoDe(l))
  }, new Map())].filter(([, monto]) => monto > 0).sort((a, b) => a[0] - b[0])

  const hayDescuento = filas.some(l => num(l.descuentoPorcentaje) > 0) || editando

  const clientesEncontrados = useMemo(() => {
    const t = (textoCliente || '').trim().toLowerCase()
    if (t.length < 2) return []
    return clientes.filter(c => `${c.name} ${c.identification || ''}`.toLowerCase().includes(t)).slice(0, 6)
  }, [textoCliente, clientes])

  const productosEncontrados = useMemo(() => {
    const t = textoProducto.trim().toLowerCase()
    if (t.length < 2) return []
    return productos.filter(p => `${p.name} ${p.reference || ''}`.toLowerCase().includes(t)).slice(0, 6)
  }, [textoProducto, productos])

  const cambiarLinea = (i, campo, valor) =>
    setLineas(lineas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)))

  const agregarProducto = (p) => {
    setLineas([...lineas, {
      productoId: p.productoId ?? p.id,
      nombre: p.name,
      referencia: p.reference,
      cabys: p.cabys,
      cantidad: 1,
      precioUnitario: num(p.price),
      descuentoPorcentaje: 0,
      // La tarifa viene del maestro, igual que al facturar.
      tarifa: p.tax?.length ? num(p.tax[0].percentage) : 0
    }])
    setTextoProducto('')
  }

  const guardar = async () => {
    setError('')
    if (lineas.length === 0) return setError('La factura no puede quedar sin líneas.')
    if (lineas.some(l => num(l.cantidad) <= 0)) return setError('Hay una línea con cantidad en cero.')

    setGuardando(true)
    try {
      await onGuardar({
        clienteId: cliente?.id,
        items: lineas.map(l => ({
          productoId: l.productoId,
          quantity: num(l.cantidad),
          price: num(l.precioUnitario),
          discount: num(l.descuentoPorcentaje)
        })),
        observaciones,
        motivo: motivo.trim() || null
      })
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo guardar la factura.')
      setGuardando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- Barra de acciones ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        {!editando ? (
          <button onClick={onVolver} className="btn btn-outline flex items-center gap-2">
            <ArrowLeft size={16} /> Volver
          </button>
        ) : (
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-alerta-600">Editando</p>
            <p className="truncate font-bold text-neutro-900">{f.numero}</p>
          </div>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          {editando ? (
            <>
              <button onClick={onCancelarEdicion} className="btn btn-outline flex items-center gap-2">
                <X size={16} /> Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Guardar cambios
              </button>
            </>
          ) : (
            <>
              <button onClick={() => onPdf(f.id)} className="btn btn-outline flex items-center gap-2">
                {abriendoPdf === f.id ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                Ver PDF
              </button>

              <button
                onClick={onEditar}
                disabled={Boolean(razonNoEditable)}
                title={razonNoEditable || 'Corregir esta factura'}
                className="btn btn-outline flex items-center gap-2 disabled:opacity-40"
              >
                <PencilLine size={16} /> Editar factura
              </button>

              {/* La emisión ante Hacienda está pospuesta: el botón queda a la
                  vista para que se sepa que ese paso existe, pero apagado. Uno
                  que dijera haber emitido sin emitir sería peor que no tenerlo. */}
              {!f.electronica && f.estado === 'emitida' && (
                <button
                  disabled
                  title="La emisión ante Hacienda todavía no está habilitada"
                  className="btn btn-outline flex items-center gap-2 opacity-40"
                >
                  <ShieldCheck size={16} /> Emitir electrónicamente
                </button>
              )}

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
            </>
          )}
        </div>
      </div>

      {error && <p className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}

      {!editando && razonNoEditable && f.estado === 'emitida' && (
        <p className="rounded-xl bg-neutro-100 px-3 py-2 text-sm text-neutro-600">
          <strong>No se puede editar:</strong> {razonNoEditable}
        </p>
      )}

      {/* ---------- El documento ---------- */}
      <div className={`card overflow-hidden rounded-2xl ${editando ? 'ring-2 ring-primario-200' : ''}`}>
        {/* Emisor y documento — no se editan desde acá: viven en Configuración */}
        <div className="flex flex-col gap-4 border-b border-neutro-100 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="shrink-0 text-primario-600" />
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
            <div className="flex sm:justify-end">
              <EtiquetaTipoFactura electronica={f.electronica} tipoDocumento={f.tipoDocumento} />
            </div>
            <p className="mt-1 text-xl font-extrabold text-primario-600">{f.numero}</p>
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

            {/* En edición, el nombre se vuelve un buscador EN SU LUGAR. */}
            {editando ? (
              <div className="mt-0.5">
                {textoCliente === null ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-neutro-900">{cliente?.nombre}</span>
                    <button
                      onClick={() => setTextoCliente('')}
                      className="text-xs font-semibold text-primario-600 hover:underline"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <div className="relative">
                      <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutro-400" />
                      <input
                        autoFocus
                        value={textoCliente}
                        onChange={(e) => setTextoCliente(e.target.value)}
                        placeholder="Nombre o cédula…"
                        className={`${CELDA} pl-8 text-lg font-bold`}
                      />
                    </div>
                    {clientesEncontrados.map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCliente({
                            id: c.id, nombre: c.name, identificacion: c.identification,
                            telefono: c.phonePrimary || c.mobile, direccion: null, correo: c.email
                          })
                          setTextoCliente(null)
                        }}
                        className="rounded-lg border border-neutro-200 bg-white px-2.5 py-1.5 text-left text-sm hover:border-primario-300"
                      >
                        <span className="font-semibold text-neutro-800">{c.name}</span>
                        {c.identification && <span className="ml-2 text-xs text-neutro-400">{c.identification}</span>}
                      </button>
                    ))}
                    <button onClick={() => setTextoCliente(null)} className="self-start text-xs text-neutro-500 hover:underline">
                      Dejar el que está
                    </button>
                  </div>
                )}
                <p className="mt-1 text-xs text-neutro-400">
                  La cédula, el teléfono y la dirección se copian de la ficha del cliente al guardar.
                </p>
              </div>
            ) : (
              <>
                <p className="text-lg font-bold text-neutro-900">{f.cliente.nombre}</p>
                <div className="mt-1 space-y-0.5 text-sm text-neutro-600">
                  {f.cliente.identificacion && (
                    <p>{f.cliente.tipoIdentificacion === 'CJ' ? 'Cédula jurídica' : 'Cédula física'}: {f.cliente.identificacion}</p>
                  )}
                  {f.cliente.telefono && <p>Teléfono: {f.cliente.telefono}</p>}
                  {f.cliente.direccion && <p>Dirección: {f.cliente.direccion}</p>}
                  {f.cliente.correo && <p>Email: {f.cliente.correo}</p>}
                </div>
              </>
            )}
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
                {editando && <th className="w-10 px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filas.map((l, i) => (
                <tr key={`${l.productoId}-${i}`} className="border-b border-neutro-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-neutro-800">{l.nombre}</p>
                    <p className="text-[11px] text-neutro-400">
                      {[l.referencia && `Ref: ${l.referencia}`, l.cabys && `CAByS: ${l.cabys}`].filter(Boolean).join('   ')}
                    </p>
                  </td>

                  <td className="px-2 py-2.5 text-center">
                    {editando ? (
                      <input
                        type="number" min="0" step="1" value={l.cantidad}
                        onChange={(e) => cambiarLinea(i, 'cantidad', e.target.value)}
                        className={`${CELDA} max-w-[4.5rem] text-center`}
                      />
                    ) : (
                      <span className="font-semibold text-neutro-800">{l.cantidad}</span>
                    )}
                  </td>

                  <td className="px-2 py-2.5 text-right">
                    {editando ? (
                      <input
                        type="number" min="0" step="0.01" value={l.precioUnitario}
                        onChange={(e) => cambiarLinea(i, 'precioUnitario', e.target.value)}
                        className={`${CELDA} max-w-[6.5rem] text-right`}
                      />
                    ) : (
                      <span className="text-neutro-600">{colonesExacto(l.precioUnitario)}</span>
                    )}
                  </td>

                  {hayDescuento && (
                    <td className="px-2 py-2.5 text-right">
                      {editando ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number" min="0" max="100" step="1" value={l.descuentoPorcentaje}
                            onChange={(e) => cambiarLinea(i, 'descuentoPorcentaje', e.target.value)}
                            className={`${CELDA} max-w-[3.5rem] text-right`}
                          />
                          <span className="text-xs text-neutro-400">%</span>
                        </div>
                      ) : (
                        <span className="text-alerta-600">
                          {num(l.descuentoPorcentaje) > 0 ? `−${l.descuentoPorcentaje}%` : '—'}
                        </span>
                      )}
                    </td>
                  )}

                  {/* El impuesto NO se escribe: sale del maestro del producto. */}
                  <td className="px-2 py-2.5 text-right text-neutro-600">
                    {colones(impuestoDe(l))}
                    <span className="ml-1 text-[11px] text-neutro-400">{l.tarifa}%</span>
                  </td>

                  <td className="px-4 py-2.5 text-right font-bold text-neutro-900">{colones(base(l))}</td>

                  {editando && (
                    <td className="px-2 py-2.5 text-right">
                      <button
                        onClick={() => setLineas(lineas.filter((_, j) => j !== i))}
                        className="rounded-lg p-1.5 text-neutro-400 hover:bg-peligro-50 hover:text-peligro-600"
                        title="Quitar esta línea"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {/* Agregar un producto: una fila más de la misma tabla */}
              {editando && (
                <tr className="border-t border-neutro-200 bg-primario-50/30">
                  <td colSpan={hayDescuento ? 7 : 6} className="px-4 py-2.5">
                    <div className="relative max-w-md">
                      <Plus size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutro-400" />
                      <input
                        value={textoProducto}
                        onChange={(e) => setTextoProducto(e.target.value)}
                        placeholder="Agregar un producto: nombre o código…"
                        className={`${CELDA} pl-8`}
                      />
                    </div>
                    {productosEncontrados.length > 0 && (
                      <div className="mt-1.5 flex max-w-md flex-col gap-1">
                        {productosEncontrados.map(p => (
                          <button
                            key={p.id}
                            onClick={() => agregarProducto(p)}
                            className="flex items-center justify-between rounded-lg border border-neutro-200 bg-white px-2.5 py-1.5 text-left text-sm hover:border-primario-300"
                          >
                            <span className="min-w-0 truncate font-semibold text-neutro-800">{p.name}</span>
                            <span className="ml-2 shrink-0 text-neutro-500">{colones(p.price)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div className="flex justify-end border-t border-neutro-100 p-5">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-neutro-600">
              <span>Subtotal</span><span className="font-medium text-neutro-800">{colones(subtotal)}</span>
            </div>
            {!editando && f.descuento > 0 && (
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
              <span className="text-xl font-extrabold text-primario-600">{colones(total)}</span>
            </div>
            {!editando && (f.cobrado > 0 || f.acreditado > 0) && (
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
        {(editando || f.cobros?.length > 0 || f.notasCredito?.length > 0 || f.observaciones || f.motivoAnulacion) && (
          <div className="grid gap-4 border-t border-neutro-100 bg-neutro-50/60 p-5 sm:grid-cols-2">
            {!editando && f.cobros?.length > 0 && (
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

            {!editando && f.notasCredito?.length > 0 && (
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

            <div className={editando ? '' : 'sm:col-span-2'}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutro-400">Observaciones</p>
              {editando ? (
                <textarea
                  rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                  className={`${CELDA} w-full`}
                />
              ) : (
                f.observaciones && <p className="text-sm text-neutro-700">{f.observaciones}</p>
              )}
            </div>

            {/* Solo en edición: dentro de seis meses, "por qué cambió esta
                factura" tiene que poder responderse. */}
            {editando && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutro-400">
                  ¿Por qué se corrige? (queda en la bitácora)
                </p>
                <input
                  value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Se facturó de más una unidad…"
                  className={`${CELDA} w-full`}
                />
              </div>
            )}

            {!editando && f.motivoAnulacion && (
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
