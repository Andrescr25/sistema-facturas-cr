import { memo, useLayoutEffect, useRef, useState } from 'react'
import IntroduccionCategoria from './IntroduccionCategoria'
import { registrarFocoCategoria } from '../../utils/focoCategoria'
import './transicionCategoria.css'

function TransicionCategoria(props) {
  const elemento = useRef(null)
  const [preparada, setPreparada] = useState(false)
  const Titulo = `h${props.nivel || 2}`
  useLayoutEffect(() => registrarFocoCategoria(elemento.current, () => setPreparada(true)), [])
  return (
    <div ref={elemento} className="transicion-categoria">
      <Titulo className="sr-only">{props.nombre}</Titulo>
      <div className="transicion-categoria__escena" aria-hidden="true">
        <IntroduccionCategoria {...props} imagen={preparada ? props.imagen : null} animar={false} tituloDecorativo />
      </div>
    </div>
  )
}

export default memo(TransicionCategoria)
