import { useState } from 'react'
import { Loader2, FileText, XCircle, Package } from 'lucide-react'
import { formatearColones } from '../../utils/catalogoClientesUtils'

const ESTADO = {
  pendiente: { texto: 'En revisión', clase: 'bg-amber-100 text-amber-700' },
  facturado: { texto: 'Facturado', clase: 'bg-emerald-100 text-emerald-700' },
  rechazado: { texto: 'Rechazado', clase: 'bg-red-100 text-red-700' }
}

function FilaPedido({ pedido, procesando, onFacturar, onRechazar }) {
  const [motivo, setMotivo] = useState('')
  const [rechazando, setRechazando] = useState(false)
  const badge = ESTADO[pedido.estado] || ESTADO.pendiente
  const ocupado = procesando === pedido.id

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{pedido.clienteNombre}</p>
          <p className="text-xs text-gray-400">
            Pedido #{pedido.id} · {pedido.lineas} producto(s) ·{' '}
            {new Date(pedido.creadoEn).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-[10px] font-extrabold px-2 py-1 rounded-md uppercase ${badge.clase}`}>{badge.texto}</span>
          <span className="font-extrabold text-gray-900">{formatearColones(pedido.total)}</span>
        </div>
      </div>

      {pedido.observaciones && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">{pedido.observaciones}</p>
      )}
      {pedido.numeroFactura && (
        <p className="text-xs text-emerald-700 font-semibold">Factura {pedido.numeroFactura}</p>
      )}
      {pedido.motivoRechazo && (
        <p className="text-xs text-red-600">{pedido.motivoRechazo}</p>
      )}

      {pedido.estado === 'pendiente' && (
        rechazando ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="¿Por qué se rechaza?"
              autoFocus
              className="flex-1 px-3 py-2 border-2 border-gray-200 focus:border-red-400 rounded-xl text-sm focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onRechazar(pedido, motivo)}
              disabled={ocupado}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-200 text-white text-sm font-bold py-2 px-4 rounded-xl"
            >
              Confirmar
            </button>
            <button type="button" onClick={() => setRechazando(false)} className="text-xs text-gray-400 font-semibold px-2">
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onFacturar(pedido)}
              disabled={ocupado}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {ocupado ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              Facturar
            </button>
            <button
              type="button"
              onClick={() => setRechazando(true)}
              disabled={ocupado}
              className="px-4 rounded-xl border-2 border-gray-200 hover:border-red-300 text-gray-500 hover:text-red-600 text-sm font-bold flex items-center gap-1.5"
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

export default function ListaPedidos({ pedidos, cargando, filtro, setFiltro, procesando, onFacturar, onRechazar }) {
  const FILTROS = [
    { valor: 'pendiente', texto: 'En revisión' },
    { valor: 'facturado', texto: 'Facturados' },
    { valor: 'rechazado', texto: 'Rechazados' },
    { valor: 'todos', texto: 'Todos' }
  ]

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {FILTROS.map(f => (
          <button
            key={f.valor}
            type="button"
            onClick={() => setFiltro(f.valor)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              filtro === f.valor ? 'bg-emerald-600 text-white' : 'bg-white border-2 border-gray-200 text-gray-600'
            }`}
          >
            {f.texto}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-emerald-600" /></div>
      ) : pedidos.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-100 p-10 text-center text-gray-400 flex flex-col items-center gap-3">
          <Package size={36} className="text-gray-200" />
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
