import {
  ArrowLeft, FileText, Ban, Undo2, Loader2, Building2,
  PencilLine, Save, X, MessageCircle, Mail
} from 'lucide-react'
import Insignia from '../ui/Insignia'
import EtiquetaTipoFactura from './EtiquetaTipoFactura'
import ClienteFactura from './ClienteFactura'
import LineasFactura from './LineasFactura'
import TotalesFactura from './TotalesFactura'
import CobrosFactura from './CobrosFactura'
import NotasCreditoFactura from './NotasCreditoFactura'
import BotonEmitirFactura from './BotonEmitirFactura'
import PanelEmisionFactura from './PanelEmisionFactura'
import { CELDA } from './estilosFactura'
import { colones } from '../../utils/colones'
import { fechaCorta } from '../../utils/fechaCR'
import { useAuth } from '../../contexts/AuthContext'
import { puedeAccion } from '../../utils/modulos'
import { estadoDeFactura, notasDeFactura } from '../../utils/notaCreditoTexto'
import { medio, filaDe, totalesDe, reservaFiscalDe, porQueNoSeEdita } from '../../utils/facturaVista'
import useEmisionFactura from '../../hooks/useEmisionFactura'
import useEdicionFactura from '../../hooks/useEdicionFactura'

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
 *
 * CÓMO ESTÁ PARTIDA (2026-10-11; llegó a 790 líneas con todo adentro). Este
 * archivo arma la pantalla; cada parte vive donde dice el molde del proyecto:
 *   · las cuentas y las reglas, en utils/facturaVista.js;
 *   · la copia que se edita, en hooks/useEdicionFactura.js;
 *   · la emisión electrónica, en hooks/useEmisionFactura.js;
 *   · cada sección en su componente: ClienteFactura, LineasFactura,
 *     TotalesFactura, CobrosFactura, NotasCreditoFactura.
 */

/**
 * Saldo en cero no es "Pagada": una factura acreditada entera por una nota
 * de crédito no la pagó nadie (ver utils/notaCreditoTexto.js).
 */
