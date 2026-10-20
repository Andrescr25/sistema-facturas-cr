import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import Boton from '../ui/Boton'
import { MOTIVOS_DESCUENTO, REFERENCIAS_NOTA, faltaContestar, respuestaDe } from '../../utils/emisionPasos'

const CAMPO = 'mt-1 w-full rounded-lg border border-neutro-300 bg-white px-3 py-2 text-sm'

/**
 * El dato que solo una persona puede dar: con qué paga el cliente, el motivo
 * de un descuento o el registro de un medicamento. Se pide acá, y al
 * contestar la emisión sigue sola: no se vuelve al modal de ambiente, tipo y
 * tres botones.
 */
export default function DatosPendientesEmision({ estado, onEmitir, onCancelar }) {
  const pendientes = estado?.pendientes || []
  const [r, setR] = useState({ metodoPagoId: null, codigoReferencia: '', referenciaOtro: '', codigoDescuento: '', naturalezaDescuento: '', medicamentos: {} })
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

      {/* QUÉ HACE LA NOTA. Hacienda lo pide en toda nota de crédito, y no es
          lo mismo anular la factura que devolver mercancía o corregir un
          monto. Lo contesta quien la emite: no se deduce del motivo. */}
      {estado?.faltaReferencia && (
        <div data-referencia className="mt-3">
          <p className="text-sm font-medium text-neutro-800">¿Qué hace esta nota sobre la factura?</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {REFERENCIAS_NOTA.map(([codigo, texto]) => (
              <button
                key={codigo}
                type="button"
                aria-pressed={r.codigoReferencia === codigo}
                onClick={() => { setAviso(''); setR(a => ({ ...a, codigoReferencia: codigo })) }}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                  r.codigoReferencia === codigo
                    ? 'border-primario-400 bg-primario-600 text-white'
                    : 'border-neutro-300 bg-white text-neutro-700 hover:border-neutro-400'
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
          {r.codigoReferencia === '99' && (
            <label className="mt-2 block text-sm font-medium text-neutro-800">
              Describilo
              <input
                className={CAMPO}
                maxLength={100}
                value={r.referenciaOtro}
                onChange={e => { setAviso(''); setR(a => ({ ...a, referenciaOtro: e.target.value })) }}
              />
            </label>
          )}
        </div>
      )}

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
        <Boton icono={ShieldCheck} onClick={emitir}>Emitir ahora</Boton>
        <Boton variante="secundario" onClick={onCancelar}>Cancelar</Boton>
      </div>
    </div>
  )
}
