import { Plus, Minus, Package, Flame, TrendingDown, Repeat, AlertTriangle } from 'lucide-react'
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
export default function TarjetaProductoAgente({ product, stats, cantidad = 0, onCambiar }) {
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

  const puedePedir = typeof onCambiar === 'function'

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl bg-white ring-1 transition-shadow ${
        rebaja > 0 ? 'ring-acento-300' : 'ring-neutro-200'
      } ${cantidad > 0 ? 'ring-2 ring-primario-600' : ''}`}
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
        <p className="text-[10px] font-medium text-neutro-400 sm:text-xs">
          {/* Con el rótulo: "7413475" a secas se lee como un número suelto. */}
          {product.reference?.reference || product.reference
            ? `Ref. ${product.reference?.reference || product.reference}`
            : 'sin referencia'}
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

        {/* Sin cliente elegido la tarjeta queda de solo mirar: un pedido sin
            cliente no se puede guardar, y descubrirlo recién al enviarlo
            sería perder el trabajo de armarlo. */}
        {puedePedir && (
          <div className="mt-1.5 sm:mt-2">
            {cantidad > 0 ? (
              <div className="flex items-center gap-1 rounded-xl bg-primario-50 p-1">
                <button type="button" aria-label={`Quitar uno de ${product.name}`}
                  onClick={() => onCambiar(product, cantidad - 1)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-primario-800 ring-1 ring-primario-200 active:scale-95 sm:h-10 sm:w-10">
                  <Minus size={15} strokeWidth={3} />
                </button>
                <input type="number" min="0" inputMode="numeric"
                  aria-label={`Cantidad de ${product.name}`}
                  value={cantidad}
                  onChange={(e) => onCambiar(product, e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-full min-w-0 bg-transparent text-center text-sm font-extrabold text-primario-900 focus:outline-none sm:text-base" />
                <button type="button" aria-label={`Agregar uno de ${product.name}`}
                  onClick={() => onCambiar(product, cantidad + 1)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primario-800 text-white active:scale-95 sm:h-10 sm:w-10">
                  <Plus size={15} strokeWidth={3} />
                </button>
              </div>
            ) : (
              /* 36px de alto es el mínimo que un dedo acierta sin mirar, que
                 es como se usa esto — de pie, con el cliente enfrente. En la
                 tablet, donde hay lugar, se le dan 44. */
              <button type="button"
                onClick={() => onCambiar(product, 1)}
                className="flex h-9 w-full items-center justify-center gap-1 rounded-xl bg-neutro-100 text-xs font-bold text-neutro-700 transition-colors active:scale-95 hover:bg-primario-800 hover:text-white sm:h-11 sm:text-sm">
                <Plus size={14} strokeWidth={3} />
                Agregar
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
