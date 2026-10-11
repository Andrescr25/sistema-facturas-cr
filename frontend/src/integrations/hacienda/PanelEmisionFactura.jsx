import { useState } from 'react'
import {
  ShieldCheck, Check, Loader2, Circle, X, AlertTriangle, Minus, Download, Mail
} from 'lucide-react'
import Insignia from '../../components/ui/Insignia'
import { descargar } from './api'
import {
  pasosDe, resumenDe, nombreDeTipo, MOTIVOS_DESCUENTO, faltaContestar, respuestaDe
} from './emisionPasos'

/**
 * Cómo va la factura electrónica, DENTRO de la factura.
 *
 * QUÉ SE PIDIÓ (2026-10-11): «que en la misma factura, cuando le doy al
 * botón, me indique qué va pasando, si se envió, o si la aceptó Hacienda», y
 * que al cliente le llegue «el pdf con los 2 XML». Son cuatro renglones que
 * se van llenando solos: firmada, enviada, respuesta de Hacienda y correo al
 * cliente. Qué dice cada uno se decide en emisionPasos.js.
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
        <p className={`text-sm font-semibold leading-snug ${t.tenue ? 'text-neutro-500' : 'text-neutro-900'}`}>{paso.titulo}</p>
        {paso.detalle && <p className="mt-0.5 break-words text-xs text-neutro-600">{paso.detalle}</p>}
      </div>
    </li>
  )
}

const CAMPO = 'mt-1 w-full rounded-lg border border-neutro-300 bg-white px-3 py-2 text-sm'

/**
 * El dato que solo una persona puede dar: con qué paga el cliente, el motivo
 * de un descuento o el registro de un medicamento. Se pide acá, y al
 * contestar la emisión sigue sola: no se vuelve al modal de ambiente, tipo y
 * tres botones.
 */
