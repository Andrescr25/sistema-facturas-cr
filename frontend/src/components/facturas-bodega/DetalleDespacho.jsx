import { ArrowLeft, CheckCircle, ClipboardList, Clock, Loader2, RefreshCw } from 'lucide-react'
import { formatCurrency, formatDate, getItemIdFromFacturaItem, horaDespacho } from '../../utils/facturasBodegaUtils'
import ItemFaltanteCard from './ItemFaltanteCard'

/**
 * El despacho de una factura, con la forma del detalle de los demás módulos:
 * volver arriba a la izquierda, el cliente grande con sus números, y abajo
 * los productos a revisar. La barra de acción va PEGADA ABAJO (sticky, no
 * fixed) para tenerla a mano sin bajar hasta el final de una factura larga.
 */
export default function DetalleDespacho({
  factura,
  faltantesDraft,
  checkedItemsCount,
  progressPercent,
  allItemsChecked,
  guardando,
  cargandoEstados,
  esEdicion,
  accionPrincipalLabel,
  onVolver,
  onMarcarModo,
  onCambiarCantidad,
  onCambiarObservacion,
  onGuardar,
  onVerImagen
}) {
  const totalItems = factura.items?.length || 0
  const cuando = horaDespacho(factura.despachada_en)
  const faltan = totalItems - checkedItemsCount

  return (
    <div>
      <button type="button" onClick={onVolver} className="-ml-2 mb-3 flex items-center rounded-xl px-2 py-2.5 text-neutro-500 transition-colors hover:text-primario-600">
        <ArrowLeft className="mr-2" size={20} /> Volver a facturas
      </button>

      <div className="mb-5 rounded-xl border border-neutro-100 bg-white p-5 shadow-sm sm:p-6">
        {/* En fila recién desde pantallas grandes: en tableta el nombre
            compartía la fila con los totales y se partía a media palabra. */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {/* En el teléfono el ícono se va: le quitaba ancho al nombre y lo
                partía a la mitad de una palabra. */}
            <div className="hidden shrink-0 rounded-xl bg-primario-100 p-3.5 sm:block">
              <ClipboardList className="text-primario-600" size={28} />
            </div>
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-bold leading-tight text-neutro-900 sm:text-3xl">{factura.cliente_nombre}</h1>
              <p className="mt-0.5 text-sm text-neutro-500">
                #{factura.numero_completo || factura.numero_factura} · emitida {formatDate(factura.fecha_emision)}
              </p>
            </div>
          </div>
          {/* En el teléfono, dos renglones; desde tableta, dos columnas. En
              columnas no entraba un total de siete cifras a 320-360 px. */}
          <div className="w-full shrink-0 rounded-xl bg-neutro-50 p-4 md:flex md:w-auto md:divide-x md:divide-neutro-200">
            <div className="flex items-baseline justify-between gap-3 md:block md:px-5 md:text-center">
              <p className="text-sm font-medium text-neutro-500">Productos</p>
              <p className="text-xl font-bold text-neutro-900 md:text-2xl">{totalItems}</p>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3 md:mt-0 md:block md:px-5 md:text-center">
              <p className="text-sm font-medium text-neutro-500">Total</p>
              <p className="whitespace-nowrap text-xl font-bold text-primario-600 md:text-2xl">{formatCurrency(factura.total)}</p>
            </div>
          </div>
        </div>



        {esEdicion && (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-neutro-50 px-4 py-3 text-sm text-neutro-600">
            <Clock size={16} className="shrink-0 text-neutro-400" />
            {cuando ? `Despachada ${cuando}` : 'Ya despachada'} · Estás revisando lo que se registró; si cambiás algo, guardalo.
          </p>
        )}

        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span className="text-neutro-500">Revisados</span>
            <span className={progressPercent === 100 ? 'text-exito-600' : 'text-primario-600'}>
              {checkedItemsCount} de {totalItems}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutro-100">
            <div
              className={`h-full rounded-full transition-all duration-300 ${progressPercent === 100 ? 'bg-exito-500' : 'bg-primario-600'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {cargandoEstados && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-primario-100 bg-primario-50 px-4 py-3 text-sm text-primario-800">
          <Loader2 size={16} className="animate-spin" /> Cargando lo que ya se había registrado…
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {factura.items?.map((item, index) => {
          const key = getItemIdFromFacturaItem(item) || `item-${index}`
          const cantidadFactura = Number(item?.cantidad ?? item?.quantity ?? 0)
          return (
            <ItemFaltanteCard
              key={`${key}-${index}`}
              item={item}
              draft={faltantesDraft[key]}
              cantidadFactura={cantidadFactura}
              deshabilitado={cargandoEstados || guardando}
              onMarcarModo={(modo) => onMarcarModo(key, modo, cantidadFactura)}
              onCambiarCantidad={(valor) => onCambiarCantidad(key, valor, cantidadFactura)}
              onCambiarObservacion={(texto) => onCambiarObservacion(key, texto)}
              onVerImagen={() => onVerImagen(item)}
            />
          )
        })}
      </div>

      <div className="sticky bottom-0 z-10 -mx-3 mt-4 border-t border-neutro-100 bg-white/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-sm">
        <button
          onClick={onGuardar}
          disabled={guardando || cargandoEstados || !allItemsChecked}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primario-600 py-4 text-base font-bold text-white shadow-lg transition-all hover:bg-primario-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-neutro-300 disabled:shadow-none"
        >
          {guardando ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle size={18} />}
          {allItemsChecked || guardando
            ? accionPrincipalLabel
            : `Faltan ${faltan} producto${faltan === 1 ? '' : 's'} por revisar`}
        </button>
      </div>
    </div>
  )
}
