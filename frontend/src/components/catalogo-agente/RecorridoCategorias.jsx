import './transicionCategoria.css'

export default function RecorridoCategorias({ children, className }) {
  return (
    <div data-recorrido-categorias className={`catalogo-recorrido ${className}`}>
      <div className="catalogo-oscurecer" aria-hidden="true">
        <p className="catalogo-oscurecer__seguir">Seguí bajando para explorar <ArrowDown size={16} /></p>
      </div>
      {children}
    </div>
  )
}
import { ArrowDown } from 'lucide-react'
