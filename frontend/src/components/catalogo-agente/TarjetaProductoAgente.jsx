import { memo } from 'react'
import { Package, Flame, Repeat, Tag, ZoomIn } from 'lucide-react'
import Etiqueta from './Etiqueta'
import { colones } from '../../utils/colones'
import { urlArchivo } from '../../utils/urlArchivo'
import { precioCatalogoAgente } from '../../utils/precioCatalogoAgente'

/**
 * Un producto en el catálogo del agente.
 *
 * QUÉ SE REDISEÑÓ Y POR QUÉ
 * La tarjeta anterior era alta y repetía en cada una "Incluye 13% IVA" —el
 * mismo texto ciento once veces— más el stock exacto de lo que sobraba
 * ("30 disp."). En una tablet de 9 pulgadas entraban ocho productos por
 * pantalla y el recorrido completo eran trece mil píxeles de scroll.
 *
 * Ahora: la foto manda, el nombre cabe en dos líneas y el precio es lo más
 * grande.
 *
 * NO SE DICE NADA DEL STOCK (2026-09-25, decisión del usuario). El negocio
 * trabaja de intermediario: casi nunca tiene existencias y vende con el stock
 * del proveedor. "Agotado" o "Quedan 2" le decían al cliente algo falso de
 * casi todo el catálogo, así que se quitaron; lo que está en cero sale en su
 * lugar como cualquier otro.
 *
 * Y la tarjeta crece con la pantalla. El primer intento las dejó chicas y en
 * la tablet entraban doce a la vez: demasiadas para que el cliente que mira
 * desde el otro lado del mostrador se fije en alguna. Con dos por fila la
 * foto se ve, y por eso todo lo demás —nombre, precio, botón— sube de
 * tamaño a la par en `sm` para arriba.
 *
 * DOS CLASES DE OFERTA, Y NO SE CALCULAN IGUAL
 *   descuentoPorcentaje  exceso de inventario: el precio del catálogo es el
 *                        normal y el descuento se aplica ENCIMA al vender,
 *                        así que acá se calcula.
 *   precioAntes          baja de precio decidida en Revisión de Precios: el
 *                        precio del catálogo YA es el rebajado. Aplicarle un
 *                        descuento otra vez mostraría un precio que no existe
 *                        y que el agente le prometería al cliente.
 */
/**
 * SE ENVUELVE EN `memo`, Y ES LO QUE ARREGLA LA LENTITUD AL BUSCAR.
 *
 * El buscador es un input controlado: cada tecla cambia el estado de la
 * pantalla y React vuelve a reconciliar las 2.091 tarjetas, aunque el filtro
 * esté memorizado y ninguna haya cambiado. Medido tecleando letra por letra,
 * el costo escalaba con la cantidad de teclas —3 letras 968 ms, 5 → 1.454,
 * 8 → 2.252—, que es exactamente el "se pone lento de la nada" que se
 * reportó. Con `memo`, una tarjeta cuyas props no cambiaron no se vuelve a
 * tocar.
 *
 * La tarjeta es de SOLO MIRAR. Antes traía los controles de cantidad para
 * armar el pedido acá; no se usó nunca —cero pedidos con origen 'agente' en
 * toda la base— y el pedido se toma en Facturación. Quitarlos también aliviana
 * la cuadrícula, que se pinta cientos de veces en cada búsqueda.
 */
/**
 * La baja de precio dice «OFERTA» en cualquier vista. Como ahora comparte
 * familia con fichas normales, borde, etiqueta y precio la destacan sin
 * sacarla de su lugar. Liquidación conserva otra etiqueta y su cálculo.
 */
