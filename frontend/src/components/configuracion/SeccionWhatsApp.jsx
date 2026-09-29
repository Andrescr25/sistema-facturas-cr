import { useState } from 'react'
import { CheckCircle2, Loader2, MessageCircle, Server, Smartphone, Unlink, AlertTriangle } from 'lucide-react'
import { useWhatsAppConexion } from '../../hooks/useWhatsAppConexion'

/**
 * WhatsApp del sistema (2026-09-29): los mensajes salen desde este mismo
 * servidor con Baileys, en vez de Evolution API en un servicio aparte.
 *
 * Se vincula con un código de 8 caracteres que se escribe en el teléfono —
 * sin QR—, y mientras no esté vinculado acá, los mensajes siguen saliendo
 * por Evolution: la mudanza no corta los envíos.
 */

function formatearNumero(numero) {
  const n = String(numero || '')
  return n.startsWith('506') && n.length === 11 ? `+506 ${n.slice(3, 7)} ${n.slice(7)}` : `+${n}`
}

function formatearCodigo(codigo) {
  const c = String(codigo || '').toUpperCase()
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}

function Paso({ n, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primario-100 text-sm font-bold text-primario-700">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  )
}

export default function SeccionWhatsApp({ confirmar }) {
  const w = useWhatsAppConexion()
  const [telefono, setTelefono] = useState('')
  const e = w.estado

  const desvincular = async () => {
    const ok = confirmar
      ? await confirmar('Los mensajes dejan de salir por este servidor hasta que se vuelva a vincular un teléfono.')
      : window.confirm('¿Desvincular WhatsApp?')
    if (ok) w.desvincular()
  }

  return (
    <div className="card p-5 sm:p-6">
      <h2 className="mb-1 flex items-center gap-2 text-xl font-semibold">
        <MessageCircle size={24} className="text-primario-600" />
        WhatsApp
      </h2>
      <p className="mb-5 text-sm text-neutro-500">
        El número desde el que salen facturas, cotizaciones, órdenes de compra y recordatorios.
      </p>

      {!e ? (
        <div className="flex items-center gap-2 text-neutro-400"><Loader2 size={18} className="animate-spin" /> Consultando…</div>
      ) : !e.habilitado ? (
        <div className="flex gap-3 rounded-xl bg-neutro-50 p-4 text-sm text-neutro-700">
          <Server size={20} className="mt-0.5 shrink-0 text-neutro-400" />
          <div>
            <p className="font-semibold text-neutro-900">Hoy sale por Evolution API, el servicio aparte.</p>
            <p className="mt-1">
              Para que salga desde este servidor, en Render agregue la variable <code className="rounded bg-white px-1.5 py-0.5">WHATSAPP_PROVEEDOR=interno</code> y
              vuelva a desplegar. Después se vincula el teléfono acá mismo.
            </p>
          </div>
        </div>
      ) : e.conectado ? (
        <div className="flex flex-col gap-4 rounded-xl bg-exito-50 p-4 sm:flex-row sm:items-center">
          <CheckCircle2 size={28} className="shrink-0 text-exito-600" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-exito-800">Conectado · {formatearNumero(e.numero)}</p>
            <p className="text-sm text-exito-700">
              {e.nombre ? `${e.nombre} · ` : ''}Los mensajes salen desde este servidor.
              {e.evolutionConfigurado ? ' Evolution API ya se puede apagar.' : ''}
            </p>
          </div>
          <button type="button" onClick={desvincular} disabled={w.ocupado}
            className="btn flex shrink-0 items-center justify-center gap-2 border-peligro-200 text-peligro-700 hover:bg-peligro-50 disabled:opacity-50">
            <Unlink size={18} /> Desvincular
          </button>
        </div>
      ) : e.vinculado ? (
        <div className="flex gap-3 rounded-xl bg-alerta-50 p-4 text-sm text-alerta-800">
          <Loader2 size={20} className="mt-0.5 shrink-0 animate-spin" />
          <div>
            <p className="font-semibold">Vinculado, reconectando…</p>
            {e.ultimoError && <p className="mt-1">{e.ultimoError}</p>}
            {e.evolutionConfigurado && <p className="mt-1">Mientras tanto, los mensajes salen por Evolution API.</p>}
          </div>
        </div>
      ) : w.codigo ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-primario-50 p-5 text-center">
            <p className="text-sm font-semibold text-primario-700">Código para {w.codigo.telefono}</p>
            <p className="mt-1 font-mono text-4xl font-bold tracking-widest text-primario-900 sm:text-5xl">{formatearCodigo(w.codigo.codigo)}</p>
          </div>
          <ol className="space-y-3 text-sm text-neutro-700">
            <Paso n={1}>En ese teléfono, abra WhatsApp → <strong>Configuración</strong> (o ⋮) → <strong>Dispositivos vinculados</strong>.</Paso>
            <Paso n={2}>Toque <strong>Vincular un dispositivo</strong> y después <strong>Vincular con el número de teléfono</strong>.</Paso>
            <Paso n={3}>Escriba el código de arriba. Esta pantalla cambia sola cuando quede conectado.</Paso>
          </ol>
          <div className="flex items-center gap-2 text-sm text-neutro-500">
            <Loader2 size={16} className="animate-spin" /> Esperando que se escriba el código…
            <button type="button" onClick={w.cancelarCodigo} className="ml-auto font-semibold text-neutro-600 underline">Cancelar</button>
          </div>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={(ev) => { ev.preventDefault(); w.vincular(telefono) }}>
          <label className="label" htmlFor="wa-telefono">Celular que tiene el WhatsApp del negocio</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Smartphone size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
              <input id="wa-telefono" value={telefono} onChange={(ev) => setTelefono(ev.target.value)}
                inputMode="tel" placeholder="8888 7777" className="input h-12 w-full pl-10 text-base" />
            </div>
            <button type="submit" disabled={w.ocupado || !telefono.trim() || !e.conTurno}
              className="btn btn-primary flex h-12 items-center justify-center gap-2 disabled:opacity-50">
              {w.ocupado ? <Loader2 size={18} className="animate-spin" /> : <MessageCircle size={18} />}
              Obtener código
            </button>
          </div>
          {!e.conTurno && <p className="text-sm text-neutro-500">El servidor se está reiniciando; en unos segundos se puede vincular.</p>}
          {e.evolutionConfigurado && (
            <p className="text-sm text-neutro-500">Mientras no se vincule acá, los mensajes siguen saliendo por Evolution API.</p>
          )}
        </form>
      )}

      {w.error && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-peligro-50 px-4 py-3 text-sm text-peligro-800">
          <AlertTriangle size={16} className="shrink-0" /> {w.error}
        </p>
      )}
    </div>
  )
}
