import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Loader2, ArrowLeft, LogOut, Package } from 'lucide-react'
import { usePortalCliente } from '../../contexts/PortalClienteContext'
import apiPortal from '../../services/apiPortal'
import { formatearColones } from '../../utils/catalogoClientesUtils'
import SeguimientoPedido, { ETIQUETA, CLASE_CHIP } from '../../components/catalogo-clientes/SeguimientoPedido'

export default function PortalPedidos() {
  const { cliente, cargando: cargandoSesion, salir } = usePortalCliente()
  const [pedidos, setPedidos] = useState([])
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(() => {
    return apiPortal.get('/portal/pedidos')
      .then(({ data }) => setPedidos(data.data))
      .catch(() => {})
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    if (!cliente) return
    cargar()
  }, [cliente, cargar])

  // Se refresca cuando el cliente vuelve a la pestaña, no con un temporizador:
  // la etapa la mueve alguien de la casa cada tantas horas, así que consultar
  // cada N segundos sería gastarle los datos del teléfono para nada. Al
  // volver a mirar, ve el estado de ese momento.
  useEffect(() => {
    if (!cliente) return
    const alVolver = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [cliente, cargar])

  if (cargandoSesion) {
    return (
      <div className="min-h-screen bg-neutro-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-cliente-600" />
      </div>
    )
  }

  if (!cliente) return <Navigate to="/portal/ingresar" replace state={{ destino: '/portal/pedidos' }} />

  return (
    <div className="min-h-screen bg-neutro-50">
      <header className="bg-white border-b border-neutro-100 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/catalogo" className="flex items-center gap-1.5 text-sm font-bold text-neutro-700 hover:text-cliente-700">
            <ArrowLeft size={16} />
            Catálogo
          </Link>
          <Link to="/portal/facturas" className="text-[12px] font-semibold text-neutro-500 hover:text-cliente-700 shrink-0">
            Mis facturas
          </Link>
          <div className="text-right min-w-0">
            <p className="text-xs font-bold text-neutro-900 truncate">{cliente.nombre}</p>
            <button type="button" onClick={salir} className="text-[11px] text-neutro-400 hover:text-peligro-600 font-semibold flex items-center gap-1 ml-auto">
              <LogOut size={11} />
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        <h1 className="text-lg font-extrabold text-neutro-900 mb-4">Sus pedidos</h1>

        {cargando ? (
          <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-cliente-600" /></div>
        ) : pedidos.length === 0 ? (
          <div className="bg-white rounded-3xl border border-neutro-100 p-10 text-center text-neutro-400 flex flex-col items-center gap-3">
            <Package size={36} className="text-neutro-200" />
            <p className="text-sm">Todavía no ha hecho ningún pedido.</p>
            <Link to="/catalogo" className="text-sm font-bold text-cliente-700 hover:underline">Ir al catálogo</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {pedidos.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-neutro-100 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-bold text-neutro-900 text-sm">Pedido #{p.id}</p>
                    <p className="text-xs text-neutro-400">
                      {new Date(p.creadoEn).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {' · '}{p.lineas} producto(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-[10px] font-extrabold px-2 py-1 rounded-md uppercase ${CLASE_CHIP[p.etapa] || CLASE_CHIP.en_revision}`}>
                      {ETIQUETA[p.etapa] || ETIQUETA.en_revision}
                    </span>
                    <span className="font-extrabold text-neutro-900">{formatearColones(p.total)}</span>
                  </div>
                </div>

                <div className="border-t border-neutro-100 pt-3">
                  <SeguimientoPedido
                    etapa={p.etapa}
                    seguimiento={p.seguimiento}
                    motivoRechazo={p.motivoRechazo}
                  />
                </div>

                {p.numeroFactura && (
                  <p className="text-xs text-cliente-700 font-semibold">Factura {p.numeroFactura}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
