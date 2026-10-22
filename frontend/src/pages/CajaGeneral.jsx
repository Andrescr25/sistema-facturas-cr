import { Landmark } from 'lucide-react'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'
import MovimientosCaja from '../components/caja-general/MovimientosCaja'

export default function CajaGeneral() {
  return (
    <div className="mx-auto max-w-6xl pb-24">
      <EncabezadoPagina titulo="Caja General" descripcion="Entradas, salidas y neto del período, con las facturas de cada movimiento." icono={Landmark} />
      <MovimientosCaja />
    </div>
  )
}
