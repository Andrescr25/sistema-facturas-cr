import { useState } from 'react'
import { Users, Tablet } from 'lucide-react'
import NavegacionClientes from '../components/clientes/NavegacionClientes'
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
 * Portal y tablets comparten Accesos para apartar su administración del
 * directorio y del trabajo de rutas.
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
    pedidos, cargandoPedidos, errorPedidos, actualizarPedidos, filtroPedidos, setFiltroPedidos, contextoPedidos, setContextoPedidos,
    busqueda, setBusqueda,
    procesando, invitacion, setInvitacion,
    generarInvitacion, revocar, reactivar, facturar, rechazar
  } = useClientesPortal({ showToast, confirm })

  // El pedido que se está por avisar al cliente por WhatsApp.
  const [avisando, setAvisando] = useState(null)

  // La ficha abierta. Es un id de cliente, que nunca es null, así que null
  // sirve de "ninguna" sin el choque que tuvo Cuentas por Cobrar.
  const [fichaAbierta, setFichaAbierta] = useState(null)
  const [origenFicha, setOrigenFicha] = useState('fichas')
  const abrirFicha = (id, origen = 'fichas') => { setOrigenFicha(origen); setFichaAbierta(id); setVista('fichas') }
  const enFicha = vista === 'fichas' && fichaAbierta !== null
  // Rutas también tiene una pantalla de trabajo propia (elegir los clientes
  // de una ruta): mientras está abierta, la cabecera y las pestañas se van.
  const [rutasEnfoque, setRutasEnfoque] = useState(false)
  const sinCabecera = enFicha || (vista === 'rutas' && rutasEnfoque)
  // El contador pertenece a los pedidos cargados de esta selección; nunca
  // presentar el filtro de una ruta/semana como el total general.
  const pendientes = !cargandoPedidos && !errorPedidos && filtroPedidos === 'pendiente' ? pedidos.length : 0

  return (
    <div className="space-y-5">
      {!sinCabecera && <>
        <div>
          <h1 className="text-3xl font-bold text-neutro-900">Clientes</h1>
          <p className="mt-2 text-base text-neutro-500">Organizá tus clientes y el trabajo de cada ruta.</p>
        </div>
        <NavegacionClientes vista={vista} onCambiar={setVista} pendientes={pendientes} />
      </>}

      {['clientes', 'dispositivos'].includes(vista) && <section className="space-y-4">
        <div><h2 className="text-xl font-bold text-neutro-900">Accesos al sistema</h2>
          <p className="mt-1 text-sm text-neutro-500">Administrá quién puede entrar al portal y las tablets de preventa.</p></div>
        <nav aria-label="Administración de accesos" className="flex flex-wrap gap-3">
          {[['clientes', 'Cuentas del portal', Users], ['dispositivos', 'Tablets del agente', Tablet]].map(([id, titulo, Icono]) =>
            <button key={id} type="button" onClick={() => setVista(id)} aria-pressed={vista === id}
              className={`inline-flex min-h-12 items-center gap-2 rounded-xl px-4 text-sm font-bold ${vista === id ? 'bg-primario-800 text-white' : 'border border-neutro-200 bg-white text-neutro-600'}`}>
              <Icono size={19} />{titulo}
            </button>)}
        </nav>
      </section>}

      {vista === 'rutas' ? (
        <VistaRutas modelo={rutas} confirm={confirm}
          onAbrirCliente={id => abrirFicha(id, 'rutas')} onEnfoque={setRutasEnfoque} />
      ) : vista === 'dispositivos' ? (
        <DispositivosAgente />
      ) : vista === 'fichas' ? (
        fichaAbierta ? (
          <FichaCliente
            key={fichaAbierta}
            clienteId={fichaAbierta}
            revision={fichas.revisionFicha}
            onVolver={() => { setFichaAbierta(null); setVista(origenFicha) }}
            textoVolver={origenFicha === 'rutas' ? 'Volver a Rutas' : 'Volver a Clientes'}
            onEditar={fichas.setEditando}
          />
        ) : (
        <ListaClientes
          clientes={fichas.clientes}
          cargando={fichas.cargando}
          error={fichas.error} onActualizar={fichas.refrescar}
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
          onAbrir={c => abrirFicha(c.id)}
        />
        )
      ) : vista === 'pedidos' ? (
        <ListaPedidos
          rutas={rutas.rutas} ciclos={rutas.ciclos}
          contexto={contextoPedidos} setContexto={setContextoPedidos}
          pedidos={pedidos}
          cargando={cargandoPedidos}
          error={errorPedidos} onActualizar={actualizarPedidos}
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
          confirm={confirm}
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
