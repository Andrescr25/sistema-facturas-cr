import { Users, ClipboardList, Tablet } from 'lucide-react'
import { useToast } from '../hooks/useToast'
import { useDialog } from '../hooks/useDialog'
import { useClientesPortal } from '../hooks/useClientesPortal'
import ToastContainer from '../components/ToastContainer'
import ConfirmModal from '../components/ConfirmModal'
import ListaPedidos from '../components/clientes/ListaPedidos'
import DispositivosAgente from '../components/clientes/DispositivosAgente'
import ListaCuentas from '../components/clientes/ListaCuentas'
import ModalInvitacion from '../components/clientes/ModalInvitacion'

/**
 * Clientes: las cuentas del portal y los pedidos que entraron por ahí.
 *
 * Arranca en Pedidos y no en Cuentas a propósito: lo que hay que atender a
 * diario son los pedidos esperando factura; invitar clientes se hace una vez
 * por cliente y después casi nunca.
 */
export default function Clientes() {
  const { toasts, showToast, removeToast } = useToast()
  const { confirm, dialogProps } = useDialog()

  const {
    vista, setVista,
    clientes, cargandoClientes,
    pedidos, cargandoPedidos, filtroPedidos, setFiltroPedidos,
    busqueda, setBusqueda,
    procesando, invitacion, setInvitacion,
    generarInvitacion, revocar, reactivar, facturar, rechazar
  } = useClientesPortal({ showToast, confirm })

  const pendientes = pedidos.filter(p => p.estado === 'pendiente').length

  const TABS = [
    { id: 'pedidos', texto: 'Pedidos', icono: ClipboardList, contador: filtroPedidos === 'pendiente' ? pendientes : 0 },
    { id: 'clientes', texto: 'Cuentas', icono: Users, contador: 0 },
    { id: 'dispositivos', texto: 'Tablets del agente', icono: Tablet, contador: 0 }
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-neutro-900">Clientes</h1>
        <p className="text-sm text-neutro-500 mt-0.5">
          Pedidos que entran desde el portal y desde la calle, y qué tablets tienen pedidos sin mandar.
        </p>
      </div>

      <div className="flex gap-2">
        {TABS.map(t => {
          const Icono = t.icono
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setVista(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors ${
                vista === t.id ? 'bg-exito-600 text-white' : 'bg-white border-2 border-neutro-200 text-neutro-600'
              }`}
            >
              <Icono size={15} />
              {t.texto}
              {t.contador > 0 && (
                <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                  vista === t.id ? 'bg-white/25' : 'bg-alerta-100 text-alerta-700'
                }`}>
                  {t.contador}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {vista === 'dispositivos' ? (
        <DispositivosAgente />
      ) : vista === 'pedidos' ? (
        <ListaPedidos
          pedidos={pedidos}
          cargando={cargandoPedidos}
          filtro={filtroPedidos}
          setFiltro={setFiltroPedidos}
          procesando={procesando}
          onFacturar={facturar}
          onRechazar={rechazar}
        />
      ) : (
        <ListaCuentas
          clientes={clientes}
          cargando={cargandoClientes}
          busqueda={busqueda}
          setBusqueda={setBusqueda}
          procesando={procesando}
          onInvitar={generarInvitacion}
          onRevocar={revocar}
          onReactivar={reactivar}
        />
      )}

      {invitacion && <ModalInvitacion invitacion={invitacion} onCerrar={() => setInvitacion(null)} />}

      <ConfirmModal {...dialogProps} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
