import { memo, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDownRight, Layers } from 'lucide-react'
import { urlArchivo } from '../../utils/urlArchivo'
import { observarEntradaCategoria, terminarEntrada } from '../../utils/entradaCategoria'
import './introduccionCategoria.css'

/**
 * La foto se muestra cuando ya está decodificada (`decode()` fuera del hilo
 * principal), con un fundido. Sin esto, una foto de 1920 px se decodificaba
 * en el mismo cuadro en que aparecía la escena y la animación se trababa.
 * Sin estado de React: no vuelve a renderizar nada.
 */
function mostrarCuandoEsteLista(evento) {
  const foto = evento.currentTarget
  const lista = () => { foto.dataset.lista = 'true' }
  if (typeof foto.decode === 'function') foto.decode().then(lista, lista)
  else lista()
}

/** Una pausa visual en el recorrido, nunca una pausa de la navegación. */
function IntroduccionCategoria({ nombre, cantidad, imagen, numero, total, nivel = 2, animar = true, tituloDecorativo = false, cargarYa = false }) {
  const elemento = useRef(null)
  const [fallida, setFallida] = useState(null)
  const foto = imagen?.url && fallida !== imagen.url ? imagen : null
  const Titulo = tituloDecorativo ? 'div' : `h${nivel}`
  useLayoutEffect(() => {
    if (animar) return observarEntradaCategoria(elemento.current)
  }, [animar])

  return (
    <div ref={elemento} onAnimationEnd={terminarEntrada} className={`introduccion-categoria ${foto?.esProducto ? 'introduccion-categoria--producto' : ''}`}>
      {/* Reserva su espacio antes de cargar. Una imagen lenta o rota no
          oculta el nombre ni modifica la altura de la sección. */}
      {foto ? (
        <picture className="introduccion-categoria__imagen" aria-hidden="true">
          {foto.urlMovil && <source media="(max-width: 767px)" srcSet={urlArchivo(foto.urlMovil)} />}
          {/* `cargarYa`: la escena ya decidió cuándo montarla (al acercarse);
              diferirla otra vez la dejaba llegando tarde a su propio fundido. */}
          <img src={urlArchivo(foto.url)} alt="" width={foto.ancho || 960} height={foto.alto || 540}
            loading={cargarYa ? 'eager' : 'lazy'} decoding="async" fetchpriority={cargarYa ? 'auto' : 'low'}
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
