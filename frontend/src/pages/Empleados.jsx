import { useState } from 'react'
import { Briefcase, UserPlus, Users } from 'lucide-react'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'
import Boton from '../components/ui/Boton'
import Vacio from '../components/ui/Vacio'
import TarjetaEmpleado from '../components/empleados/TarjetaEmpleado'
import DetalleEmpleado from '../components/empleados/DetalleEmpleado'
import ModalEmpleado from '../components/empleados/ModalEmpleado'
import { useEmpleados } from '../hooks/useEmpleados'

/**
 * «Empleados» (2026-10-30). El usuario: «desde mi panel administrador ver qué
 * hizo, cuántas horas, comisión, viáticos, el total que le debo». Lista de
 * tarjetas grandes y, al tocar una, el detalle de ese empleado.
 */
export default function Empleados() {
  const e = useEmpleados()
  const [abierto, setAbierto] = useState(null)
  const [agregando, setAgregando] = useState(false)

  if (abierto) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <DetalleEmpleado usuarioId={abierto} guardarFicha={e.guardar} onVolver={() => { setAbierto(null); e.recargar() }} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <EncabezadoPagina icono={Briefcase} titulo="Empleados" descripcion="Horas, lo ganado y lo que se le debe a cada uno."
        acciones={<Boton icono={UserPlus} onClick={() => setAgregando(true)}>Agregar empleado</Boton>} />
      {e.error && <p role="alert" className="rounded-xl bg-peligro-50 p-4 text-sm text-peligro-700">{e.error}</p>}
      {e.cargando && !e.lista.length && <p role="status" className="p-5 text-neutro-500">Consultando…</p>}
      {!e.cargando && !e.error && e.lista.length === 0 && (
        <Vacio icono={Users} titulo="Todavía no hay empleados" descripcion="Agregá al agente para que marque su jornada y vea sus ingresos." />
      )}
      <div className="space-y-3">
        {e.lista.map(x => <TarjetaEmpleado key={x.usuarioId} empleado={x} onAbrir={() => setAbierto(x.usuarioId)} />)}
      </div>
      {agregando && <ModalEmpleado usuariosSinFicha={e.usuariosSinFicha} guardar={e.guardar} onCerrar={() => setAgregando(false)} />}
    </div>
  )
}
