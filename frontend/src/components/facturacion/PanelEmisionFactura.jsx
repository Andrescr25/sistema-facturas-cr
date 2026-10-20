import {
  ShieldCheck, Check, Loader2, Circle, X, AlertTriangle, Minus, Download, Mail
} from 'lucide-react'
import Insignia from '../ui/Insignia'
import Boton from '../ui/Boton'
import DatosPendientesEmision from './DatosPendientesEmision'
import { pasosDe, resumenDe, nombreDeTipo } from '../../utils/emisionPasos'

/**
 * Cómo va la factura electrónica, DENTRO de la factura. La nota de crédito
 * usa este mismo panel, con los mismos cuatro pasos (`incrustado`, dentro de
 * su tarjeta).
 *
 * QUÉ SE PIDIÓ (2026-10-11): «que en la misma factura, cuando le doy al
 * botón, me indique qué va pasando, si se envió, o si la aceptó Hacienda», y
 * que al cliente le llegue «el pdf con los 2 XML». Son cuatro renglones que
 * se van llenando solos: firmada, enviada, respuesta de Hacienda y correo al
 * cliente. Qué dice cada uno se decide en utils/emisionPasos.js, y todo lo
 * que habla con el servidor está en hooks/useEmisionFactura.js: este
 * componente solo dibuja.
 *
 * No aparece hasta que hay algo que contar (se tocó el botón o ya existe un
 * comprobante), y se queda: es donde después se bajan los XML o se le vuelve
 * a mandar al cliente.
 */

const PASO = {
  hecho: { caja: 'border-exito-200 bg-exito-50', icono: 'bg-exito-100 text-exito-700', Icono: Check },
  activo: { caja: 'border-primario-200 bg-primario-50', icono: 'bg-primario-100 text-primario-700', Icono: Loader2, gira: true },
  pendiente: { caja: 'border-neutro-200 bg-white', icono: 'bg-neutro-100 text-neutro-400', Icono: Circle, tenue: true },
  fallo: { caja: 'border-peligro-200 bg-peligro-50', icono: 'bg-peligro-100 text-peligro-700', Icono: X },
  aviso: { caja: 'border-alerta-200 bg-alerta-50', icono: 'bg-alerta-100 text-alerta-700', Icono: AlertTriangle },
  omitido: { caja: 'border-neutro-200 bg-neutro-50', icono: 'bg-neutro-100 text-neutro-500', Icono: Minus }
}

function Paso({ paso }) {
  const t = PASO[paso.estado] || PASO.pendiente
  return (
    <li data-paso={paso.clave} data-estado={paso.estado} className={`flex items-start gap-3 rounded-xl border p-3 ${t.caja}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${t.icono}`}>
        <t.Icono size={18} className={t.gira ? 'animate-spin' : ''} />
      </span>
      <div className="min-w-0">
        <p className={`break-words text-sm font-semibold leading-snug ${t.tenue ? 'text-neutro-500' : 'text-neutro-900'}`}>{paso.titulo}</p>
        {paso.detalle && <p className="mt-0.5 break-words text-xs text-neutro-600">{paso.detalle}</p>}
      </div>
    </li>
  )
}

/**
 * `angosto`: dentro de un modal (Impresión, «Imprimir y emitir»). Las cuatro
 * columnas dependen del ancho de la PANTALLA, no del lugar que tiene el
 * panel: en un modal de 672 px a pantalla grande el correo y el consecutivo
 * se salían de su recuadro. Ahí son dos como mucho.
 */
export default function PanelEmisionFactura({ emision, incrustado = false, angosto = false }) {
  const { estado, fase, error, pidiendoDatos, bajar, bajando, errorDescarga } = emision
  const c = estado?.comprobante || null
  if (!emision.activo || !(c || fase || error || pidiendoDatos)) return null

  const ambiente = c?.ambiente || estado?.ambiente
  const pasos = pasosDe({
    comprobante: c, correo: estado?.correo, fase, ambiente, seguimiento: estado?.seguimiento, origen: emision.origen
  })
  const resumen = resumenDe({ comprobante: c, fase, origen: emision.origen })
  const enProduccion = ambiente === 'produccion'
  const yaEnviado = estado?.correo?.estado === 'enviado'

  return (
    <section
      data-panel-emision
      aria-live="polite"
      className={incrustado ? 'rounded-xl border border-neutro-200 bg-white p-4' : 'card rounded-2xl p-5'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck size={18} className="shrink-0 text-primario-600" />
          <h3 className="font-bold text-neutro-900">{nombreDeTipo(c?.tipo || estado?.tipo)}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ambiente === 'pruebas' && <Insignia tono="alerta">Pruebas · sin validez fiscal</Insignia>}
          {resumen && <Insignia tono={resumen.tono}>{resumen.texto}</Insignia>}
        </div>
      </div>

      {(c || fase) && (
        <ol className={`mt-4 grid gap-3 ${angosto ? 'sm:grid-cols-2' : pasos.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
          {pasos.map(p => <Paso key={p.clave} paso={p} />)}
        </ol>
      )}

      {c?.estado === 'rechazada' && (
        <div data-rechazo className="mt-4 rounded-xl border border-peligro-200 bg-peligro-50 p-4 text-sm">
          <p className="font-semibold text-peligro-700">Lo que respondió Hacienda</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-neutro-800">{c.mensaje || 'Hacienda no dio el motivo.'}</p>
          <p className="mt-2 text-xs text-neutro-600">
            {emision.origen === 'compra'
              ? 'Corregí lo que indica y tocá «Volver a enviar la aceptación»: sale una nueva, con otro número.'
              : 'Corregí lo que indica y tocá «Volver a emitir»: se prepara un comprobante nuevo que hace referencia al rechazado.'}
          </p>
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}

      {pidiendoDatos && !fase && (
        <DatosPendientesEmision
          estado={estado}
          onEmitir={(respuesta) => emision.emitir(respuesta)}
          onCancelar={emision.cerrarDatos}
        />
      )}

      {c && (
        <>
          <p className="mt-4 break-all text-xs text-neutro-500">
            Clave: <span className="font-mono text-neutro-700">{c.clave}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Boton variante="secundario" tamano="sm" icono={Download} disabled={bajando} onClick={() => bajar(false)}>XML del comprobante</Boton>
            {c.tieneRespuesta && (
              <Boton variante="secundario" tamano="sm" icono={Download} disabled={bajando} onClick={() => bajar(true)}>Respuesta de Hacienda</Boton>
            )}
            {c.estado === 'aceptada' && enProduccion && emision.enviarAlCliente && (
              <Boton variante="secundario" tamano="sm" icono={Mail} data-enviar-cliente
                cargando={emision.enviandoCorreo} onClick={emision.enviarAlCliente}>
                {yaEnviado ? 'Volver a enviar al cliente' : 'Enviar al cliente'}
              </Boton>
            )}
          </div>
          {errorDescarga && <p role="alert" className="mt-2 text-sm text-peligro-700">{errorDescarga}</p>}
        </>
      )}
    </section>
  )
}
