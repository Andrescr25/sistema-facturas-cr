import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, RefreshCw, UserPlus, ListChecks, Map as IconoRuta } from 'lucide-react'
import { useAgendaPreventa } from '../hooks/useAgendaPreventa'
import { usePlanDelDia } from '../hooks/usePlanDelDia'
import Boton from '../components/ui/Boton'
import Pestanas from '../components/ui/Pestanas'
import FiltrosAgenda from '../components/preventa/FiltrosAgenda'
import ListaAgenda from '../components/preventa/ListaAgenda'
import PlanDelDia from '../components/preventa/PlanDelDia'
import DetalleVisita from '../components/preventa/DetalleVisita'
import RecordatorioJornada from '../components/preventa/RecordatorioJornada'
import ModalClienteNuevo from '../components/preventa/ModalClienteNuevo'
import { useAuth } from '../contexts/AuthContext'
import { visibleEnMenu } from '../utils/modulos'
import { fechaEnPalabras } from '../utils/fechaCR'

/**
 * Preventa. Desde el 2026-11-01 abre en «Mi día»: el plan de visitas que el
 * agente arma y ordena a su gusto (el usuario: «que este módulo de Preventa sea
 * más dinámico, que el agente lo edite a su gusto»). «Toda la ruta» es la
 * agenda de siempre. La pestaña va en la dirección (`?vista=ruta`), así al
 * volver de Facturar vuelve a donde estaba. La visita se abre igual desde las dos.
 */
export default function Preventa() {
  const agenda = useAgendaPreventa()
  const dia = usePlanDelDia()
  const { usuario } = useAuth()
  const [parametros, setParametros] = useSearchParams()
  const vista = parametros.get('vista') === 'ruta' ? 'ruta' : 'dia'
  const [visitaDelDia, setVisitaDelDia] = useState(null)
  const [nuevo, setNuevo] = useState(false)
  // «Cliente nuevo» va en una ruta de verdad: no en «Clientes sin ruta».
  const ruta = agenda.rutas.find(r => String(r.id) === String(agenda.rutaId))
  const cambiarVista = (v) => {
    setVisitaDelDia(null); agenda.seleccionar(null)
    setParametros(actuales => {
      const nuevos = new URLSearchParams(actuales)
      if (v === 'ruta') nuevos.set('vista', 'ruta'); else nuevos.delete('vista')
      return nuevos
    })
  }
  const recargarTodo = () => { dia.recargar(); agenda.recargar(); agenda.recargarRutas() }

  const clienteAbierto = vista === 'dia'
    ? dia.plan?.clientes.find(x => x.cliente.id === visitaDelDia)?.cliente || null
    : agenda.seleccionado
  const cerrarVisita = () => (vista === 'dia' ? setVisitaDelDia(null) : agenda.seleccionar(null))

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-neutro-900"><CalendarDays className="text-primario-500" />Preventa</h1>
          <p className="mt-1 text-neutro-500">{vista === 'dia' ? `Tu día: ${fechaEnPalabras(dia.plan?.hoy || agenda.hoy, { weekday: 'long', day: 'numeric', month: 'long' })}.` : 'Agenda de visitas por cliente y ruta.'}</p>
        </div>
        {!clienteAbierto && (
          <div className="flex flex-wrap gap-2">
            {ruta && <Boton icono={UserPlus} onClick={() => setNuevo(true)}>Cliente nuevo</Boton>}
            <Boton variante="secundario" icono={RefreshCw} cargando={dia.cargando || agenda.cargando} onClick={recargarTodo}>Actualizar</Boton>
          </div>
        )}
      </div>
      {visibleEnMenu(usuario, '/ingresos') && !clienteAbierto && <RecordatorioJornada />}
      {!clienteAbierto && (
        <Pestanas activa={vista} onCambiar={cambiarVista} pestanas={[
          { clave: 'dia', texto: 'Mi día', icono: ListChecks, contador: dia.plan ? dia.plan.clientes.length - dia.plan.visitados : 0 },
          { clave: 'ruta', texto: 'Toda la ruta', icono: IconoRuta }
        ]} />
      )}
      {agenda.aviso && <p role="status" className="rounded-xl bg-nota-50 p-4 text-sm text-nota-700">{agenda.aviso}</p>}

      {clienteAbierto ? (
        <DetalleVisita cliente={clienteAbierto} hoy={vista === 'dia' ? dia.plan.hoy : agenda.hoy} vista={vista} volver={cerrarVisita}
          alGuardarVisita={(cliente, visita) => {
            cerrarVisita()
            agenda.avisar(`${cliente.nombre} quedó para el ${fechaEnPalabras(visita.proxima_fecha, { day: 'numeric', month: 'long' })}.`)
            dia.recargar(); agenda.recargar()
          }}
          alGuardarFicha={(mensaje) => { agenda.avisar(mensaje); dia.recargar(); agenda.recargar() }} />
      ) : vista === 'dia' ? (
        <PlanDelDia dia={dia} rutas={agenda.rutas} rutaActual={agenda.rutaId} onVer={setVisitaDelDia} />
      ) : (
        <>
          <FiltrosAgenda agenda={agenda} />
          {agenda.error && <div role="alert" className="card space-y-3 p-5 text-peligro-700">
            <p>{agenda.error}</p><Boton variante="secundario" onClick={agenda.recargar}>Reintentar agenda</Boton>
          </div>}
          {agenda.cargando && <p className="p-5 text-neutro-500" role="status">Consultando visitas…</p>}
          {!agenda.rutaId && <div className="card p-8 text-center">
            <h2 className="text-lg font-bold text-neutro-900">Elegí una ruta para empezar</h2>
            <p className="mt-2 text-neutro-500">Verás a todos sus clientes, incluso quienes todavía no tienen una próxima visita definida.</p>
          </div>}
          {agenda.rutaId && !agenda.cargando && !agenda.error && <ListaAgenda agenda={agenda} />}
        </>
      )}

      {nuevo && ruta && <ModalClienteNuevo ruta={ruta} onCerrar={() => setNuevo(false)} onGuardado={(cliente) => {
        setNuevo(false)
        agenda.avisar(`${cliente.nombre} quedó en ${ruta.nombre}, al final del recorrido${vista === 'dia' ? ', y en tu día' : ''}.`)
        // Lo registró parado en el local: en «Mi día» queda para visitarlo.
        if (vista === 'dia') dia.agregar([cliente.id])
        agenda.recargar()
      }} />}
    </div>
  )
}
