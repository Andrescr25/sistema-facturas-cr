import { useState } from 'react'
import { CalendarDays, RefreshCw, UserPlus } from 'lucide-react'
import { useAgendaPreventa } from '../hooks/useAgendaPreventa'
import Boton from '../components/ui/Boton'
import FiltrosAgenda from '../components/preventa/FiltrosAgenda'
import ListaAgenda from '../components/preventa/ListaAgenda'
import DetalleVisita from '../components/preventa/DetalleVisita'
import RecordatorioJornada from '../components/preventa/RecordatorioJornada'
import ModalClienteNuevo from '../components/preventa/ModalClienteNuevo'
import { useAuth } from '../contexts/AuthContext'
import { visibleEnMenu } from '../utils/modulos'
import { fechaEnPalabras } from '../utils/fechaCR'

export default function Preventa() {
  const agenda = useAgendaPreventa()
  const { usuario } = useAuth()
  const [nuevo, setNuevo] = useState(false)
  // «Cliente nuevo» va en una ruta de verdad: no en «Clientes sin ruta».
  const ruta = agenda.rutas.find(r => String(r.id) === String(agenda.rutaId))
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-neutro-900"><CalendarDays className="text-primario-500" />Preventa</h1>
          <p className="mt-1 text-neutro-500">Agenda de visitas por cliente y ruta.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ruta && !agenda.seleccionId && <Boton icono={UserPlus} onClick={() => setNuevo(true)}>Cliente nuevo</Boton>}
          <Boton variante="secundario" icono={RefreshCw} cargando={agenda.cargando} disabled={!agenda.rutaId}
            onClick={() => { agenda.recargar(); agenda.recargarRutas() }}>Actualizar agenda</Boton>
        </div>
      </div>
      {visibleEnMenu(usuario, '/ingresos') && !agenda.seleccionId && <RecordatorioJornada />}
      {!agenda.seleccionId && <FiltrosAgenda agenda={agenda} />}
      {agenda.aviso && <p role="status" className="rounded-xl bg-nota-50 p-4 text-sm text-nota-700">{agenda.aviso}</p>}
      {agenda.error && <div role="alert" className="card space-y-3 p-5 text-peligro-700">
        <p>{agenda.error}</p><Boton variante="secundario" onClick={agenda.recargar}>Reintentar agenda</Boton>
        {agenda.seleccionId && <Boton variante="fantasma" onClick={() => agenda.seleccionar(null)}>Volver a la agenda</Boton>}
      </div>}
      {agenda.cargando && <p className="p-5 text-neutro-500" role="status">Consultando visitas…</p>}
      {!agenda.rutaId && <div className="card p-8 text-center">
        <h2 className="text-lg font-bold text-neutro-900">Elegí una ruta para empezar</h2>
        <p className="mt-2 text-neutro-500">Verás a todos sus clientes, incluso quienes todavía no tienen una próxima visita definida.</p>
      </div>}
      {agenda.rutaId && !agenda.cargando && !agenda.error && (agenda.seleccionado
        ? <DetalleVisita cliente={agenda.seleccionado} hoy={agenda.hoy} volver={() => agenda.seleccionar(null)}
          alGuardarVisita={(cliente, visita) => {
            agenda.seleccionar(null)
            agenda.avisar(`${cliente.nombre} quedó para el ${fechaEnPalabras(visita.proxima_fecha, { day: 'numeric', month: 'long' })}.`)
            agenda.recargar()
          }}
          alGuardarFicha={(mensaje) => { agenda.avisar(mensaje); agenda.recargar() }} />
        : <ListaAgenda agenda={agenda} />)}
      {nuevo && ruta && <ModalClienteNuevo ruta={ruta} onCerrar={() => setNuevo(false)} onGuardado={(cliente) => {
        setNuevo(false)
        agenda.avisar(`${cliente.nombre} quedó en ${ruta.nombre}, al final del recorrido.`)
        agenda.recargar()
      }} />}
    </div>
  )
}
