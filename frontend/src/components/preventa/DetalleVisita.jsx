import { ArrowLeft } from 'lucide-react'
import Boton from '../ui/Boton'
import RotacionCliente from '../clientes/RotacionCliente'

export default function DetalleVisita({ cliente, volver }) {
  const direccion = [cliente.provincia, cliente.canton, cliente.distrito, cliente.barrio].filter(Boolean).join(', ')
  const telefonos = [...new Set([cliente.celular, cliente.telefono, cliente.telefono_secundario].filter(Boolean))]
  return (
    <div className="space-y-5">
      <Boton variante="secundario" icono={ArrowLeft} onClick={volver}>Volver a la agenda</Boton>
      <div className="card p-5 sm:p-7">
        <h2 className="break-words text-2xl font-bold text-neutro-900">{cliente.nombre}</h2>
        <p className="mt-1 text-sm text-neutro-500">Cliente #{cliente.id} · {cliente.ruta?.nombre || 'Sin ruta asignada'}</p>
        <RotacionCliente rotacion={cliente.rotacion} />
        <dl className="mt-5 grid gap-4 border-t border-neutro-100 pt-5 sm:grid-cols-2">
          <div><dt className="text-sm text-neutro-500">Teléfonos</dt><dd className="mt-1 break-words font-medium text-neutro-900">{telefonos.join(' / ') || 'Sin teléfono registrado'}</dd></div>
          <div><dt className="text-sm text-neutro-500">Correo</dt><dd className="mt-1 break-all font-medium text-neutro-900">{cliente.correo || 'Sin correo registrado'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-sm text-neutro-500">Dirección</dt><dd className="mt-1 break-words font-medium text-neutro-900">{direccion || 'Sin dirección registrada'}</dd>
            {cliente.otras_senas && <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-neutro-600">{cliente.otras_senas}</dd>}
          </div>
        </dl>
        <p className="mt-5 text-sm text-neutro-500">La última atención corresponde a la última factura vigente. Podés configurar la frecuencia y la ruta en Clientes.</p>
      </div>
    </div>
  )
}