function TarjetaProductoAgente({ product, stats, onVerProducto, mostrarSubcategoria = true, mostrarSinSubcategoria = false }) {
  const { final: precioFinal, tachado: precioTachado, rebaja, esOferta, descuento: descuentoPorcentaje } = precioCatalogoAgente(product)
  const favorita = product.images?.find((i) => i.favorite === true) || product.images?.[0]
  const foto = urlArchivo(favorita?.url)
  const subcategoria = product.subcategoria?.nombre || (mostrarSinSubcategoria ? 'Sin subcategoría' : '')

  return (
    <article
      className={`catalogo-ficha group relative flex flex-col overflow-hidden rounded-2xl bg-white transition-shadow ${
        esOferta ? 'ring-2 ring-acento-400 shadow-md shadow-acento-100' : descuentoPorcentaje > 0 ? 'ring-1 ring-nota-300' : 'ring-1 ring-neutro-200'
      }`}
    >
      {/* Los avisos van sobre la foto y no debajo del nombre: es lo primero
          que el ojo encuentra al recorrer una cuadrícula. */}
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
        {(esOferta || descuentoPorcentaje > 0) && (
          <Etiqueta tono={descuentoPorcentaje > 0 ? 'liquidacion' : 'oferta'}
            icono={descuentoPorcentaje > 0 ? Flame : Tag}
            className={esOferta ? 'px-2 py-1 text-[11px] shadow-sm' : ''}>
            {esOferta ? `OFERTA${rebaja > 0 ? ` · −${rebaja}%` : ''}` : `−${rebaja}%`}
          </Etiqueta>
        )}
        {stats?.esHabitual && (
          <Etiqueta tono="habitual" icono={Repeat}>{stats.veces}×</Etiqueta>
        )}
      </div>

      {/* La foto crece con la pantalla. Con dos productos por fila la
          tarjeta pasa de 180 a 325px de ancho en la tablet, y una foto de
          96px se veía perdida en tanto blanco. El alto sigue siendo fijo
          —no cuadrada— para que tres filas entren de alto. */}
      {foto ? (
        <button type="button" onClick={() => onVerProducto(product)}
          aria-label={`Ampliar imagen de ${product.name}`}
          className="relative h-28 w-full shrink-0 cursor-zoom-in bg-white p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primario-500 sm:h-36 lg:h-40">
          <img src={foto} alt={product.name} loading="lazy" decoding="async"
            className="h-full w-full object-contain mix-blend-multiply" />
          <span className="absolute bottom-2 right-2 rounded-lg bg-white/90 p-1.5 text-neutro-500 ring-1 ring-neutro-100" aria-hidden="true"><ZoomIn size={16} /></span>
        </button>
      ) : (
        <div className="relative h-28 bg-white p-2 sm:h-36 lg:h-40">
          <div className="flex h-full w-full items-center justify-center rounded-lg bg-neutro-50">
            <Package size={26} className="text-neutro-200 sm:h-9 sm:w-9" />
          </div>
        </div>
      )}

      <div className={`flex flex-1 flex-col gap-0.5 p-2 pt-1.5 sm:p-3 sm:pt-2 ${esOferta ? 'bg-acento-50' : ''}`}>
        {/* Dos familias pueden compartir fila. El rótulo tiene su espacio
            propio: pegado a la referencia y truncado ya no se podía leer.
            Sin subcategoría identifica los sueltos de una categoría dividida. */}
        {mostrarSubcategoria && subcategoria && (
          <p title={subcategoria} className={`mb-1 line-clamp-2 w-fit max-w-full rounded-md px-1.5 py-1 text-[11px] font-bold leading-4 sm:text-xs ${
            product.subcategoria?.nombre ? 'bg-primario-50 text-primario-700' : 'bg-neutro-50 text-neutro-500'
          }`}>
            {subcategoria}
          </p>
        )}
        <h3 className="line-clamp-2 min-h-[2rem] text-[11.5px] font-bold leading-[1rem] text-neutro-900 sm:min-h-[2.5rem] sm:text-sm sm:leading-5">
          {product.name}
        </h3>
        <p className="truncate text-[10px] font-medium text-neutro-400 sm:text-xs">
          {/* Con el rótulo: "7413475" a secas se lee como un número suelto. */}
          {product.reference?.reference || product.reference
            ? `Ref. ${product.reference?.reference || product.reference}`
            : 'sin referencia'}
        </p>

        <div className={`mt-auto ${esOferta ? 'rounded-xl bg-acento-100 px-2 py-1.5 sm:px-3 sm:py-2' : 'pt-1'}`}>
          <p className={`h-[13px] text-[10px] font-semibold line-through sm:h-4 sm:text-xs ${esOferta ? 'text-acento-700/70' : 'text-neutro-300'}`}>
            {precioTachado > 0 ? colones(precioTachado) : ''}
          </p>
          <p className={`text-[15px] font-extrabold leading-tight sm:text-xl ${esOferta ? 'text-acento-700' : descuentoPorcentaje > 0 ? 'text-nota-700' : 'text-neutro-900'}`}>
            {colones(precioFinal)}
          </p>

        </div>

      </div>
    </article>
  )
}

export default memo(TarjetaProductoAgente)
