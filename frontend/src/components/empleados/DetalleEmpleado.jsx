import { useState } from 'react'
import { ArrowLeft, Settings2, Plus, Timer, AlertTriangle } from 'lucide-react'
import Boton from '../ui/Boton'
import SelectorQuincena from '../ingresos/SelectorQuincena'
import HorasDeLaQuincena from '../ingresos/HorasDeLaQuincena'
import ClientesNuevos from '../ingresos/ClientesNuevos'
import ResumenQuincena from '../ingresos/ResumenQuincena'
import ComisionDelMes from '../ingresos/ComisionDelMes'
import ModalEmpleado from './ModalEmpleado'
import ModalJornada from './ModalJornada'
import { useDetalleEmpleado } from '../../hooks/useDetalleEmpleado'
import { nombreDelDia } from '../../utils/ingresosTexto'
import { horaEnCostaRica } from '../../utils/fechaCR'

/** Un empleado: lo de la quincena, sus jornadas (con corregir) y sus tarifas. */
export default function DetalleEmpleado({ usuarioId, guardarFicha, onVolver }) {
  const d = useDetalleEmpleado(usuarioId)
  const [editando, setEditando] = useState(false)
  const [tramo, setTramo] = useState(undefined)
  const ficha = d.datos?.ficha
  const q = d.datos?.quincena
  const jornada = d.datos?.jornada

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
          {jornada.sinSalida.map(j => (
            <p key={j.id} className="flex items-start gap-2 rounded-xl bg-alerta-50 p-3 text-sm font-semibold text-alerta-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              La jornada del {nombreDelDia(j.fecha)} (entrada {horaEnCostaRica(j.inicio)}) quedó sin salida y cuenta 0 horas.
              <button type="button" onClick={() => setTramo(j)} className="font-bold underline">Corregir</button>
            </p>
          ))}
          <SelectorQuincena periodo={q.periodo} onElegir={d.setPeriodo} />
          <ResumenQuincena quincena={q} tarifas={ficha.tarifas} titulo={q.periodo.enCurso ? 'Lleva ganado en esta quincena' : 'Ganado en la quincena'} />
          <ComisionDelMes comision={q.comision} />
          <section aria-label="Jornadas" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-lg font-bold text-neutro-900"><Timer size={18} className="text-primario-500" />Jornadas</h3>
              <Boton variante="secundario" icono={Plus} onClick={() => setTramo(null)}>Agregar jornada</Boton>
            </div>
            <HorasDeLaQuincena dias={q.dias} onCorregir={setTramo} />
          </section>
          <ClientesNuevos clientes={q.clientesNuevos} incentivo={ficha.tarifas.incentivoClienteNuevo} />
        </>
      )}

      {editando && <ModalEmpleado ficha={ficha} guardar={async (f, datos) => { await guardarFicha(f, datos); d.recargar() }} onCerrar={() => setEditando(false)} />}
      {tramo !== undefined && <ModalJornada tramo={tramo} guardar={d.guardarJornada} onCerrar={() => setTramo(undefined)} />}
    </div>
  )
}