function DatosPendientes({ estado, onEmitir, onCancelar }) {
  const pendientes = estado?.pendientes || []
  const [r, setR] = useState({ metodoPagoId: null, codigoDescuento: '', naturalezaDescuento: '', medicamentos: {} })
  const [aviso, setAviso] = useState('')
  const conDescuento = pendientes.filter(p => p.descuento)
  const medicamentos = pendientes.filter(p => p.medicamento)
  const medicamento = (n, campo, valor) =>
    setR(a => ({ ...a, medicamentos: { ...a.medicamentos, [n]: { ...a.medicamentos[n], [campo]: valor } } }))

  const emitir = () => {
    const falta = faltaContestar(pendientes, r, estado)
    if (falta) return setAviso(falta)
    onEmitir(respuestaDe(estado, r))
  }

  return (
    <div data-datos-pendientes className="mt-4 rounded-xl border border-alerta-200 bg-alerta-50 p-4">
      <p className="font-semibold text-neutro-900">Antes de emitir falta un dato</p>
      <p className="mt-0.5 text-sm text-neutro-600">Hacienda lo exige y el sistema no lo puede adivinar.</p>

      {/* EL MEDIO DE PAGO. La factura nace sin cobrar, así que una venta de
          contado puede llegar acá sin decir con qué se paga, y Hacienda lo
          pide. Elegirlo NO registra un cobro: eso se dice, porque el error
          de antes era justamente una factura que salía pagada sola. */}
      {estado?.faltaMedioPago && (
        <div data-medio-pago className="mt-3">
          <p className="text-sm font-medium text-neutro-800">¿Con qué paga el cliente?</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(estado.mediosPago || []).map(m => (
              <button
                key={m.id}
                type="button"
                aria-pressed={r.metodoPagoId === m.id}
                onClick={() => { setAviso(''); setR(a => ({ ...a, metodoPagoId: m.id })) }}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                  r.metodoPagoId === m.id
                    ? 'border-primario-400 bg-primario-600 text-white'
                    : 'border-neutro-300 bg-white text-neutro-700 hover:border-neutro-400'
                }`}
              >
                {m.nombre}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-neutro-500">
            Es una venta de contado y Hacienda pide el medio de pago. Esto no registra ningún cobro: la factura sigue
            pendiente hasta que la cobrés.
          </p>
        </div>
      )}

      {conDescuento.length > 0 && (
        <div className="mt-3">
          <label className="block text-sm font-medium text-neutro-800">
            ¿De qué es el descuento?
            <select
              className={CAMPO}
              value={r.codigoDescuento}
              onChange={e => { setAviso(''); setR(a => ({ ...a, codigoDescuento: e.target.value })) }}
            >
              <option value="">Elegir motivo</option>
              {MOTIVOS_DESCUENTO.map(([codigo, texto]) => <option key={codigo} value={codigo}>{texto}</option>)}
            </select>
          </label>
          <p className="mt-1 text-xs text-neutro-500">
            Vale para {conDescuento.length === 1 ? 'la línea' : `las ${conDescuento.length} líneas`} con descuento: {conDescuento.map(p => p.nombre).join(' · ')}
          </p>
          {r.codigoDescuento === '99' && (
            <label className="mt-2 block text-sm font-medium text-neutro-800">
              Describilo
              <input
                className={CAMPO}
                maxLength={80}
                value={r.naturalezaDescuento}
                onChange={e => { setAviso(''); setR(a => ({ ...a, naturalezaDescuento: e.target.value })) }}
              />
            </label>
          )}
        </div>
      )}

      {medicamentos.map(p => (
        <div key={p.numeroLinea} className="mt-3 grid gap-2 sm:grid-cols-2">
          <p className="text-sm font-semibold text-neutro-800 sm:col-span-2">{p.numeroLinea}. {p.nombre}</p>
          <label className="block text-sm font-medium text-neutro-800">
            Registro sanitario
            <input
              className={CAMPO}
              maxLength={60}
              value={r.medicamentos[p.numeroLinea]?.registro ?? p.registroSanitario ?? ''}
              onChange={e => { setAviso(''); medicamento(p.numeroLinea, 'registro', e.target.value) }}
            />
          </label>
          <label className="block text-sm font-medium text-neutro-800">
            Forma farmacéutica (código de 3 dígitos)
            <input
              className={CAMPO}
              maxLength={3}
              inputMode="numeric"
              value={r.medicamentos[p.numeroLinea]?.forma ?? p.formaFarmaceutica ?? ''}
              onChange={e => { setAviso(''); medicamento(p.numeroLinea, 'forma', e.target.value) }}
            />
          </label>
        </div>
      ))}

      {aviso && <p role="alert" className="mt-3 text-sm font-medium text-peligro-700">{aviso}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={emitir} className="btn btn-primary flex items-center gap-2">
          <ShieldCheck size={16} /> Emitir ahora
        </button>
        <button type="button" onClick={onCancelar} className="btn btn-outline">Cancelar</button>
      </div>
    </div>
  )
}

export default function PanelEmisionFactura({ emision }) {
  const [bajando, setBajando] = useState(false)
  const [errorDescarga, setErrorDescarga] = useState('')
  const { estado, fase, error, pidiendoDatos } = emision
  const c = estado?.comprobante || null
  if (!emision.activo || !(c || fase || error || pidiendoDatos)) return null

  const ambiente = c?.ambiente || estado?.ambiente
  const pasos = pasosDe({ comprobante: c, correo: estado?.correo, fase, ambiente, seguimiento: estado?.seguimiento })
  const resumen = resumenDe({ comprobante: c, fase })
  const enProduccion = ambiente === 'produccion'
  const yaEnviado = estado?.correo?.estado === 'enviado'

  const bajar = async (respuesta) => {
    setBajando(true)
    setErrorDescarga('')
    try {
      await descargar(c, respuesta)
    } catch {
      setErrorDescarga('No se pudo descargar el archivo.')
    } finally {
      setBajando(false)
    }
  }

  return (
    <section data-panel-emision aria-live="polite" className="card rounded-2xl p-5">
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
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {pasos.map(p => <Paso key={p.clave} paso={p} />)}
        </ol>
      )}

      {c?.estado === 'rechazada' && (
        <div data-rechazo className="mt-4 rounded-xl border border-peligro-200 bg-peligro-50 p-4 text-sm">
          <p className="font-semibold text-peligro-700">Lo que respondió Hacienda</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-neutro-800">{c.mensaje || 'Hacienda no dio el motivo.'}</p>
          <p className="mt-2 text-xs text-neutro-600">
            Corregí lo que indica y tocá «Volver a emitir»: se prepara un comprobante nuevo que hace referencia al rechazado.
          </p>
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}

      {pidiendoDatos && !fase && (
        <DatosPendientes
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
            <button type="button" disabled={bajando} onClick={() => bajar(false)} className="btn btn-outline btn-sm flex items-center gap-1.5 disabled:opacity-50">
              <Download size={14} /> XML del comprobante
            </button>
            {c.tieneRespuesta && (
              <button type="button" disabled={bajando} onClick={() => bajar(true)} className="btn btn-outline btn-sm flex items-center gap-1.5 disabled:opacity-50">
                <Download size={14} /> Respuesta de Hacienda
              </button>
            )}
            {c.estado === 'aceptada' && enProduccion && (
              <button
                type="button"
                data-enviar-cliente
                disabled={emision.enviandoCorreo}
                onClick={emision.enviarAlCliente}
                className="btn btn-outline btn-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {emision.enviandoCorreo ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                {yaEnviado ? 'Volver a enviar al cliente' : 'Enviar al cliente'}
              </button>
            )}
          </div>
          {errorDescarga && <p role="alert" className="mt-2 text-sm text-peligro-700">{errorDescarga}</p>}
        </>
      )}
    </section>
  )
}
