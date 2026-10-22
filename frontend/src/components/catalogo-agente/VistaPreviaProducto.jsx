import { useEffect, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import { colones } from '../../utils/colones'
import { urlArchivo } from '../../utils/urlArchivo'
import { fotoDe } from '../../utils/cacheImagenesCatalogo'
import { precioCatalogoAgente } from '../../utils/precioCatalogoAgente'

/**
 * No consulta al servidor: usa la presentación y la foto sincronizadas.
 *
 * La marca va ARRIBA, como título, y el producto abajo junto al precio
 * (2026-10-22, el usuario: «la vista previa viene con el nombre de la línea
 * abajo y el del producto arriba, hazlo al revés sino confunde»). Se abre
 * desde la portada de la marca: lo que se mira es una presentación de ESA
 * marca. Un producto sin marca lleva su propio nombre de título.
 */
export default function VistaPreviaProducto({ producto, onCerrar }) {
  const [fallo, setFallo] = useState(false)
  const cerrar = useRef(null)
  const foto = urlArchivo(fotoDe(producto))
  const precio = precioCatalogoAgente(producto)
  useEffect(() => {
    const anterior = document.activeElement
    cerrar.current?.closest('[role=dialog]')?.querySelector('button')?.focus({ preventScroll: true })
    return () => anterior?.focus?.({ preventScroll: true })
  }, [])
  const marca = producto.marca?.nombre
  return <Modal titulo={marca || producto.name} ancho="xl" onCerrar={onCerrar} pie={<Boton onClick={onCerrar} ancho>Cerrar vista previa</Boton>}>
    <div ref={cerrar} className="space-y-4 p-5">
      <div className="flex h-[min(48vh,26rem)] items-center justify-center rounded-2xl bg-neutro-50 p-4">
        {foto && !fallo ? <img src={foto} alt={producto.name} decoding="async" onError={() => setFallo(true)} className="h-full w-full object-contain" />
          : <div className="text-center text-neutro-400"><ImageOff size={44} className="mx-auto mb-2" /><p className="text-sm">Imagen de este producto no disponible</p></div>}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">{marca && <p className="break-words text-base font-bold leading-snug text-neutro-900">{producto.name}</p>}<p className="mt-1 text-xs text-neutro-500">Ref. {producto.reference?.reference || producto.reference || 'sin referencia'}</p></div>
        <div className="text-right">{precio.tachado > 0 && <p className="text-sm text-neutro-400 line-through">{colones(precio.tachado)}</p>}<p className="text-2xl font-extrabold text-neutro-900">{colones(precio.final)}</p><p className="text-xs text-neutro-500">IVA incluido</p></div>
      </div>
    </div>
  </Modal>
}
