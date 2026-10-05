import { useState } from 'react'
import { Users, ClipboardList, Tablet, Contact, Map } from 'lucide-react'
import { useRutas } from '../hooks/useRutas'
import VistaRutas from '../components/clientes/VistaRutas'
import { useToast } from '../hooks/useToast'
import { useDialog } from '../hooks/useDialog'
import { useClientesPortal } from '../hooks/useClientesPortal'
import { useClientes } from '../hooks/useClientes'
import ToastContainer from '../components/ToastContainer'
import ConfirmModal from '../components/ConfirmModal'
import ListaPedidos from '../components/clientes/ListaPedidos'
import DispositivosAgente from '../components/clientes/DispositivosAgente'
import ListaCuentas from '../components/clientes/ListaCuentas'
import ListaClientes from '../components/clientes/ListaClientes'
import ModalCliente from '../components/clientes/ModalCliente'
import FichaCliente from '../components/clientes/FichaCliente'
import ModalInvitacion from '../components/clientes/ModalInvitacion'
import ModalEnviarWhatsApp from '../components/whatsapp/ModalEnviarWhatsApp'
import { mensajePedido } from '../utils/mensajesWhatsApp'
import api from '../services/api'

/**
 * Clientes: las fichas, las cuentas del portal y los pedidos que entraron por
 * ahí.
 *
 * Fichas y Rutas separan datos y recorridos de pedidos, portal y tablets.
 * Los pedidos pendientes conservan su contador para el trabajo diario.
 *
 * "Fichas" son los datos del cliente (rama independencia-alegra): antes vivían
 * en Alegra y no había forma de crearlos ni corregirlos desde el sistema.
 * "Cuentas" es otra cosa: quién puede entrar al portal.
 */
export default function Clientes() {
  const { toasts, showToast, removeToast } = useToast()
  const { confirm, dialogProps } = useDialog()
  const fichas = useClientes({ showToast, confirm })
  const rutas = useRutas({ showToast })

  const {
    vista, setVista,
    clientes, cargandoClientes,
    pedidos, cargandoPedidos, filtroPedidos, setFiltroPedidos,
    busqueda, setBusqueda,
    procesando, invitacion, setInvitacion,
    generarInvitacion, revocar, reactivar, facturar, rechazar
  } = useClientesPortal({ showToast, confirm })

  // El pedido que se está por avisar al cliente por WhatsApp.
  const [avisando, setAvisando] = useState(null)

  // La ficha abierta. Es un id de cliente, que nunca es null, así que null
  // sirve de "ninguna" sin el choque que tuvo Cuentas por Cobrar.
  const [fichaAbierta, setFichaAbierta] = useState(null)

  const pendientes = pedidos.filter(p => p.estado === 'pendiente').length

  const TABS = [
    { id: 'fichas', texto: 'Clientes', icono: Contact, contador: 0 },
    { id: 'rutas', texto: 'Rutas', icono: Map, contador: 0 },
    { id: 'pedidos', texto: 'Pedidos', icono: ClipboardList, contador: filtroPedidos === 'pendiente' ? pendientes : 0 },
    { id: 'clientes', texto: 'Cuentas', icono: Users, contador: 0 },
    { id: 'dispositivos', texto: 'Tablets del agente', icono: Tablet, contador: 0 }
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-neutro-900">Clientes</h1>
        <p className="text-sm text-neutro-500 mt-0.5">
          Fichas y recorridos de clientes, pedidos y acceso al portal.
        </p>
      </div>

      {/* Las cinco vistas se acomodan en varias líneas en el teléfono. */}
      <div className="flex flex-wrap gap-2">
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

      {vista === 'rutas' ? (
        <VistaRutas modelo={rutas} confirm={confirm}
          onAbrirCliente={id => { setFichaAbierta(id); setVista('fichas') }}
          onAsignarClientes={() => { setFichaAbierta(null); fichas.setRutaId('sin-ruta'); setVista('fichas') }} />
      ) : vista === 'dispositivos' ? (
        <DispositivosAgente />
      ) : vista === 'fichas' ? (
        fichaAbierta ? (
          <FichaCliente
            clienteId={fichaAbierta}
            revision={fichas.revisionFicha}
            onVolver={() => setFichaAbierta(null)}
            onEditar={fichas.setEditando}
          />
        ) : (
        <ListaClientes
          clientes={fichas.clientes}
          cargando={fichas.cargando}
          busqueda={fichas.busqueda}
          setBusqueda={fichas.setBusqueda}
          estado={fichas.estado}
          rutas={rutas.rutas} rutaId={fichas.rutaId} setRutaId={fichas.setRutaId}
          setEstado={fichas.setEstado}
          paginacion={fichas.paginacion}
          pagina={fichas.pagina}
          setPagina={fichas.setPagina}
          procesando={fichas.procesando}
          onNuevo={() => fichas.setEditando({})}
          onEditar={fichas.setEditando}
          onCambiarEstado={async cliente => { await fichas.cambiarEstado(cliente); await rutas.refrescar() }}
          onAbrir={(c) => setFichaAbierta(c.id)}
        />
        )
      ) : vista === 'pedidos' ? (
        <ListaPedidos
          pedidos={pedidos}
          cargando={cargandoPedidos}
          filtro={filtroPedidos}
          setFiltro={setFiltroPedidos}
          procesando={procesando}
          onFacturar={facturar}
          onRechazar={rechazar}
          onAvisar={setAvisando}
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

      {fichas.editando && (
        <ModalCliente
          cliente={fichas.editando.id ? fichas.editando : null}
          plazos={fichas.plazos}
          rutas={rutas.rutas}
          guardando={fichas.guardando}
          onGuardar={async datos => { const ok = await fichas.guardar(datos); if (ok) await rutas.refrescar(); return ok }}
          onCerrar={() => fichas.setEditando(null)}
        />
      )}

      {invitacion && <ModalInvitacion invitacion={invitacion} onCerrar={() => setInvitacion(null)} />}

      {avisando && (
        <ModalEnviarWhatsApp
          titulo={`Avisarle del pedido #${avisando.id}`}
          subtitulo={avisando.clienteNombre}
          clienteId={avisando.clienteId}
          documento={{ tipo: 'pedido', referencia: String(avisando.id) }}
          mensajeInicial={mensajePedido({
            numero: avisando.id,
            cliente: avisando.clienteNombre,
            // El listado del personal trae `estado`, no la etapa que ve el
            // cliente: se traduce acá para que el mensaje diga lo mismo que
            // el seguimiento del portal.
            etapa: avisando.estado === 'facturado' ? 'en_preparacion'
              : avisando.estado === 'rechazado' ? 'no_procesado'
              : 'en_revision',
            enlace: `${window.location.origin}/portal/pedidos`
          })}
          onEnviar={async ({ telefono, mensaje }) => {
            const { data } = await api.post(`/portal-clientes/pedidos/${avisando.id}/whatsapp`, { telefono, mensaje })
            return data.data
          }}
          onCerrar={() => setAvisando(null)}
        />
      )}

      <ConfirmModal {...dialogProps} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