function Estado({ f }) {
  const e = estadoDeFactura(f, colones)
  return <Insignia tono={e.tono}>{e.texto}</Insignia>
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

export default function VistaFactura({
  factura, empresa, editando, productos = [], clientes = [],
  onVolver, onPdf, onPdfNota, onAnular, onNotaCredito, onEditar, onEnviar, onCorreo, cargandoCorreo,
  onGuardar, onCancelarEdicion, abriendoPdf, onFiscalCambio, onAnularCobro
}) {
  const f = factura
  const emisor = empresa || {}
  const { usuario } = useAuth()
  const puedeAnular = puedeAccion(usuario, 'anular-factura')
  const puedeAnularCobro = Boolean(onAnularCobro) && puedeAccion(usuario, 'anular-cobro')
  // La emisión electrónica de ESTA factura: el botón de la barra y el panel
  // de avance comparten este estado. Una histórica de Alegra ya fue emitida
  // allá; una anulada o un borrador no se emiten.
  const emision = useEmisionFactura(f.id, {
    activo: !f.historica && f.estado === 'emitida',
    onCambio: onFiscalCambio
  })
  const direccionEmisor = [emisor.provincia, emisor.canton, emisor.distrito, emisor.barrio, emisor.otras_senas]
    .filter(Boolean).join(' ')

  // La copia de trabajo mientras se corrige: estado y acciones.
  const edicion = useEdicionFactura({ factura: f, editando, clientes, productos, onGuardar })

  const reservaFiscal = reservaFiscalDe(emision.estado?.comprobante)
  const razonNoEditable = porQueNoSeEdita(f, { reservaFiscal, emitiendo: Boolean(emision.fase) })

  // En edición manda la copia de trabajo; si no, el documento guardado.
  const filas = editando ? edicion.lineas : f.lineas.map(filaDe)
  const totales = totalesDe(f, filas, editando)

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
                onClick={edicion.guardar}
                disabled={edicion.guardando}
                className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {edicion.guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Guardar cambios
              </button>
            </>
          ) : (
            <>
              <button onClick={() => onPdf(f.id)} className="btn btn-outline flex items-center gap-2">
                {abriendoPdf === f.id ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                Ver PDF
              </button>

              {/* Mandarle la factura al cliente con nuestro PDF. Una anulada
                  no se manda: es un documento sin valor y mandarlo invita a
                  que lo paguen. */}
              {f.estado !== 'anulada' && (
                <button onClick={() => onEnviar(f)} className="btn btn-outline flex items-center gap-2 text-exito-700">
                  <MessageCircle size={16} /> WhatsApp
                </button>
              )}

              {f.estado === 'emitida' && onCorreo && (
                <button onClick={() => onCorreo(f)} disabled={cargandoCorreo} className="btn btn-outline flex items-center gap-2 disabled:opacity-50">
                  {cargandoCorreo ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} Correo
                </button>
              )}

              <button
                onClick={onEditar}
                disabled={Boolean(razonNoEditable)}
                title={razonNoEditable || 'Corregir esta factura'}
                className="btn btn-outline flex items-center gap-2 disabled:opacity-40"
              >
                <PencilLine size={16} /> Editar factura
              </button>

              {/* Un clic firma, envía y consulta; el avance se ve en el
                  panel de abajo. El estado aceptado viene siempre de la
                  consulta autenticada ante Hacienda. */}
              <BotonEmitirFactura emision={emision} />

              {f.estado === 'emitida' && (
                <>
                  <button onClick={() => onNotaCredito(f)} className="btn btn-outline flex items-center gap-2 text-nota-700">
                    <Undo2 size={16} /> Nota de crédito
                  </button>
                  {/* Anular es de administradores (decisión del usuario,
                      2026-10-03). El servidor lo hace valer; acá solo no se
                      ofrece un botón que va a responder que no. */}
                  {puedeAnular && (
                    <button onClick={() => onAnular(f)} className="btn btn-outline flex items-center gap-2 text-peligro-600">
                      <Ban size={16} /> Anular
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {edicion.error && <p className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{edicion.error}</p>}

      {!editando && razonNoEditable && f.estado === 'emitida' && (
        <p className="rounded-xl bg-neutro-100 px-3 py-2 text-sm text-neutro-600">
          <strong>No se puede editar:</strong> {razonNoEditable}
        </p>
      )}

      {!editando && <PanelEmisionFactura emision={emision} />}

      {/* Las notas de crédito van ARRIBA del documento: dicen qué le pasó a
          la factura, y abajo —donde estaban— nadie las veía. */}
      {!editando && (
        <NotasCreditoFactura factura={f} onCambio={onFiscalCambio} onPdf={onPdfNota} abriendoPdf={abriendoPdf} />
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
              <EtiquetaTipoFactura electronica={f.electronica} tipoDocumento={f.fiscal?.tipo==='04'?'tiquete':f.tipoDocumento} />
            </div>
            <p className="mt-1 text-xl font-extrabold text-primario-600">{f.numero}</p>
            <div className="mt-1 flex sm:justify-end"><Estado f={f} /></div>
            {notasDeFactura(f, colones) && (
              <p className="mt-1 text-xs font-semibold text-nota-700">{notasDeFactura(f, colones)}</p>
            )}
            {/* Debajo y no al lado de la etiqueta: la clave tiene 50 dígitos y
                en la misma fila se le montaba encima. */}
            {f.fiscal && (
              <p className="mt-2 break-all text-xs text-neutro-600">
                Consecutivo fiscal: {f.fiscal.consecutivo}<br />Clave: {f.fiscal.clave}
              </p>
            )}
            <p className="mt-2 text-xs text-neutro-500">
              Creación: <strong className="text-neutro-700">{fechaCorta(f.fecha)}</strong>
            </p>
            {f.fechaVencimiento && (
              <p className="text-xs text-neutro-500">
                Vencimiento: <strong className="text-neutro-700">{fechaCorta(f.fechaVencimiento)}</strong>
              </p>
            )}
          </div>
        </div>

        {/* Cliente y condiciones */}
        <div className="grid gap-4 border-b border-neutro-100 bg-neutro-50/60 p-5 sm:grid-cols-2">
          <ClienteFactura factura={f} editando={editando} edicion={edicion} />

          <dl className="grid grid-cols-2 gap-3 sm:justify-items-end">
            <Dato etiqueta="Condición">{f.condicionVenta === 'credito' ? (f.plazo || 'Crédito') : 'Contado'}</Dato>
            <Dato etiqueta="Moneda">{f.moneda || 'CRC'}</Dato>
            <Dato etiqueta="Medio de pago">{medio(f.metodoPago)}</Dato>
            <Dato etiqueta="Vendedor">{f.vendedor}</Dato>
          </dl>
        </div>

        <LineasFactura filas={filas} editando={editando} edicion={edicion} totales={totales} />

        <TotalesFactura factura={f} editando={editando} totales={totales} />

        {/* Cobros y observaciones. Las notas de crédito ya no van acá: tienen
            su tarjeta arriba del documento. */}
        {(editando || f.cobros?.length > 0 || f.observaciones || f.motivoAnulacion) && (
          <div className="grid gap-4 border-t border-neutro-100 bg-neutro-50/60 p-5 sm:grid-cols-2">
            {!editando && f.cobros?.length > 0 && (
              <CobrosFactura
                cobros={f.cobros}
                puedeAnular={puedeAnularCobro && f.estado === 'emitida'}
                onAnularCobro={onAnularCobro}
              />
            )}

            {(editando || f.observaciones) && (
              <div className={editando ? '' : 'sm:col-span-2'}>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutro-400">Observaciones</p>
                {editando ? (
                  <textarea
                    rows={2} value={edicion.observaciones} onChange={(e) => edicion.setObservaciones(e.target.value)}
                    className={`${CELDA} w-full`}
                  />
                ) : (
                  <p className="text-sm text-neutro-700">{f.observaciones}</p>
                )}
              </div>
            )}

            {/* Solo en edición: dentro de seis meses, "por qué cambió esta
                factura" tiene que poder responderse. */}
            {editando && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutro-400">
                  ¿Por qué se corrige? (queda en la bitácora)
                </p>
                <input
                  value={edicion.motivo} onChange={(e) => edicion.setMotivo(e.target.value)}
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
