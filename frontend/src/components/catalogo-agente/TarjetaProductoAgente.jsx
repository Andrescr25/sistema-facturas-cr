import { memo } from 'react'
import { Package, Flame, TrendingDown, Repeat, AlertTriangle } from 'lucide-react'
import Etiqueta from './Etiqueta'
import { colones } from '../../utils/colones'

/**
 * Un producto en el catálogo del agente.
 *
 * QUÉ SE REDISEÑÓ Y POR QUÉ
 * La tarjeta anterior era alta y repetía en cada una "Incluye 13% IVA" —el
 * mismo texto ciento once veces— más el stock exacto de lo que sobraba
 * ("30 disp."). En una tablet de 9 pulgadas entraban ocho productos por
 * pantalla y el recorrido completo eran trece mil píxeles de scroll.
 *
 * Ahora: la foto manda, el nombre cabe en dos líneas, el precio es lo más
 * grande, y solo se dice del stock lo que cambia una decisión —quedan pocas,
 * o no hay—. Que haya treinta en bodega no es noticia.
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
function TarjetaProductoAgente({ product, stats, mostrarSubcategoria = true }) {
  const descuentoPorcentaje = product.descuentoPorcentaje > 0 ? product.descuentoPorcentaje : 0
  const precioAntes = Number(product.precioAntes) > 0 ? Number(product.precioAntes) : 0

  const favorita = product.images?.find((i) => i.favorite === true) || product.images?.[0]
  const foto = favorita?.url || null

  const listaPrecio = product.price?.[0]
  const base = listaPrecio?.price
    ? parseFloat(String(listaPrecio.price).replace(/,/g, ''))
    : 0
  const iva = (product.tax || []).reduce((s, t) => s + (parseFloat(t.percentage) || 0), 0)
  const precioConIva = base * (1 + iva / 100)
  const precioFinal = descuentoPorcentaje > 0
    ? precioConIva * (1 - descuentoPorcentaje / 100)
    : precioConIva

  // El tachado sale de la clase de oferta que corresponda; si no hay, no hay.
  const precioTachado = descuentoPorcentaje > 0
    ? precioConIva
    : (precioAntes > precioConIva ? precioAntes : 0)
  const rebaja = descuentoPorcentaje > 0
    ? descuentoPorcentaje
    : (precioTachado > 0 ? Math.round(((precioTachado - precioConIva) / precioTachado) * 100) : 0)

  const disponibles = (product.inventory?.warehouses || [])
    .reduce((s, w) => s + (parseFloat(w.availableQuantity) || 0), 0)


  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl bg-white ring-1 transition-shadow ${
        rebaja > 0 ? 'ring-acento-300' : 'ring-neutro-200'
      }`}
    >
      {/* Los avisos van sobre la foto y no debajo del nombre: es lo primero
          que el ojo encuentra al recorrer una cuadrícula. */}
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
        {rebaja > 0 && (
          <Etiqueta tono={descuentoPorcentaje > 0 ? 'liquidacion' : 'oferta'}
            icono={descuentoPorcentaje > 0 ? Flame : TrendingDown}>
            −{rebaja}%
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
      <div className="relative h-28 bg-white p-2 sm:h-36 lg:h-40">
        {foto ? (
          <img src={foto} alt={product.name} loading="lazy"
            className="h-full w-full object-contain mix-blend-multiply" />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-lg bg-neutro-50">
            <Package size={26} className="text-neutro-200 sm:h-9 sm:w-9" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-2 pt-1.5 sm:p-3 sm:pt-2">
        <h3 className="line-clamp-2 min-h-[2rem] text-[11.5px] font-bold leading-[1rem] text-neutro-900 sm:min-h-[2.5rem] sm:text-sm sm:leading-5">
          {product.name}
        </h3>
        <p className="truncate text-[10px] font-medium text-neutro-400 sm:text-xs">
          {/* Con el rótulo: "7413475" a secas se lee como un número suelto. */}
          {product.reference?.reference || product.reference
            ? `Ref. ${product.reference?.reference || product.reference}`
            : 'sin referencia'}
          {/* La subcategoría va en esta misma línea y no en una propia: en la
              tablet cada línea extra sale del alto de la foto.

              NO SE DICE CUANDO LA TARJETA YA ESTÁ DENTRO DE SU FAMILIA: bajo
              un encabezado que dice "PVC 1/2", repetirlo en las 32 tarjetas
              es el mismo ruido que el "Incluye 13% IVA" que se sacó de acá.
              Sí se dice en la búsqueda y en las secciones del cliente, que
              son listas mezcladas y ahí el dato ubica. */}
          {mostrarSubcategoria && product.subcategoria?.nombre && (
            <span className="font-semibold text-primario-600"> · {product.subcategoria.nombre}</span>
          )}
        </p>

        <div className="mt-auto pt-1">
          <p className="h-[13px] text-[10px] font-semibold text-neutro-300 line-through sm:h-4 sm:text-xs">
            {precioTachado > 0 ? colones(precioTachado) : ''}
          </p>
          <p className={`text-[15px] font-extrabold leading-tight sm:text-xl ${rebaja > 0 ? 'text-acento-600' : 'text-neutro-900'}`}>
            {colones(precioFinal)}
          </p>

          {/* Del stock solo se dice lo que cambia una decisión. Que haya
              treinta en bodega no es noticia; que queden dos, sí. */}
          {/* Alto fijo aunque no haya nada que decir: sin el hueco, la
              tarjeta sin etiqueta dejaba su precio más abajo que el de las
              vecinas y la fila entera se veía torcida. */}
          <div className="mt-1 flex h-[18px] items-center sm:h-5">
            {disponibles <= 0 ? (
              <Etiqueta tono="agotado" icono={AlertTriangle}>Agotado</Etiqueta>
            ) : disponibles <= 5 ? (
              <Etiqueta tono="ultimas">Quedan {disponibles}</Etiqueta>
            ) : null}
          </div>
        </div>

      </div>
    </article>
  )
}

export default memo(TarjetaProductoAgente)
