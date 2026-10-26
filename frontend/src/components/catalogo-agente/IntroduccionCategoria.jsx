import { memo, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDownRight, Layers } from 'lucide-react'
import { urlArchivo } from '../../utils/urlArchivo'
import { observarEntradaCategoria, terminarEntrada } from '../../utils/entradaCategoria'
import { relacionDeImagen, urlMovilUsable } from '../../utils/proporcionImagenCategoria'
import './introduccionCategoria.css'

/**
 * La foto se muestra cuando ya está decodificada (`decode()` fuera del hilo
 * principal), con un fundido: una foto de 1920 px que llega tarde no aparece
 * de golpe ni se decodifica en el cuadro en que se ve. Sin estado de React:
 * no vuelve a renderizar nada.
 */
function mostrarCuandoEsteLista(evento) {
  const foto = evento.currentTarget
  const lista = () => { foto.dataset.lista = 'true' }
  if (typeof foto.decode === 'function') foto.decode().then(lista, lista)
  else lista()
}

/**
 * La presentación de una categoría: va DENTRO del recorrido y pasa con el
 * scroll, como un producto más. Nunca se fija en pantalla ni lo detiene
 * (pedido del usuario, 2026-10-19: «no quiero que la animación se detenga
 * para mostrar la categoría, quiero que siga el deslizamiento»).
 */
function IntroduccionCategoria({ nombre, cantidad, imagen, numero, total, nivel = 2, animar = true }) {
  const elemento = useRef(null)
  const [fallida, setFallida] = useState(null)
  const foto = imagen?.url && fallida !== imagen.url ? imagen : null
  // Una foto subida desde Gestión trae sus medidas: el banner toma su proporción.
  // La de respaldo (de un producto) o una sin medidas conserva la franja de siempre.
  const relacion = foto && !foto.esProducto ? relacionDeImagen(foto) : null
  const movil = foto && !foto.esProducto ? urlMovilUsable(foto) : null
  const Titulo = `h${nivel}`
  useLayoutEffect(() => {
    if (animar) return observarEntradaCategoria(elemento.current)
  }, [animar])

  return (
    <div ref={elemento} onAnimationEnd={terminarEntrada}
      className={`introduccion-categoria ${foto?.esProducto ? 'introduccion-categoria--producto' : ''} ${relacion ? 'introduccion-categoria--foto' : ''}`}
      style={relacion ? { '--relacion': `${foto.ancho} / ${foto.alto}` } : undefined}>
      {/* Reserva su espacio antes de cargar. Una imagen lenta o rota no
          oculta el nombre ni modifica la altura de la sección. */}
      {foto ? (
        <picture className="introduccion-categoria__imagen" aria-hidden="true">
          {movil && <source media="(max-width: 767px)" srcSet={urlArchivo(movil)} />}
          <img src={urlArchivo(foto.url)} alt="" width={foto.ancho || 960} height={foto.alto || 540}
            loading="lazy" decoding="async" fetchpriority="low"
            onLoad={mostrarCuandoEsteLista} onError={() => setFallida(foto.url)} />
        </picture>
      ) : (
        <div className="introduccion-categoria__sin-imagen" aria-hidden="true"><Layers strokeWidth={0.8} /></div>
      )}
      <div className="introduccion-categoria__velo" aria-hidden="true" />
      <div className="introduccion-categoria__contenido">
        <div className="introduccion-categoria__detalle">
          <span className="introduccion-categoria__linea" />
          <span>Explorá la colección</span>
          {numero && total && <span className="introduccion-categoria__posicion">{String(numero).padStart(2,'0')} / {String(total).padStart(2,'0')}</span>}
        </div>
        <Titulo className="introduccion-categoria__nombre">{nombre}</Titulo>
        <p className="introduccion-categoria__cantidad">{cantidad} {cantidad === 1 ? 'producto' : 'productos'}<ArrowDownRight size={16} aria-hidden="true" /></p>
      </div>
    </div>
  )
}

export default memo(IntroduccionCategoria)
