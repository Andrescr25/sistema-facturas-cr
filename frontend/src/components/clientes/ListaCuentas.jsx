import { Loader2, Link2, Ban, RotateCcw, Search } from 'lucide-react'

const ESTADO = {
  sin_cuenta: { texto: 'Sin cuenta', clase: 'bg-neutro-100 text-neutro-500' },
  invitado: { texto: 'Invitado', clase: 'bg-primario-100 text-primario-700' },
  vencido: { texto: 'Enlace vencido', clase: 'bg-alerta-100 text-alerta-700' },
  activo: { texto: 'Activo', clase: 'bg-exito-100 text-exito-700' },
  inactivo: { texto: 'Sin acceso', clase: 'bg-peligro-100 text-peligro-700' }
}

export default function ListaCuentas({
  clientes, cargando, busqueda, setBusqueda, procesando,
  onInvitar, onRevocar, onReactivar
}) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-300" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o cédula..."
          aria-label="Buscar cuentas del portal" className="w-full min-h-12 pl-9 pr-3 py-2.5 border-2 border-neutro-200 focus:border-primario-500 rounded-xl text-sm font-semibold focus:outline-none"
        />
      </div>

      {cargando ? (
        <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-exito-600" /></div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {clientes.map(c => {
            const badge = ESTADO[c.estado] || ESTADO.sin_cuenta
            const ocupado = procesando === c.clienteId

            return (
              <div key={c.clienteId} className="bg-white rounded-2xl border border-neutro-200 p-5 flex flex-col justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-neutro-900 text-lg break-words">{c.nombre}</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md uppercase shrink-0 ${badge.clase}`}>
                      {badge.texto}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-sm text-neutro-500">
                    {c.identificacion || 'Sin cédula'}
                    {c.usuario ? ` · usuario: ${c.usuario}` : ''}
                    {c.pedidos > 0 ? ` · ${c.pedidos} pedido(s)` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-neutro-100 pt-4">
                  <button
                    type="button"
                    onClick={() => onInvitar(c)}
                    disabled={ocupado}
                    title={c.estado === 'activo' ? 'Genera un enlace nuevo (la cuenta actual sigue funcionando)' : 'Generar enlace para crear la cuenta'}
                    className="min-h-11 px-3 py-2 rounded-xl bg-primario-800 hover:bg-primario-900 disabled:bg-neutro-200 text-white text-sm font-bold flex items-center gap-1.5 transition-colors"
                  >
                    {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                    {c.estado === 'sin_cuenta' ? 'Invitar' : 'Nuevo enlace'}
                  </button>

                  {c.estado === 'inactivo' ? (
                    <button
                      type="button"
                      onClick={() => onReactivar(c)}
                      title="Devolverle el acceso"
                      aria-label={`Devolver acceso a ${c.nombre}`}
                      className="inline-flex min-h-11 items-center gap-2 px-3 rounded-xl border-2 border-neutro-200 hover:border-exito-400 text-neutro-400 hover:text-exito-600"
                    >
                      <RotateCcw size={16} /> Reactivar
                    </button>
                  ) : c.estado !== 'sin_cuenta' && (
                    <button
                      type="button"
                      onClick={() => onRevocar(c)}
                      title="Quitarle el acceso"
                      aria-label={`Quitar acceso a ${c.nombre}`}
                      className="inline-flex min-h-11 items-center gap-2 px-3 rounded-xl border-2 border-neutro-200 hover:border-peligro-300 text-neutro-400 hover:text-peligro-600"
                    >
                      <Ban size={16} /> Quitar acceso
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
