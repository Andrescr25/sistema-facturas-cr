import { textoCiclo } from '../SelectorCiclo'
import { useState } from 'react'
import { Loader2, FileText, XCircle, Package } from 'lucide-react'
import { formatearColones } from '../../utils/catalogoClientesUtils'

const ESTADO = {
  pendiente: { texto: 'En revisión', clase: 'bg-alerta-100 text-alerta-700' },
  facturado: { texto: 'Facturado', clase: 'bg-exito-100 text-exito-700' },
  rechazado: { texto: 'Rechazado', clase: 'bg-peligro-100 text-peligro-700' }
}

function FilaPedido({ pedido, procesando, onFacturar, onRechazar, onAvisar }) {
  const [motivo, setMotivo] = useState('')
  const [rechazando, setRechazando] = useState(false)
  const badge = ESTADO[pedido.estado] || ESTADO.pendiente
  const ocupado = procesando === pedido.id

  return (
    <div className="bg-white rounded-2xl border border-neutro-100 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-bold text-neutro-900 text-sm truncate">{pedido.clienteNombre}</p>
          <p className="text-xs text-neutro-400">
            Pedido #{pedido.id} · {pedido.lineas} producto(s) ·{' '}
            {new Date(pedido.creadoEn).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-[10px] font-extrabold px-2 py-1 rounded-md uppercase ${badge.clase}`}>{badge.texto}</span>
          <span className="font-extrabold text-neutro-900">{formatearColones(pedido.total)}</span>
        </div>
      </div>

      <p className="text-xs font-semibold text-primario-700">{textoCiclo(pedido.ciclo)} · {pedido.origen === 'agente' ? 'Agente' : 'En línea'}{pedido.anticipado ? ' · Anticipado' : ''}{pedido.ciclo?.orden ? ` · Parada ${pedido.ciclo.orden}` : ''}</p>
      {pedido.observaciones && (
        <p className="text-xs text-neutro-500 bg-neutro-50 rounded-xl px-3 py-2">{pedido.observaciones}</p>
      )}
      {pedido.numeroFactura && (
        <p className="text-xs text-exito-700 font-semibold">Factura {pedido.numeroFactura}</p>
      )}
      {pedido.motivoRechazo && (
        <p className="text-xs text-peligro-600">{pedido.motivoRechazo}</p>
      )}

      {/* El aviso va fuera del bloque de "pendiente" a propósito: el mensaje
          que el cliente de verdad espera es el del pedido ya listo, no el de
          "lo estamos revisando". Dentro de ese bloque no se podía mandar
          justo en el momento que importa. */}
      <button
        type="button"
        onClick={() => onAvisar(pedido)}
        className="self-start text-xs font-bold text-exito-700 border-2 border-neutro-200 hover:border-exito-400 rounded-lg px-2.5 py-1 transition-colors"
      >
        Avisar por WhatsApp
      </button>

      {pedido.estado === 'pendiente' && (
        rechazando ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="¿Por qué se rechaza?"
              autoFocus
              className="flex-1 px-3 py-2 border-2 border-neutro-200 focus:border-peligro-400 rounded-xl text-sm focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onRechazar(pedido, motivo)}
              disabled={ocupado}
              className="bg-peligro-600 hover:bg-peligro-700 disabled:bg-neutro-200 text-white text-sm font-bold py-2 px-4 rounded-xl"
            >
              Confirmar
            </button>
            <button type="button" onClick={() => setRechazando(false)} className="text-xs text-neutro-400 font-semibold px-2">
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onFacturar(pedido)}
              disabled={ocupado}
              className="flex-1 bg-primario-800 hover:bg-primario-900 disabled:bg-neutro-200 text-white text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {ocupado ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              Facturar
            </button>
            <button
              type="button"
              onClick={() => setRechazando(true)}
              disabled={ocupado}
              className="px-4 rounded-xl border-2 border-neutro-200 hover:border-peligro-300 text-neutro-500 hover:text-peligro-600 text-sm font-bold flex items-center gap-1.5"
            >
              <XCircle size={15} />
              Rechazar
            </button>
          </div>
        )
      )}
    </div>
  )
}

export default function ListaPedidos({ pedidos, cargando, error = '', onActualizar, filtro, setFiltro, procesando, onFacturar, onRechazar, onAvisar, rutas = [], ciclos = [], contexto, setContexto }) {
  const FILTROS = [
    { valor: 'pendiente', texto: 'En revisión' },
    { valor: 'facturado', texto: 'Facturados' },
    { valor: 'rechazado', texto: 'Rechazados' },
    { valor: 'todos', texto: 'Todos' }
  ]

  const seleccionado = ciclos.find(c => String(c.id) === contexto.cicloId)
  const rutaSeleccionada = rutas.find(r => String(r.id) === contexto.rutaId)
  const contextoVisible = contexto.rutaId === 'sin-ciclo' || contexto.cicloId === 'sin-ciclo'
    ? 'Sin ciclo: pedidos sin semana asignada'
    : seleccionado ? textoCiclo({ rutaNombre: seleccionado.ruta_nombre, semana: seleccionado.semana })
      : rutaSeleccionada ? `${rutaSeleccionada.nombre} · Todas las semanas`
        : 'Vista conjunta: cada pedido conserva su ruta y semana'

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold">Ruta
          <select aria-label="Filtrar pedidos por ruta" className="mt-1 w-full min-h-11 rounded-xl border-2 border-neutro-200 bg-white p-2" value={contexto.rutaId}
            onChange={e => setContexto(prev => ({ ...prev, rutaId: e.target.value, cicloId: '' }))}>
            <option value="">Todas las rutas</option><option value="sin-ciclo">Sin ciclo</option>
            {rutas.map(r => <option key={r.id} value={String(r.id)}>{r.nombre}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">Ciclo / semana
          <select aria-label="Filtrar pedidos por ciclo" className="mt-1 w-full min-h-11 rounded-xl border-2 border-neutro-200 bg-white p-2" value={contexto.cicloId}
            disabled={contexto.rutaId === 'sin-ciclo'} onChange={e => setContexto(prev => ({ ...prev, cicloId: e.target.value }))}>
            <option value="">Todas las semanas</option><option value="sin-ciclo">Sin ciclo</option>
            {ciclos.filter(c => !contexto.rutaId || String(c.ruta_id) === contexto.rutaId).map(c => <option key={c.id} value={String(c.id)}>{textoCiclo({ rutaNombre: c.ruta_nombre, semana: c.semana })}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">Origen
          <select aria-label="Filtrar pedidos por origen" className="mt-1 w-full min-h-11 rounded-xl border-2 border-neutro-200 bg-white p-2" value={contexto.origen}
            onChange={e => setContexto(prev => ({ ...prev, origen: e.target.value }))}>
            <option value="">Todos los orígenes</option><option value="portal">En línea</option><option value="agente">Agente</option>
          </select>
        </label>
      </div>
      <p aria-live="polite" className="break-words text-sm font-semibold text-primario-700">{contextoVisible}</p>
      <p className="text-xs text-neutro-500">Hasta 200 pedidos según los filtros. Los documentos sin clasificación se muestran como Sin ciclo.</p>
      <div className="flex gap-2 flex-wrap">
        {FILTROS.map(f => (
          <button
            key={f.valor}
            type="button"
            onClick={() => setFiltro(f.valor)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              filtro === f.valor ? 'bg-exito-600 text-white' : 'bg-white border-2 border-neutro-200 text-neutro-600'
            }`}
          >
            {f.texto}
          </button>
        ))}
      </div>

      {error && <div role="alert" className="rounded-xl border border-peligro-200 bg-peligro-50 p-4 text-sm text-peligro-700">
        <p>{error}</p><button type="button" className="mt-2 min-h-11 font-bold underline" onClick={onActualizar}>Reintentar pedidos</button>
      </div>}
      {cargando ? (
        <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-exito-600" /></div>
      ) : error ? null : pedidos.length === 0 ? (
        <div className="bg-white rounded-3xl border border-neutro-100 p-10 text-center text-neutro-400 flex flex-col items-center gap-3">
          <Package size={36} className="text-neutro-200" />
          <p className="text-sm">No hay pedidos en esta vista.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidos.map(p => (
            <FilaPedido
              key={p.id}
              pedido={p}
              procesando={procesando}
              onFacturar={onFacturar}
              onRechazar={onRechazar}
              onAvisar={onAvisar}
            />
          ))}
        </div>
      )}
    </div>
  )
}
