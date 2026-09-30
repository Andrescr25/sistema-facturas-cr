/**
 * Las etiquetas del catálogo del agente.
 *
 * POR QUÉ UNA SOLA
 * Antes cada aviso se pintaba por su cuenta —descuento, exceso, stock,
 * cliente habitual— con su propia clase y su propio peso visual. El
 * resultado en la tablet era que todo gritaba al mismo tiempo: la pantalla
 * se llenaba de "AGOTADO" en rojo sangre. (Las etiquetas de stock ya no
 * existen: el negocio vende con el stock del proveedor, ver
 * TarjetaProductoAgente.)
 *
 * Un solo componente obliga a decidir la jerarquía una vez:
 *
 *   oferta      naranja lleno   lo único que interrumpe: es la razón de que
 *                               el agente muestre ese producto
 *   liquidacion morado lleno    exceso de inventario, sale con descuento
 *   habitual    verde suave     "este cliente lo lleva siempre"
 */

const TONOS = {
  oferta:      'bg-acento-500 text-white',
  liquidacion: 'bg-nota-600 text-white',
  habitual:    'bg-exito-50 text-exito-700 ring-1 ring-exito-200',
  neutro:      'bg-neutro-100 text-neutro-600 ring-1 ring-neutro-200'
}

export default function Etiqueta({ tono = 'neutro', icono: Icono, children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide ${
        TONOS[tono] || TONOS.neutro
      } ${className}`}
    >
      {Icono && <Icono size={10} strokeWidth={2.5} />}
      {children}
    </span>
  )
}
