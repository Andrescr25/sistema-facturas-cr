import { Loader2, Link2, Ban, RotateCcw, Search } from 'lucide-react'

const ESTADO = {
  sin_cuenta: { texto: 'Sin cuenta', clase: 'bg-gray-100 text-gray-500' },
  invitado: { texto: 'Invitado', clase: 'bg-blue-100 text-blue-700' },
  vencido: { texto: 'Enlace vencido', clase: 'bg-amber-100 text-amber-700' },
  activo: { texto: 'Activo', clase: 'bg-emerald-100 text-emerald-700' },
  inactivo: { texto: 'Sin acceso', clase: 'bg-red-100 text-red-700' }
}

export default function ListaCuentas({
  clientes, cargando, busqueda, setBusqueda, procesando,
  onInvitar, onRevocar, onReactivar
}) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o cédula..."
          className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 focus:border-emerald-500 rounded-xl text-sm font-semibold focus:outline-none"
        />
      </div>

      {cargando ? (
        <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-emerald-600" /></div>
      ) : (
        <div className="space-y-2">
          {clientes.map(c => {
            const badge = ESTADO[c.estado] || ESTADO.sin_cuenta
            const ocupado = procesando === c.alegraContactId

            return (
              <div key={c.alegraContactId} className="bg-white rounded-2xl border border-gray-100 p-3.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900 text-sm truncate">{c.nombre}</p>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase shrink-0 ${badge.clase}`}>
                      {badge.texto}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {c.identificacion || 'Sin cédula'}
                    {c.usuario ? ` · usuario: ${c.usuario}` : ''}
                    {c.pedidos > 0 ? ` · ${c.pedidos} pedido(s)` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onInvitar(c)}
                    disabled={ocupado}
                    title={c.estado === 'activo' ? 'Genera un enlace nuevo (la cuenta actual sigue funcionando)' : 'Generar enlace para crear la cuenta'}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                    {c.estado === 'sin_cuenta' ? 'Invitar' : 'Nuevo enlace'}
                  </button>

                  {c.estado === 'inactivo' ? (
                    <button
                      type="button"
                      onClick={() => onReactivar(c)}
                      title="Devolverle el acceso"
                      className="p-2 rounded-xl border-2 border-gray-200 hover:border-emerald-400 text-gray-400 hover:text-emerald-600"
                    >
                      <RotateCcw size={14} />
                    </button>
                  ) : c.estado !== 'sin_cuenta' && (
                    <button
                      type="button"
                      onClick={() => onRevocar(c)}
                      title="Quitarle el acceso"
                      className="p-2 rounded-xl border-2 border-gray-200 hover:border-red-300 text-gray-400 hover:text-red-600"
                    >
                      <Ban size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
