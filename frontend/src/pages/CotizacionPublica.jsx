import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, AlertCircle, Package, Clock, CheckCircle2 } from 'lucide-react'
import api from '../services/api'
import { colones } from '../utils/colones'
import { urlArchivo } from '../utils/urlArchivo'

/**
 * La cotización como la ve el cliente en el navegador.
 *
 * PARA QUÉ EXISTE, SI YA VA EL PDF
 * El PDF no lleva fotos. Quien no conoce el producto lee "ROLLO BOLSA
 * GDE.1X41 BASURA EZ" y no sabe qué le están ofreciendo — sobre todo un
 * cliente nuevo, que es a quien más se le cotiza. Acá cada línea va con su
 * foto.
 *
 * Es pública: la abre quien tenga el enlace, que lleva un token firmado. No
 * pide cuenta a propósito — pedirle a alguien que se registre para ver un
 * precio que se le acaba de mandar es la forma más rápida de que no lo mire.
 */


const fecha = (f) =>
  f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CR',
    { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

export default function CotizacionPublica() {
  const { token } = useParams()
  const [cot, setCot] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    api.get(`/cotizacion-publica/${token}`)
      .then(r => { if (vivo) setCot(r.data?.data || null) })
      .catch(e => { if (vivo) setError(e.response?.data?.message || 'No se pudo abrir la cotización.') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [token])

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutro-50">
        <Loader2 size={28} className="animate-spin text-acento-500" />
      </div>
    )
  }

  if (error || !cot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutro-50 p-6">
        <div className="max-w-sm rounded-3xl border border-neutro-200 bg-white p-8 text-center">
          <AlertCircle size={34} className="mx-auto text-neutro-300" />
          <p className="mt-3 text-sm font-semibold text-neutro-700">{error || 'Cotización no encontrada.'}</p>
          <p className="mt-1 text-xs text-neutro-400">
            Puede que el enlace esté incompleto o que la cotización ya no exista.
          </p>
        </div>
      </div>
    )
  }

  const subtotal = cot.lineas.reduce((s, l) => s + l.importe, 0)
  const impuesto = cot.lineas.reduce((s, l) => s + l.importe * ((Number(l.taxPercentage) || 0) / 100), 0)
  const total = subtotal + impuesto

  return (
    <div className="min-h-screen bg-neutro-50 pb-16">
      {/* Cabecera con la marca: para un cliente nuevo, esta página es muchas
          veces lo primero que ve del negocio. */}
      <div className="bg-primario-900 px-5 py-7 text-white">
        <div className="mx-auto max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-acento-400">
            {cot.negocio?.nombre || 'Distribuidora Tachi'}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold">Cotización N° {cot.numero}</h1>
          <p className="mt-0.5 text-sm text-white/70">Para {cot.cliente || 'usted'}</p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4">
        {/* La validez, arriba y visible: es la única condición del documento. */}
        <div className={`-mt-4 rounded-2xl border px-4 py-3 ${
          cot.vencida
            ? 'border-peligro-200 bg-peligro-50'
            : 'border-acento-200 bg-acento-50'
        }`}>
          <div className="flex items-start gap-2">
            <Clock size={16} className={`mt-0.5 shrink-0 ${cot.vencida ? 'text-peligro-600' : 'text-acento-600'}`} />
            <p className={`text-[13px] font-semibold ${cot.vencida ? 'text-peligro-800' : 'text-acento-800'}`}>
              {cot.vencida
                ? `Estos precios vencieron el ${fecha(cot.vence)}. Escribanos y le pasamos los actuales.`
                : `Precios válidos hasta el ${fecha(cot.vence)}.`}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {cot.lineas.map((l, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-neutro-200 bg-white p-3">
              {/* La foto es la razón de ser de esta página. Sin ella se cae a
                  un ícono en vez de dejar un hueco. */}
              {l.imagen ? (
                <img
                  src={urlArchivo(l.imagen)}
                  alt={l.nombre}
                  loading="lazy"
                  className="h-16 w-16 shrink-0 rounded-xl border border-neutro-100 bg-white object-contain"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-neutro-100">
                  <Package size={22} className="text-neutro-300" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold leading-tight text-neutro-900">{l.nombre}</p>
                {l.referencia && (
                  <p className="mt-0.5 text-[11px] text-neutro-400">Ref. {l.referencia}</p>
                )}
                <p className="mt-1 text-[12px] text-neutro-500">
                  {l.cantidad} × <span className="font-semibold text-neutro-700">{colones(l.precioConIva)}</span>
                  <span className="text-neutro-400"> c/IVA</span>
                </p>
              </div>

              <p className="shrink-0 text-right text-sm font-extrabold text-neutro-900">
                {colones(l.importe * (1 + (Number(l.taxPercentage) || 0) / 100))}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-neutro-200 bg-white p-4">
          <div className="flex justify-between text-[13px] text-neutro-500">
            <span>Subtotal</span><span>{colones(subtotal)}</span>
          </div>
          <div className="mt-1 flex justify-between text-[13px] text-neutro-500">
            <span>IVA</span><span>{colones(impuesto)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-acento-500 px-4 py-3 text-white">
            <span className="text-[11px] font-bold uppercase tracking-widest">Total</span>
            <span className="text-xl font-extrabold">{colones(total)}</span>
          </div>
        </div>

        {cot.observaciones && (
          <div className="mt-4 rounded-2xl border border-neutro-200 bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutro-400">Nota</p>
            <p className="mt-1 text-[13px] text-neutro-600">{cot.observaciones}</p>
          </div>
        )}

        {cot.facturada && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-exito-200 bg-exito-50 px-4 py-3">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-exito-600" />
            <p className="text-[13px] font-semibold text-exito-800">Esta cotización ya se facturó.</p>
          </div>
        )}

        <div className="mt-6 text-center text-[11px] leading-relaxed text-neutro-400">
          <p className="font-semibold text-neutro-500">{cot.negocio?.nombre}</p>
          <p>{cot.negocio?.telefono} · {cot.negocio?.email}</p>
          <p className="mt-2">
            Esta cotización no es un documento fiscal y está sujeta a disponibilidad de inventario.
          </p>
        </div>
      </div>
    </div>
  )
}
