import { ArrowLeft, Loader2, RotateCcw, Send, CheckCircle2 } from 'lucide-react'
import FilaProducto from './FilaProducto'
import Insignia from '../ui/Insignia'
import { formatCurrency, formatDate } from '../../utils/pagos'

/**
 * Revisar los precios de una factura.
 *
 * DOS CAMBIOS DE FONDO
 *
 * 1. Los productos pasaron de tarjetas de 400px a filas (ver FilaProducto).
 *    Con 10 productos de promedio —y hasta 89— la pantalla anterior era
 *    kilómetros de scroll para una tarea que se hace mirando una columna.
 *
 * 2. El botón de enviar estaba al final de todo. Ahora vive en una barra
 *    pegada abajo, igual que el cobro en Facturación: con 89 productos,
 *    llegar a enviar obligaba a recorrer la factura entera.
 *
 * YA ENVIADA = su factura de compra existe en Alegra. En ese caso la
 * pantalla queda de solo lectura: sin devolver, sin enviar y sin editar
 * precios. Antes el historial abría esta misma vista con todo activo, y
 * desde ahí se podía crear una SEGUNDA factura de compra por la misma
 * compra — con 838 facturas en ese estado, a un clic de distancia.
 */
export default function RevisionFactura({
  facturaSeleccionada, productos, productosAlegra, sugerenciasPrecio, preciosAjustados,
  loading, devolviendo, enviando,
  onVolver, onDevolver, onAjustarPrecio, onAplicarPrecioSugerido, onAbrirFactor, onEnviar
}) {
  const ajustados = Object.keys(preciosAjustados).filter(id => preciosAjustados[id] > 0).length
  const yaEnviada = facturaSeleccionada?.estado === 'ENVIADA'

  return (
    <div className="mx-auto max-w-5xl pb-6">
      <button
        onClick={onVolver}
        className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutro-500 transition-colors hover:text-primario-600"
      >
        <ArrowLeft size={18} /> Volver a la lista
      </button>

      {/* Cabecera con lo que identifica la factura y sus cifras. */}
      <div className="mb-4 rounded-2xl border border-neutro-200 bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-neutro-900 md:text-2xl">
              {facturaSeleccionada?.proveedorNombre}
            </h1>
            <p className="mt-0.5 text-sm text-neutro-500">
              Factura #{facturaSeleccionada?.numeroConsecutivo} · {formatDate(facturaSeleccionada?.fechaEmision)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Insignia tono={yaEnviada ? 'neutro' : 'exito'}>
              {yaEnviada ? 'Ya enviada' : 'Lista para enviar'}
            </Insignia>
            {!yaEnviada && (
              <button
                onClick={onDevolver}
                disabled={devolviendo}
                className="btn btn-outline flex items-center gap-1.5 text-sm disabled:opacity-50"
              >
                {devolviendo ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                Devolver
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-neutro-100 pt-3 text-sm">
          <span className="text-neutro-500">
            Total <span className="font-bold text-neutro-900">{formatCurrency(facturaSeleccionada?.totalFactura)}</span>
          </span>
          <span className="text-neutro-500">
            Productos <span className="font-bold text-neutro-900">{productos.length}</span>
          </span>
          {!yaEnviada && (
            <span className="text-neutro-500">
              Precios ajustados <span className={`font-bold ${ajustados > 0 ? 'text-alerta-600' : 'text-neutro-900'}`}>{ajustados}</span>
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <div className="spinner mx-auto mb-3" />
          <p className="text-neutro-500">Analizando productos…</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutro-200 bg-white">
          {/* Encabezado de columnas: solo donde las columnas existen. Es lo
              que convierte la lista en algo que se puede recorrer de arriba
              abajo mirando una sola cifra. */}
          <div className="hidden border-b border-neutro-200 bg-neutro-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-neutro-500 md:grid md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_1.3fr] md:gap-4">
            <span>Producto</span>
            <span>Costo nuevo</span>
            <span>Precio actual</span>
            <span>{yaEnviada ? 'Precio enviado' : 'Precio nuevo'}</span>
          </div>

          {productos.map(producto => (
            <FilaProducto
              key={producto.id}
              producto={producto}
              productosAlegra={productosAlegra}
              sugerenciasPrecio={sugerenciasPrecio}
              preciosAjustados={preciosAjustados}
              soloLectura={yaEnviada}
              onAjustarPrecio={onAjustarPrecio}
              onAplicarPrecioSugerido={onAplicarPrecioSugerido}
              onAbrirFactor={onAbrirFactor}
            />
          ))}
        </div>
      )}

      {yaEnviada ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-neutro-200 bg-neutro-50 p-4">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-exito-600" />
          <div>
            <p className="font-bold text-neutro-900">Esta factura ya se envió a Alegra</p>
            <p className="mt-1 text-sm text-neutro-600">
              Su factura de compra ya existe allá. No se puede volver a enviar ni devolver a
              relacionar: se crearía una segunda factura de compra por la misma compra y el gasto
              quedaría contado dos veces. Si de verdad hay que rehacerla, primero anulala en Alegra.
            </p>
          </div>
        </div>
      ) : (
        /* Barra de envío pegada abajo: con 89 productos, tenerla al final
           obligaba a recorrer la factura entera para cerrarla.

           Va `sticky` y no `fixed`: `fixed` la sacaba del flujo y la estiraba
           a todo el ancho de la ventana, así que en pantalla grande se metía
           por debajo del sidebar. Siendo sticky vive dentro de la columna del
           módulo y respeta el sidebar sola, sin cablear acá los 256px que
           mide. Al final del scroll aterriza donde termina la factura. */
        <div className="sticky bottom-0 z-30 -mx-4 mt-4 border-t border-neutro-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,.08)] sm:-mx-0 sm:rounded-t-2xl sm:border-x">
          <div className="flex items-center gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-neutro-900">
                {productos.length} {productos.length === 1 ? 'costo' : 'costos'}
                {ajustados > 0 && <span className="text-alerta-600"> · {ajustados} precios</span>}
              </p>
              <p className="truncate text-xs text-neutro-500">Se crea la factura de compra en Alegra</p>
            </div>
            <button
              onClick={onEnviar}
              disabled={enviando || loading}
              className="btn btn-primary flex shrink-0 items-center gap-2 px-6 py-3 font-bold disabled:opacity-50"
            >
              {enviando ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              {enviando ? 'Enviando…' : 'Enviar a Alegra'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
