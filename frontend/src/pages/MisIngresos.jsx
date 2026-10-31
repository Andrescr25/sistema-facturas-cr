import { useSearchParams } from 'react-router-dom'
import { PiggyBank, Timer, RefreshCw, Fuel, UserPlus, TrendingUp, Receipt, ArrowLeft } from 'lucide-react'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'
import Boton from '../components/ui/Boton'
import TarjetaJornada from '../components/ingresos/TarjetaJornada'
import TotalQuincena from '../components/ingresos/TotalQuincena'
import TarjetaIngreso from '../components/ingresos/TarjetaIngreso'
import HorasDeLaQuincena from '../components/ingresos/HorasDeLaQuincena'
import ClientesNuevos from '../components/ingresos/ClientesNuevos'
import ComisionDelMes from '../components/ingresos/ComisionDelMes'
import DeudaEmpleado from '../components/ingresos/DeudaEmpleado'
import PagosEmpleado from '../components/empleados/PagosEmpleado'
import { useMisIngresos } from '../hooks/useMisIngresos'
import { useJornada } from '../hooks/useJornada'
import { colones } from '../utils/colones'
import { duracion } from '../utils/ingresosTexto'
import { fechaEnPalabras } from '../utils/fechaCR'

const SECCIONES = ['dias', 'clientes', 'comision', 'pagos']
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

/**
 * «Mis ingresos» (2026-10-30). El usuario: que el agente vea cuánto ha ganado,
 * «como para motivarlo». Ve SOLO lo suyo; el servidor lee la sesión.
 *
 * Arriba lo de todos los días —la jornada y lo que lleva ganado en la
 * quincena— y abajo una tarjeta grande por cada parte; tocarla abre su
 * detalle (el usuario eligió «tarjetas → detalle», como Cuentas por Cobrar:
 * todo en una sola hoja quedaba disperso). El detalle abierto va en la
 * dirección (`?ver=`) para que el «atrás» del teléfono vuelva al inicio.
 */
export default function MisIngresos() {
  const ingresos = useMisIngresos()
  const jornada = useJornada({ onCambio: ingresos.recargar })
  const [parametros, setParametros] = useSearchParams()
  const ver = SECCIONES.includes(parametros.get('ver')) ? parametros.get('ver') : null
  const abrir = (seccion) => { setParametros(seccion ? { ver: seccion } : {}); window.scrollTo(0, 0) }
  const d = ingresos.datos
  const q = d?.quincena

  if (q && ver) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Boton variante="fantasma" icono={ArrowLeft} onClick={() => abrir(null)}>Mis ingresos</Boton>
          <span className="text-sm font-semibold text-neutro-500">{q.periodo.nombre}</span>
        </div>
        {ver === 'dias' && (
          <section aria-label="Horas y gasolina" className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-neutro-900"><Timer size={18} className="text-primario-500" />Horas y gasolina</h2>
            <p className="text-sm text-neutro-600">
              {duracion(q.minutos)} × {colones(q.tarifas.pagoHora)} = <b>{colones(q.porHoras)}</b> · Gasolina {plural(q.gasolina.dias.length, 'día', 'días')} = <b>{colones(q.gasolina.monto)}</b>
            </p>
            <HorasDeLaQuincena dias={q.dias} gasolina={q.gasolina} />
          </section>
        )}
        {ver === 'clientes' && <ClientesNuevos clientes={q.clientesNuevos} incentivo={q.tarifas.incentivoClienteNuevo} />}
        {ver === 'comision' && <ComisionDelMes comision={q.comision} />}
        {ver === 'pagos' && (
          <>
            <DeudaEmpleado deuda={d.deuda} titulo="Pendiente de pagarte" />
            <PagosEmpleado pagos={d.pagos} />
          </>
        )}
      </div>
    )
  }

  const pendientesGasolina = q ? q.gasolina.dias.filter(x => !x.pagada).length : 0
  const ultimoPago = d?.pagos.find(p => !p.anulado)
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <EncabezadoPagina icono={PiggyBank} titulo="Mis ingresos" descripcion="Tu jornada y lo que vas ganando."
        acciones={<Boton variante="secundario" icono={RefreshCw} cargando={ingresos.cargando} onClick={ingresos.recargar}>Actualizar</Boton>} />

      {jornada.estado?.empleado !== false && <TarjetaJornada jornada={jornada} />}
      {ingresos.error && <p role="alert" className="rounded-xl bg-peligro-50 p-4 text-sm text-peligro-700">{ingresos.error}</p>}

      {q && (
        <>
          <TotalQuincena quincena={q} deuda={d.deuda} onElegir={ingresos.setPeriodo}
            nota={jornada.estado?.abierta ? 'La jornada abierta suma al terminarla.' : ''} />
          <div className="grid grid-cols-2 gap-3">
            <TarjetaIngreso icono={Timer} titulo="Horas" valor={colones(q.porHoras)} pie={duracion(q.minutos)} onClick={() => abrir('dias')} />
            <TarjetaIngreso icono={Fuel} titulo="Gasolina" valor={colones(q.gasolina.monto)} onClick={() => abrir('dias')}
              pie={pendientesGasolina ? `${plural(pendientesGasolina, 'día pendiente', 'días pendientes')} de pago` : plural(q.gasolina.dias.length, 'día', 'días')} />
            <TarjetaIngreso icono={UserPlus} titulo="Clientes nuevos" valor={colones(q.clientesNuevos.monto)} onClick={() => abrir('clientes')}
              pie={`${q.clientesNuevos.cuentan.length} con compra · ${q.clientesNuevos.esperando.length} por comprar`} />
            <TarjetaIngreso icono={TrendingUp} titulo="Comisión" valor={colones(q.comision.monto)} onClick={() => abrir('comision')}
              apagado={!q.comision.enEstaQuincena}
              pie={`${q.comision.nombre.split(' ')[0]} · ${q.comision.enEstaQuincena ? `${q.comision.porcentaje} % de ${colones(Math.max(0, q.comision.netas))}` : 'se paga con la 2.ª quincena'}`} />
            {/* Lo que se le debe ya está en el total («Por cobrar»): acá, el último pago. */}
            <TarjetaIngreso className="col-span-2" icono={Receipt} titulo="Mis pagos" onClick={() => abrir('pagos')}
              valor={ultimoPago ? colones(ultimoPago.monto) : 'Sin pagos todavía'}
              pie={ultimoPago ? `Último pago, el ${fechaEnPalabras(ultimoPago.fecha, { day: 'numeric', month: 'long' })}` : 'Acá se ven cuando te paguen'} />
          </div>
        </>
      )}
    </div>
  )
}
