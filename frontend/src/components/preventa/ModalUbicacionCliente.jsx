import { useState } from 'react'
import { MapPin } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import ElegirPunto from './ElegirPunto'
import { useFichaDesdeVisita } from '../../hooks/useFichaDesdeVisita'
import { coordenadasDe } from '../../utils/visitaPreventa'

/** Marcar o corregir el punto exacto del local en el mapa (2026-10-29). */
export default function ModalUbicacionCliente({ cliente, onCerrar, onGuardada }) {
  const [punto, setPunto] = useState(coordenadasDe(cliente.ubicacion_maps))
  const { guardar, guardando, error } = useFichaDesdeVisita()

  const confirmar = async () => {
    const r = await guardar(cliente.id, { ubicacion: { latitud: punto.lat, longitud: punto.lng } })
    if (r) onGuardada()
  }

  return (
    <Modal titulo={`Ubicación · ${cliente.nombre}`} ancho="lg" onCerrar={guardando ? () => {} : onCerrar} pie={(
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
        <Boton icono={MapPin} onClick={confirmar} cargando={guardando} disabled={!punto}>Guardar ubicación</Boton>
      </div>
    )}>
      <div className="space-y-3 p-4 sm:p-5">
        <ElegirPunto punto={punto} onCambiar={setPunto} />
        {error && <p role="alert" className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}
      </div>
    </Modal>
  )
}
