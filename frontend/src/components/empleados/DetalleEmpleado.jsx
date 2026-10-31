import { useState } from 'react'
import { ArrowLeft, Settings2, Plus, Timer, AlertTriangle, Banknote } from 'lucide-react'
import Boton from '../ui/Boton'
import SelectorQuincena from '../ingresos/SelectorQuincena'
import HorasDeLaQuincena from '../ingresos/HorasDeLaQuincena'
import ClientesNuevos from '../ingresos/ClientesNuevos'
import ResumenQuincena from '../ingresos/ResumenQuincena'
import ComisionDelMes from '../ingresos/ComisionDelMes'
import GasolinaDeLaQuincena from '../ingresos/GasolinaDeLaQuincena'
import DeudaEmpleado from '../ingresos/DeudaEmpleado'
import ModalEmpleado from './ModalEmpleado'
import ModalJornada from './ModalJornada'
import ModalPagoEmpleado from './ModalPagoEmpleado'
import PagosEmpleado from './PagosEmpleado'
import { useDetalleEmpleado } from '../../hooks/useDetalleEmpleado'
import { colones } from '../../utils/colones'
import { nombreDelDia } from '../../utils/ingresosTexto'
import { horaEnCostaRica, hoyEnCostaRica, fechaEnPalabras } from '../../utils/fechaCR'

// De qué sale lo que se paga de la quincena: suma justo lo que falta.
const detalleDeQuincena = (q) => [
  { nombre: 'Horas trabajadas', monto: q.porHoras },
  { nombre: 'Clientes nuevos', monto: q.clientesNuevos.monto },
  { nombre: 'Gasolina', monto: q.gasolina.monto },
  ...(q.comision.enEstaQuincena ? [{ nombre: `Comisión de ${q.comision.nombre}`, monto: q.comision.monto }] : []),
  ...(q.pagos.pagado ? [{ nombre: 'Ya pagado', monto: -q.pagos.pagado }] : [])
]

/** Un empleado: lo que se le debe, la quincena con sus pagos, jornadas (con corregir), gasolina y clientes. */
export default function DetalleEmpleado({ usuarioId, guardarFicha, onVolver }) {
  const d = useDetalleEmpleado(usuarioId)
  const [editando, setEditando] = useState(false)
  const [tramo, setTramo] = useState(undefined)
  const [pagando, setPagando] = useState(null)
  const ficha = d.datos?.ficha
  const q = d.datos?.quincena
  const jornada = d.datos?.jornada
  const sePuedePagar = q && q.pagos.porPagar > 0 && (q.periodo.terminada || hoyEnCostaRica() >= q.periodo.hasta)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Boton variante="fantasma" icono={ArrowLeft} onClick={onVolver}>Empleados</Boton>
        {ficha && <Boton variante="secundario" icono={Settings2} onClick={() => setEditando(true)}>Tarifas</Boton>}
      </div>
      {d.error && <p role="alert" className="rounded-xl bg-peligro-50 p-4 text-sm text-peligro-700">{d.error}</p>}
      {d.cargando && !d.datos && <p role="status" className="p-5 text-neutro-500">Consultando…</p>}

      {ficha && q && (
        <>
          <div>
            <h2 className="text-2xl font-bold text-neutro-900">{ficha.nombre}</h2>
            <p className="text-sm text-neutro-500">
              {jornada.abierta ? `Trabajando desde las ${horaEnCostaRica(jornada.abierta.inicio)}` : 'Sin jornada abierta'}
              {ficha.activo ? '' : ' · inactivo'}
            </p>
          </div>
          <DeudaEmpleado deuda={d.datos.deuda} titulo="Le debo" />
          {jornada.sinSalida.map(j => (
            <p key={j.id} className="flex items-start gap-2 rounded-xl bg-alerta-50 p-3 text-sm font-semibold text-alerta-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              La jornada del {nombreDelDia(j.fecha)} (entrada {horaEnCostaRica(j.inicio)}) quedó sin salida y cuenta 0 horas.
              <button type="button" onClick={() => setTramo(j)} className="font-bold underline">Corregir</button>
            </p>
          ))}
          <SelectorQuincena periodo={q.periodo} onElegir={d.setPeriodo} />
          <ResumenQuincena quincena={q} titulo={q.periodo.enCurso ? 'Lleva ganado en esta quincena' : 'Ganado en la quincena'} accion={
            sePuedePagar
              ? <Boton icono={Banknote} ancho onClick={() => setPagando({ tipo: 'quincena' })}>{q.pagos.pagada ? 'Pagar ajuste' : 'Pagar quincena'} · {colones(q.pagos.porPagar)}</Boton>
              : q.pagos.porPagar > 0 && <p className="text-xs text-neutro-500">Se paga desde el {fechaEnPalabras(q.periodo.hasta, { day: 'numeric', month: 'long' })}. La gasolina, por días.</p>
          } />
          <ComisionDelMes comision={q.comision} />
          <GasolinaDeLaQuincena key={q.periodo.clave} gasolina={q.gasolina} onPagar={(fechas, monto) => setPagando({ tipo: 'gasolina', fechas, monto })} />
          <section aria-label="Jornadas" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-lg font-bold text-neutro-900"><Timer size={18} className="text-primario-500" />Jornadas</h3>
              <Boton variante="secundario" icono={Plus} onClick={() => setTramo(null)}>Agregar jornada</Boton>
            </div>
            <HorasDeLaQuincena dias={q.dias} onCorregir={setTramo} />
          </section>
          <ClientesNuevos clientes={q.clientesNuevos} incentivo={q.tarifas.incentivoClienteNuevo} />
          <PagosEmpleado pagos={d.datos.pagos} onAnular={d.anularPago} />
        </>
      )}

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
    </div>
  )
}
