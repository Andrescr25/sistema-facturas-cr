import { CheckCircle, AlertCircle, Edit, Printer, FileText, Mail, ShieldCheck, Receipt } from 'lucide-react'
import Boton from '../ui/Boton'
import { formatDate, seEmiteAlImprimir, seEmiteComoTiquete, DESPUES } from '../../utils/impresionUtils'

/**
 * Listado de facturas pendientes de impresión (con o sin cambios).
 * Extraído de Impresion.jsx.
 *
 * Las que tienen correo (y quien mira puede emitir) dicen a dónde se van y
 * suman «Imprimir y emitir»; las que NO tienen correo suman «Imprimir y emitir
 * como tiquete» (2026-10-24). En las que requieren ajustes, esos botones están
 * en la revisión, después de aplicarlos.
 */
export default function ListaFacturasPendientes({ facturas, procesando, puedeEmitir = false, onVerPDF, onProcesarSinCambios, onAbrirRevision }) {
  if (facturas.length === 0) {
    return (
      <div className="text-center py-12 bg-white border border-dashed rounded-3xl p-6 text-neutro-400">
        <CheckCircle className="mx-auto text-exito-500 mb-2" size={36} />
        <h3 className="font-semibold text-neutro-700">¡Todo al día!</h3>
        <p className="text-xs text-neutro-400">No hay facturas pendientes de revisión ni impresión.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {facturas.map((factura) => {
        const esSinPendientes = factura.categoria === 'sin_pendientes'
        const emitible = puedeEmitir && seEmiteAlImprimir(factura)
        const emitibleTiquete = puedeEmitir && seEmiteComoTiquete(factura)

        return (
          <div
            key={factura.reimpresion_id || factura.id}
            className="bg-white border border-neutro-100 rounded-3xl p-4 shadow-sm hover:border-primario-200 sm:p-6 transition space-y-4"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primario-600 bg-primario-50 px-2.5 py-0.5 rounded-full">
                    # {factura.numero_factura}
                  </span>
                  {esSinPendientes ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-exito-50 text-exito-700 border border-exito-100">
                      <CheckCircle size={12} />
                      Lista (Bodega)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-alerta-50 text-alerta-700 border border-alerta-100">
                      <AlertCircle size={12} className="animate-pulse" />
                      Requiere Ajustes
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-neutro-900">{factura.cliente_nombre}</h3>
                {/* Las que tienen correo se emiten en Impresión, después de los ajustes. */}
                {emitible && (
                  <p data-se-emite className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs font-semibold text-primario-700">
                    <Mail size={13} className="shrink-0" />
                    <span className="min-w-0 break-all">{factura.cliente_email}</span>
                    <span className="text-neutro-400">· se emite al imprimir</span>
                  </p>
                )}
                <p className="text-xs text-neutro-400">
                  Fecha emisión: {formatDate(factura.fecha_emision)}
                </p>
                {!esSinPendientes && (
                  <p className="text-xxs font-semibold text-alerta-700 bg-alerta-50 px-2 py-0.5 rounded border border-alerta-100 inline-block">
                    {factura.total_ajustes} ajuste{factura.total_ajustes !== 1 ? 's' : ''} detectado{factura.total_ajustes !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              <div className="text-left md:text-right shrink-0">
                <p className="text-2xl font-black text-neutro-800">
                  ₡{(factura.total || 0).toLocaleString('es-CR')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-neutro-50 pt-3 sm:flex sm:flex-wrap sm:justify-end">
              {esSinPendientes ? (
                <>
                  <Boton variante="acento" icono={FileText} onClick={() => onVerPDF(factura)}>Ver PDF</Boton>
                  <Boton variante="secundario" onClick={() => onProcesarSinCambios(factura, DESPUES.GUARDAR)} disabled={procesando}>
                    Marcar impresa
                  </Boton>
                  <Boton variante={emitible || emitibleTiquete ? 'secundario' : 'primario'} icono={Printer} className="col-span-2"
                    onClick={() => onProcesarSinCambios(factura, DESPUES.IMPRIMIR)} disabled={procesando}>
                    Imprimir y cerrar
                  </Boton>
                  {emitible && (
                    <Boton icono={ShieldCheck} className="col-span-2" onClick={() => onProcesarSinCambios(factura, DESPUES.EMITIR)} disabled={procesando}>
                      Imprimir y emitir
                    </Boton>
                  )}
                  {emitibleTiquete && (
                    <Boton icono={Receipt} className="col-span-2" onClick={() => onProcesarSinCambios(factura, DESPUES.EMITIR_TIQUETE)} disabled={procesando}>
                      Imprimir y emitir como tiquete
                    </Boton>
                  )}
                </>
              ) : (
                <Boton icono={Edit} className="col-span-2" onClick={() => onAbrirRevision(factura)}>Revisar y aplicar</Boton>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
