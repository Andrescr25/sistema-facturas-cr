import { PiggyBank, Timer, RefreshCw } from 'lucide-react'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'
import Boton from '../components/ui/Boton'
import TarjetaJornada from '../components/ingresos/TarjetaJornada'
import SelectorQuincena from '../components/ingresos/SelectorQuincena'
import HorasDeLaQuincena from '../components/ingresos/HorasDeLaQuincena'
import ClientesNuevos from '../components/ingresos/ClientesNuevos'
import ResumenQuincena from '../components/ingresos/ResumenQuincena'
import ComisionDelMes from '../components/ingresos/ComisionDelMes'
import { useMisIngresos } from '../hooks/useMisIngresos'
import { useJornada } from '../hooks/useJornada'

/**
 * «Mis ingresos» (2026-10-30). El usuario: que el agente vea cuánto ha ganado,
 * «como para motivarlo»: sus horas por día y lo que lleva en la quincena. Ve
 * SOLO lo suyo; el servidor lee la sesión, no lo que mande la pantalla.
 */
export default function MisIngresos() {
  const ingresos = useMisIngresos()
  const jornada = useJornada({ onCambio: ingresos.recargar })
  const q = ingresos.datos?.quincena
  const tarifas = ingresos.datos?.ficha.tarifas
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <EncabezadoPagina icono={PiggyBank} titulo="Mis ingresos" descripcion="Tus horas y lo que vas ganando en la quincena."
        acciones={<Boton variante="secundario" icono={RefreshCw} cargando={ingresos.cargando} onClick={ingresos.recargar}>Actualizar</Boton>} />

      {jornada.estado?.empleado !== false && <TarjetaJornada jornada={jornada} />}
      {ingresos.error && <p role="alert" className="rounded-xl bg-peligro-50 p-4 text-sm text-peligro-700">{ingresos.error}</p>}

      {q && (
        <>
          <SelectorQuincena periodo={q.periodo} onElegir={ingresos.setPeriodo} />
          <ResumenQuincena quincena={q} tarifas={tarifas} titulo={q.periodo.enCurso ? 'Llevás ganado en esta quincena' : 'Ganaste en esta quincena'}
            nota={jornada.estado?.abierta ? 'La jornada abierta suma al terminarla.' : ''} />
          <ComisionDelMes comision={q.comision} />
          <section aria-label="Horas por día" className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-neutro-900"><Timer size={18} className="text-primario-500" />Horas por día</h2>
            <HorasDeLaQuincena dias={q.dias} />
          </section>
          <ClientesNuevos clientes={q.clientesNuevos} incentivo={tarifas.incentivoClienteNuevo} />
        </>
      )}
    </div>
  )
}
