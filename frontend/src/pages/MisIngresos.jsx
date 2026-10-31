import { PiggyBank, Timer, Banknote, RefreshCw, UserPlus } from 'lucide-react'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'
import Boton from '../components/ui/Boton'
import TarjetasResumen from '../components/pagos/TarjetasResumen'
import TarjetaJornada from '../components/ingresos/TarjetaJornada'
import SelectorQuincena from '../components/ingresos/SelectorQuincena'
import HorasDeLaQuincena from '../components/ingresos/HorasDeLaQuincena'
import ClientesNuevos from '../components/ingresos/ClientesNuevos'
import { useMisIngresos } from '../hooks/useMisIngresos'
import { useJornada } from '../hooks/useJornada'
import { colones } from '../utils/colones'
import { duracion } from '../utils/ingresosTexto'

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
  const conHoras = q ? q.dias.filter(d => d.minutos > 0).length : 0
  const tarjetas = q ? [
    { clave: 'horas', titulo: 'Horas trabajadas', icono: Timer, valor: duracion(q.minutos), tono: 'neutro',
      pie: jornada.estado?.abierta && q.periodo.enCurso ? 'La jornada abierta suma al terminarla' : `${conHoras} ${conHoras === 1 ? 'día' : 'días'} con horas` },
    { clave: 'porhoras', titulo: 'Ganado por horas', icono: Banknote, valor: colones(q.porHoras), tono: 'exito',
      pie: `${colones(tarifas.pagoHora)} por hora` },
    { clave: 'nuevos', titulo: 'Clientes nuevos', icono: UserPlus, valor: colones(q.clientesNuevos.monto), tono: 'exito',
      pie: `${q.clientesNuevos.cuentan.length} con primera compra · ${q.clientesNuevos.esperando.length} por comprar` }
  ] : []

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <EncabezadoPagina icono={PiggyBank} titulo="Mis ingresos" descripcion="Tus horas y lo que vas ganando en la quincena."
        acciones={<Boton variante="secundario" icono={RefreshCw} cargando={ingresos.cargando} onClick={ingresos.recargar}>Actualizar</Boton>} />

      {jornada.estado?.empleado !== false && <TarjetaJornada jornada={jornada} />}
      {ingresos.error && <p role="alert" className="rounded-xl bg-peligro-50 p-4 text-sm text-peligro-700">{ingresos.error}</p>}

      {q && (
        <>
          <SelectorQuincena periodo={q.periodo} onElegir={ingresos.setPeriodo} />
          <TarjetasResumen compacta tarjetas={tarjetas} />
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
