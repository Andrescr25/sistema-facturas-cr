import { useState } from 'react'
import { Tags } from 'lucide-react'
import Boton from '../ui/Boton'
import ModalMarcasCatalogo from './ModalMarcasCatalogo'

export default function MarcasSubcategoria({ subcategoria }) {
  const [abierto, setAbierto] = useState(false)
  return <>
    <Boton variante="secundario" icono={Tags} onClick={() => setAbierto(true)}>Marcas</Boton>
    {abierto && <ModalMarcasCatalogo subcategoria={subcategoria} onCerrar={() => setAbierto(false)} />}
  </>
}
