import { useEffect, useState } from 'react'
import { AlertTriangle, BellRing, CheckCircle2, Loader2, Mail, Send, Smartphone } from 'lucide-react'
import { getAvisosPedidos, guardarAvisosPedidos, probarAvisosPedidos } from '../../services/whatsappConexionService'

/**
 * A dónde avisa el sistema cuando un cliente hace un pedido en el portal
 * (2026-09-29). WhatsApp, correo o los dos; vacío = no avisar por ese medio.
 * El aviso sale solo, sin botón: es para la empresa, no para el cliente.
 */

function formatear(numero) {
  const n = String(numero || '')
  return n.startsWith('506') && n.length === 11 ? `${n.slice(3, 7)} ${n.slice(7)}` : n
}

function ResultadoPrueba({ r }) {
  const linea = (medio, valor) => {
    const ok = valor === 'enviado'
    const sin = valor === 'sin configurar'
    return (
      <p className={`flex items-center gap-2 ${ok ? 'text-exito-700' : sin ? 'text-neutro-500' : 'text-peligro-700'}`}>
        {ok ? <CheckCircle2 size={16} /> : sin ? null : <AlertTriangle size={16} />}
        <strong>{medio}:</strong> {ok ? 'enviado, revise que haya llegado' : valor}
      </p>
    )
  }
  return <div className="space-y-1 rounded-xl bg-neutro-50 px-4 py-3 text-sm">{linea('WhatsApp', r.whatsapp)}{linea('Correo', r.correo)}</div>
}

export default function SeccionAvisosPedidos() {
  const [cargado, setCargado] = useState(null)
  const [whatsapp, setWhatsapp] = useState('')
  const [correo, setCorreo] = useState('')
  const [ocupado, setOcupado] = useState(null) // 'guardar' | 'prueba'
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [prueba, setPrueba] = useState(null)

  useEffect(() => {
    getAvisosPedidos()
      .then((d) => { setCargado(d); setWhatsapp(formatear(d.whatsapp)); setCorreo(d.correo || '') })
      .catch((e) => setError(e.response?.data?.message || 'No se pudo cargar la configuración de avisos.'))
  }, [])

  const cambio = cargado && (whatsapp.replace(/\D/g, '') !== formatear(cargado.whatsapp).replace(/\D/g, '') || correo.trim() !== (cargado.correo || ''))
  const hayDestino = cargado && (cargado.whatsapp || cargado.correo)

  const guardar = async (ev) => {
    ev.preventDefault()
    setOcupado('guardar'); setError(null); setAviso(null); setPrueba(null)
    try {
      const d = await guardarAvisosPedidos({ whatsapp, correo })
      setCargado((prev) => ({ ...prev, ...d }))
      setWhatsapp(formatear(d.whatsapp))
      setAviso('Guardado. Cada pedido nuevo del portal va a avisar ahí.')
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo guardar.')
    } finally {
      setOcupado(null)
    }
  }

  const probar = async () => {
    setOcupado('prueba'); setError(null); setAviso(null); setPrueba(null)
    try {
      setPrueba(await probarAvisosPedidos())
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo mandar la prueba.')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="card p-5 sm:p-6">
      <h2 className="mb-1 flex items-center gap-2 text-xl font-semibold">
        <BellRing size={24} className="text-primario-600" />
        Avisos de pedidos del portal
      </h2>
      <p className="mb-5 text-sm text-neutro-500">
        Cuando un cliente hace un pedido en el portal, el sistema avisa acá. Deje vacío el medio que no quiera usar.
      </p>

      {!cargado && !error ? (
        <div className="flex items-center gap-2 text-neutro-400"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
      ) : (
        <form onSubmit={guardar} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="aviso-whatsapp">WhatsApp</label>
              <div className="relative">
                <Smartphone size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
                <input id="aviso-whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel"
                  placeholder="8888 7777" className="input h-12 w-full pl-10 text-base" />
              </div>
              <p className="mt-1 text-xs text-neutro-500">
                Un celular distinto al que tiene vinculado el sistema: WhatsApp no hace sonar los mensajes que uno se manda a sí mismo.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="aviso-correo">Correo</label>
              <div className="relative">
                <Mail size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
                <input id="aviso-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)}
                  placeholder="nombre@correo.com" className="input h-12 w-full pl-10 text-base" />
              </div>
              {cargado && !cargado.correoDisponible && (
                <p className="mt-1 text-xs text-alerta-700">El servidor no tiene configurado el envío de correo.</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="submit" disabled={!cambio || ocupado}
              className="btn btn-primary flex h-11 items-center justify-center gap-2 disabled:opacity-50">
              {ocupado === 'guardar' && <Loader2 size={18} className="animate-spin" />}
              Guardar
            </button>
            <button type="button" onClick={probar} disabled={!hayDestino || cambio || ocupado}
              title={cambio ? 'Guarde primero' : undefined}
              className="btn flex h-11 items-center justify-center gap-2 disabled:opacity-50">
              {ocupado === 'prueba' ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              Mandar un aviso de prueba
            </button>
          </div>

          {aviso && <p className="flex items-center gap-2 text-sm text-exito-700"><CheckCircle2 size={16} /> {aviso}</p>}
          {prueba && <ResultadoPrueba r={prueba} />}
          {error && (
            <p className="flex items-center gap-2 rounded-xl bg-peligro-50 px-4 py-3 text-sm text-peligro-800">
              <AlertTriangle size={16} className="shrink-0" /> {error}
            </p>
          )}
        </form>
      )}
    </div>
  )
}
