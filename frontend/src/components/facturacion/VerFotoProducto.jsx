import { useState } from 'react'
import { Image as IconoFoto, ImageOff, Loader2 } from 'lucide-react'
import Modal from '../ui/Modal'
import { urlArchivo } from '../../utils/urlArchivo'
import { getReference } from '../../utils/facturacionUtils'

/**
 * Un botón pequeño en la línea de la factura para ver la foto del producto
 * (2026-10-28, el usuario: «una forma de ver la imagen del producto que estoy
 * facturando… un logo pequeño para ver la img»).
 *
 * SOLO APARECE SI EL PRODUCTO TIENE FOTO: un ícono que lleva a «sin foto»
 * sería ruido en cada línea. La foto no se pide hasta tocarlo, así que
 * facturar con muchas líneas no baja nada de más ni gasta datos en el teléfono.
 *
 * Es responsive sin lógica propia: el botón mide 40 px como el de quitar (un
 * dedo lo acierta) y el modal es el del sistema, que en el teléfono sube desde
 * abajo y en pantallas grandes es un diálogo centrado. La foto se achica para
 * caber entera, sin recortarla ni deformarla, y el alto máximo (60 % de la
 * pantalla) deja ver el título y cerrar aunque el teléfono esté acostado.
 *
 * Sin señal la foto no baja: se dice, en vez de dejar un cuadro vacío. El
 * catálogo de Facturación sí funciona sin internet; la foto, no.
 */
export default function VerFotoProducto({ nombre, referencia, foto }) {
  const [abierta, setAbierta] = useState(false)
  const [estado, setEstado] = useState('cargando') // cargando | lista | fallida
  if (!foto) return null

  const abrir = () => { setEstado('cargando'); setAbierta(true) }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label={`Ver foto de ${nombre}`}
        title="Ver foto"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primario-600 transition-colors hover:bg-primario-50 hover:text-primario-800"
      >
        <IconoFoto size={18} />
      </button>

      {abierta && (
        <Modal titulo={nombre} ancho="lg" onCerrar={() => setAbierta(false)}>
          <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 bg-neutro-50 p-3 sm:p-5">
            {estado === 'cargando' && <Loader2 size={28} className="animate-spin text-neutro-400" aria-label="Cargando la foto" />}
            {estado === 'fallida' ? (
              <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-neutro-500">
                <ImageOff size={32} />
                <p className="text-sm font-semibold text-neutro-700">No se pudo cargar la foto</p>
                <p className="text-xs">Revisá la conexión: las fotos necesitan internet para verse.</p>
              </div>
            ) : (
              <img
                src={urlArchivo(foto)}
                alt={nombre}
                onLoad={() => setEstado('lista')}
                onError={() => setEstado('fallida')}
                className={`block max-h-[60vh] w-auto max-w-full rounded-xl object-contain ${estado === 'lista' ? '' : 'hidden'}`}
              />
            )}
            <p className="text-xs text-neutro-500">Ref. {getReference(referencia)}</p>
          </div>
        </Modal>
      )}
    </>
  )
}
