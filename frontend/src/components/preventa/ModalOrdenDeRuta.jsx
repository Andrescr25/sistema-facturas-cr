import { useState } from 'react'
import { Save } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'

/**
 * «Guardar como orden de mi ruta» (parte 2 de «Mi día», 2026-11-01): antes de
 * cambiar la ruta para siempre, se muestra cómo queda. Los clientes de su día
 * toman los lugares que ya tenían en la ruta, en el orden del día; los demás
 * no se mueven. Queda en la bitácora a su nombre.
 */
export default function ModalOrdenDeRuta({ clientes, onGuardar, onCerrar }) {
  const [guardando, setGuardando] = useState(false)
  const porRuta = []
  for (const { cliente } of clientes) {
    if (!cliente.ruta?.id) continue
    let grupo = porRuta.find(g => g.id === cliente.ruta.id)
    if (!grupo) { grupo = { id: cliente.ruta.id, nombre: cliente.ruta.nombre, nombres: [] }; porRuta.push(grupo) }
    grupo.nombres.push(cliente.nombre)
  }

  const confirmar = async () => {
    setGuardando(true)
    await onGuardar()
    setGuardando(false)
  }

  return (
    <Modal titulo="Guardar como orden de mi ruta" onCerrar={guardando ? () => {} : onCerrar} pie={(
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
        <Boton icono={Save} onClick={confirmar} cargando={guardando}>Guardar en mi ruta</Boton>
      </div>
    )}>
      <div className="space-y-4 p-4 sm:p-5">
        <p className="text-sm text-neutro-700">Así van a quedar en tu ruta, desde hoy y para los días que vienen:</p>
        {porRuta.map(g => (
          <div key={g.id} className="rounded-xl border border-neutro-200 p-3">
            <p className="font-bold text-neutro-900">{g.nombre}</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-neutro-700">
              {g.nombres.map(n => <li key={n}>{n}</li>)}
            </ol>
          </div>
        ))}
        <p className="text-xs text-neutro-500">Los demás clientes de la ruta no se mueven. Mañana tu día se arma en este orden.</p>
      </div>
    </Modal>
  )
}
