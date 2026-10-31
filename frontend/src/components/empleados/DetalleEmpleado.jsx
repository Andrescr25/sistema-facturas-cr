import { useState } from 'react'
import { ArrowLeft, Settings2, Plus, Timer, AlertTriangle, Banknote, Footprints, UserPlus, TrendingUp, Receipt } from 'lucide-react'
import Boton from '../ui/Boton'
import TotalQuincena from '../ingresos/TotalQuincena'
import TarjetaIngreso from '../ingresos/TarjetaIngreso'
import HorasDeLaQuincena from '../ingresos/HorasDeLaQuincena'
import ClientesNuevos from '../ingresos/ClientesNuevos'
import ComisionDelMes from '../ingresos/ComisionDelMes'
import GasolinaDeLaQuincena from '../ingresos/GasolinaDeLaQuincena'
import DeudaEmpleado from '../ingresos/DeudaEmpleado'
import ModalEmpleado from './ModalEmpleado'
import ModalJornada from './ModalJornada'
import ModalPagoEmpleado from './ModalPagoEmpleado'
import PagosEmpleado from './PagosEmpleado'
import DiaDelEmpleado from './DiaDelEmpleado'
import { useDetalleEmpleado } from '../../hooks/useDetalleEmpleado'
import { colones } from '../../utils/colones'
import { duracion, nombreDelDia } from '../../utils/ingresosTexto'
import { horaEnCostaRica, hoyEnCostaRica, fechaEnPalabras } from '../../utils/fechaCR'

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

// De qué sale lo que se paga de la quincena: suma justo lo que falta.
const detalleDeQuincena = (q) => [
  { nombre: 'Horas trabajadas', monto: q.porHoras },
  { nombre: 'Clientes nuevos', monto: q.clientesNuevos.monto },
  { nombre: 'Gasolina', monto: q.gasolina.monto },
  ...(q.comision.enEstaQuincena ? [{ nombre: `Comisión de ${q.comision.nombre}`, monto: q.comision.monto }] : []),
  ...(q.pagos.pagado ? [{ nombre: 'Ya pagado', monto: -q.pagos.pagado }] : [])
]

/**
 * Un empleado en «Empleados» (2026-10-30). El usuario vio la ficha «muy
 * desordenada»: va igual que «Mis ingresos», tarjetas → detalle. Arriba quién
 * es y la quincena con «Pagar quincena»; abajo una tarjeta por parte —su día
 * (lo que era «Seguimiento de agentes»), jornadas y gasolina, clientes nuevos,
 * comisión y pagos—, que abre su detalle (`ver`, en la dirección).
 */
