import { useState } from 'react'
import { ImageOff } from 'lucide-react'

/**
 * Foto de producto con degradado a un placeholder honesto. Mismo criterio
 * que GridProductos.jsx: cuando no hay imagen se dice "sin imagen" en vez
 * de dejar el ícono roto del navegador — acá importa especialmente, porque
 * la foto es el criterio con el que se decide si dos productos son el
 * mismo, y una imagen que falla en silencio se lee como "no se parecen".
 */
export default function ImagenProducto({ src, alt, className = '', tamano = 'h-24 w-24' }) {
  const [fallo, setFallo] = useState(false)
  const hayImagen = Boolean(src) && !fallo

  return (
    <div className={`${tamano} shrink-0 rounded-lg border border-neutro-200 bg-white flex items-center justify-center overflow-hidden ${className}`}>
      {hayImagen ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-contain p-1"
          onError={() => setFallo(true)}
        />
      ) : (
        <div className="flex flex-col items-center gap-1 text-neutro-300">
          <ImageOff size={20} />
          <span className="text-[9px] uppercase tracking-wide font-semibold">sin foto</span>
        </div>
      )}
    </div>
  )
}
