import { colonesExacto } from '../../utils/colones'
import { precioConIva } from '../../utils/facturacionUtils'

/**
 * El precio de UNA unidad de un producto, con su IVA, y dicho en palabras.
 *
 * Lo usan los cuatro lugares donde se ve un producto antes de agregarlo a la
 * factura (la lista del buscador, la ficha «Encontrado», el modal de cantidad
 * y el buscador de editar una factura): en todos se muestra lo que se cobra,
 * no el precio base. `className` es el estilo del precio; la leyenda va debajo.
 * Sin precio no se dibuja nada, como antes.
 */
export default function PrecioConIva({ producto, impuestoPrincipal = null, className = '' }) {
  if (!(Number(producto?.price) > 0)) return null
  return (
    <span className={`text-right ${className}`}>
      {colonesExacto(precioConIva(producto, impuestoPrincipal))}
      <span className="block text-xs font-medium text-neutro-500">con IVA</span>
    </span>
  )
}