export default function DetalleEmpleado({ usuarioId, ver, onVer, guardarFicha, onVolver }) {
  const d = useDetalleEmpleado(usuarioId)
  const [editando, setEditando] = useState(false)
  const [tramo, setTramo] = useState(undefined)
  const [pagando, setPagando] = useState(null)
  const ficha = d.datos?.ficha
  const q = d.datos?.quincena
  const jornada = d.datos?.jornada
  const hoy = hoyEnCostaRica()

  const modales = (
    <>
      {editando && <ModalEmpleado ficha={ficha} guardar={async (f, datos) => { await guardarFicha(f, datos); d.recargar() }} onCerrar={() => setEditando(false)} />}
      {tramo !== undefined && <ModalJornada tramo={tramo} guardar={d.guardarJornada} onCerrar={() => setTramo(undefined)} />}
      {pagando?.tipo === 'quincena' && (
        <ModalPagoEmpleado titulo={`${q.pagos.pagada ? 'Ajuste de la' : 'Pagar la'} ${q.periodo.nombre}`} monto={q.pagos.porPagar} detalle={detalleDeQuincena(q)}
          desde={q.periodo.desde} onConfirmar={(medio) => d.pagarQuincena(q.periodo.clave, medio)} onCerrar={() => setPagando(null)} />
      )}
      {pagando?.tipo === 'gasolina' && (
        <ModalPagoEmpleado titulo="Pagar gasolina" monto={pagando.monto} desde={[...pagando.fechas].sort()[0]}
          detalle={pagando.fechas.map(f => ({ nombre: fechaEnPalabras(f, { weekday: 'long', day: 'numeric', month: 'short' }), monto: q.gasolina.porDia }))}
          onConfirmar={(medio) => d.pagarGasolina(pagando.fechas, medio)} onCerrar={() => setPagando(null)} />
      )}
    </>
  )

  if (!ficha || !q) {
    return (
      <div className="space-y-4">
        <Boton variante="fantasma" icono={ArrowLeft} onClick={onVolver}>Empleados</Boton>
        {d.error && <p role="alert" className="rounded-xl bg-peligro-50 p-4 text-sm text-peligro-700">{d.error}</p>}
        {d.cargando && <p role="status" className="p-5 text-neutro-500">Consultando…</p>}
      </div>
    )
  }

  if (ver) {
    const pendientes = q.gasolina.dias.filter(x => !x.pagada)
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Boton variante="fantasma" icono={ArrowLeft} onClick={() => onVer(null)}>{ficha.nombre}</Boton>
          {ver !== 'dia' && <span className="text-sm font-semibold text-neutro-500">{q.periodo.nombre}</span>}
        </div>
        {ver === 'dia' && <DiaDelEmpleado usuarioId={usuarioId} />}
        {ver === 'jornadas' && (
          <>
            {pendientes.length > 0 && (
              <GasolinaDeLaQuincena key={q.periodo.clave} titulo="Gasolina por pagar" gasolina={{ ...q.gasolina, dias: pendientes }}
                onPagar={(fechas, monto) => setPagando({ tipo: 'gasolina', fechas, monto })} />
            )}
            <section aria-label="Jornadas" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lg font-bold text-neutro-900"><Timer size={18} className="text-primario-500" />Jornadas</h2>
                <Boton variante="secundario" icono={Plus} onClick={() => setTramo(null)}>Agregar jornada</Boton>
              </div>
              <p className="text-sm text-neutro-600">{duracion(q.minutos)} × {colones(q.tarifas.pagoHora)} = <b>{colones(q.porHoras)}</b> · Gasolina {plural(q.gasolina.dias.length, 'día', 'días')} = <b>{colones(q.gasolina.monto)}</b></p>
              <HorasDeLaQuincena dias={q.dias} gasolina={q.gasolina} onCorregir={setTramo} />
            </section>
          </>
        )}
        {ver === 'clientes' && <ClientesNuevos clientes={q.clientesNuevos} incentivo={q.tarifas.incentivoClienteNuevo} />}
        {ver === 'comision' && <ComisionDelMes comision={q.comision} />}
        {ver === 'pagos' && (
          <>
            <DeudaEmpleado deuda={d.datos.deuda} titulo="Le debo" />
            <PagosEmpleado pagos={d.datos.pagos} onAnular={d.anularPago} />
          </>
        )}
        {modales}
      </div>
    )
  }

  const sePuedePagar = q.pagos.porPagar > 0 && (q.periodo.terminada || hoy >= q.periodo.hasta)
  const minutosHoy = q.dias.find(x => x.fecha === hoy)?.minutos || 0
  const gasolinaPendiente = q.gasolina.dias.filter(x => !x.pagada).length
  const ultimoPago = d.datos.pagos.find(p => !p.anulado)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Boton variante="fantasma" icono={ArrowLeft} onClick={onVolver}>Empleados</Boton>
        <Boton variante="secundario" icono={Settings2} onClick={() => setEditando(true)}>Tarifas</Boton>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-neutro-900 md:text-3xl">{ficha.nombre}</h1>
        <p className="text-sm text-neutro-500">
          {jornada.abierta ? `Trabajando desde las ${horaEnCostaRica(jornada.abierta.inicio)}` : 'Sin jornada abierta'}
          {ficha.activo ? '' : ' · inactivo'} · {colones(ficha.tarifas.pagoHora)} la hora
        </p>
      </div>
      {jornada.sinSalida.map(j => (
        <p key={j.id} className="flex flex-wrap items-start gap-2 rounded-xl bg-alerta-50 p-3 text-sm font-semibold text-alerta-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          La jornada del {nombreDelDia(j.fecha)} (entrada {horaEnCostaRica(j.inicio)}) quedó sin salida y cuenta 0 horas.
          <button type="button" onClick={() => setTramo(j)} className="font-bold underline">Corregir</button>
        </p>
      ))}
      <TotalQuincena quincena={q} deuda={d.datos.deuda} onElegir={d.setPeriodo} para="administrador" accion={
        sePuedePagar
          ? <Boton icono={Banknote} ancho onClick={() => setPagando({ tipo: 'quincena' })}>{q.pagos.pagada ? 'Pagar ajuste' : 'Pagar quincena'} · {colones(q.pagos.porPagar)}</Boton>
          : q.pagos.porPagar > 0 ? <p className="text-center text-xs text-neutro-500">Se paga desde el {fechaEnPalabras(q.periodo.hasta, { day: 'numeric', month: 'long' })}. La gasolina, por días, en «Jornadas y gasolina».</p> : null
      } />
      <div className="grid grid-cols-2 gap-3">
        <TarjetaIngreso icono={Footprints} titulo="Su día" onClick={() => onVer('dia')} pie="Recorrido, ventas y ubicación"
          valor={jornada.abierta ? `Desde las ${horaEnCostaRica(jornada.abierta.inicio)}` : minutosHoy ? duracion(minutosHoy) : 'Sin jornada hoy'} />
        <TarjetaIngreso icono={Timer} titulo="Jornadas y gasolina" valor={duracion(q.minutos)} onClick={() => onVer('jornadas')}
          pie={`${colones(q.porHoras)}${gasolinaPendiente ? ` · gasolina: ${plural(gasolinaPendiente, 'día', 'días')} por pagar` : ''}`} />
        <TarjetaIngreso icono={UserPlus} titulo="Clientes nuevos" valor={colones(q.clientesNuevos.monto)} onClick={() => onVer('clientes')}
          pie={`${q.clientesNuevos.cuentan.length} con compra · ${q.clientesNuevos.esperando.length} por comprar`} />
        <TarjetaIngreso icono={TrendingUp} titulo="Comisión" valor={colones(q.comision.monto)} onClick={() => onVer('comision')} apagado={!q.comision.enEstaQuincena}
          pie={`${q.comision.nombre.split(' ')[0]} · ${q.comision.enEstaQuincena ? `${q.comision.porcentaje} % de ${colones(Math.max(0, q.comision.netas))}` : 'se paga con la 2.ª quincena'}`} />
        <TarjetaIngreso className="col-span-2" icono={Receipt} titulo="Pagos" onClick={() => onVer('pagos')}
          valor={d.datos.deuda.total > 0 ? `Le debo ${colones(d.datos.deuda.total)}` : 'Al día'}
          pie={ultimoPago ? `Último pago: ${colones(ultimoPago.monto)}, el ${fechaEnPalabras(ultimoPago.fecha, { day: 'numeric', month: 'long' })}` : 'Todavía sin pagos'} />
      </div>
      {modales}
    </div>
  )
}
