import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Loader2, ArrowLeft, LogOut, Package } from 'lucide-react'
import { usePortalCliente } from '../../contexts/PortalClienteContext'
import apiPortal from '../../services/apiPortal'
import { formatearColones } from '../../utils/catalogoClientesUtils'

const ESTADO = {
  pendiente: { texto: 'En revisión', clase: 'bg-amber-100 text-amber-700' },
  facturado: { texto: 'Facturado', clase: 'bg-emerald-100 text-emerald-700' },
  rechazado: { texto: 'Rechazado', clase: 'bg-red-100 text-red-700' }
}

export default function PortalPedidos() {
  const { cliente, cargando: cargandoSesion, salir } = usePortalCliente()
  const [pedidos, setPedidos] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!cliente) return
    apiPortal.get('/portal/pedidos')
      .then(({ data }) => setPedidos(data.data))
      .catch(() => {})
      .finally(() => setCargando(false))
  }, [cliente])

  if (cargandoSesion) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-emerald-600" />
      </div>
    )
  }

  if (!cliente) return <Navigate to="/portal/ingresar" replace state={{ destino: '/portal/pedidos' }} />

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/catalogo" className="flex items-center gap-1.5 text-sm font-bold text-gray-700 hover:text-emerald-700">
            <ArrowLeft size={16} />
            Catálogo
          </Link>
          <Link to="/portal/facturas" className="text-[12px] font-semibold text-slate-500 hover:text-emerald-700 shrink-0">
            Mis facturas
          </Link>
          <div className="text-right min-w-0">
            <p className="text-xs font-bold text-gray-900 truncate">{cliente.nombre}</p>
            <button type="button" onClick={salir} className="text-[11px] text-gray-400 hover:text-red-600 font-semibold flex items-center gap-1 ml-auto">
              <LogOut size={11} />
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        <h1 className="text-lg font-extrabold text-gray-900 mb-4">Sus pedidos</h1>

        {cargando ? (
          <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-emerald-600" /></div>
        ) : pedidos.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 p-10 text-center text-gray-400 flex flex-col items-center gap-3">
            <Package size={36} className="text-gray-200" />
            <p className="text-sm">Todavía no ha hecho ningún pedido.</p>
            <Link to="/catalogo" className="text-sm font-bold text-emerald-700 hover:underline">Ir al catálogo</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {pedidos.map(p => {
              const badge = ESTADO[p.estado] || ESTADO.pendiente
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm">Pedido #{p.id}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(p.creadoEn).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {' · '}{p.lineas} producto(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[10px] font-extrabold px-2 py-1 rounded-md uppercase ${badge.clase}`}>
                        {badge.texto}
                      </span>
                      <span className="font-extrabold text-gray-900">{formatearColones(p.total)}</span>
                    </div>
                  </div>

                  {p.numeroFactura && (
                    <p className="text-xs text-emerald-700 font-semibold mt-2">Factura {p.numeroFactura}</p>
                  )}
                  {p.motivoRechazo && (
                    <p className="text-xs text-red-600 mt-2">{p.motivoRechazo}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
