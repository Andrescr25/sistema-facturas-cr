import { useState } from 'react'
import { Check, X, PencilLine, ChevronUp, ChevronDown, Loader2, Clock, Banknote } from 'lucide-react'

const colones = (n) => `₡${(Number(n) || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * El cierre de la factura: totales y el botón de facturar.
 *
 * EL PROBLEMA QUE RESUELVE
 * Antes esto vivía al final de la lista de productos, dentro de la misma
 * tarjeta. Con quince líneas en un teléfono había que recorrer la factura
 * entera para llegar al botón de finalizar — en la pantalla que más se usa
 * del negocio, y de pie frente al cliente.
 *
 * Ahora el cierre está siempre a la vista, de dos maneras según el ancho:
 *
 *   · En escritorio, una tarjeta pegada en la columna derecha. Esa columna
 *     ya estaba declarada en la rejilla (`lg:grid-cols-3` con el contenido
 *     ocupando dos) pero nunca se llenó: un tercio de la pantalla quedaba en
 *     blanco. Ahora es el panel de cobro.
 *   · En el teléfono, una barra fija abajo con el total y el botón. El
 *     desglose se abre tocándolo, porque lo que se necesita mirar seguido es
 *     el total, no el impuesto.
 */
import SelectorPago from './SelectorPago'

export default function PanelCobro({
  items,
  descuentoGlobal,
  impuestoPrincipal,
  subtotal,
  impuestosTotal,
  descuentoTotal,
  total,
  metodosPago,
  metodoPagoId,
  onElegirMetodoPago,
  referenciaPago,
  onCambiarReferenciaPago,
  modoEdicion,
  loading,
  clienteSeleccionado,
  onFinalizar,
  onCancelar
}) {
  const [desgloseAbierto, setDesgloseAbierto] = useState(false)

  const bloqueado = !clienteSeleccionado || items.length === 0 || loading

  // La etiqueta sale de las TARIFAS QUE HAY EN LA FACTURA, no del impuesto
  // principal. Decía "IVA 13 %" al lado de un monto que era 1 % + 2 %: el
  // cajero leía una contradicción y no sabía cuál de los dos creerle.
  const tarifas = [...new Set(
    items.map(i => Number(i.tax?.[0]?.percentage ?? impuestoPrincipal?.percentage ?? 0))
  )].sort((a, b) => a - b)

  const etiquetaImpuesto = tarifas.length === 0
    ? 'Impuestos'
    : tarifas.length === 1
      ? `IVA (${tarifas[0]}%)`
      : `IVA (${tarifas.join('%, ')}%)`

  const desglose = (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex justify-between text-neutro-600">
        <span>Subtotal</span>
        <span className="font-medium text-neutro-800">{colones(subtotal)}</span>
      </div>
      {descuentoGlobal > 0 && (
        <div className="flex justify-between text-alerta-600">
          <span>Descuento ({descuentoGlobal}%)</span>
          <span className="font-medium">−{colones(descuentoTotal)}</span>
        </div>
      )}
      <div className="flex justify-between text-neutro-600">
        <span className="truncate pr-2">{etiquetaImpuesto}</span>
        <span className="font-medium text-neutro-800">{colones(impuestosTotal)}</span>
      </div>
    </div>
  )

  // LO QUE VA A PASAR CON EL COBRO, A LA VISTA. En teléfono y tablet el
  // selector vive dentro del desglose, que está cerrado: se facturaba sin ver
  // si la venta iba a quedar pendiente o cobrada. La barra lo dice siempre.
  const metodoElegido = metodosPago?.find(m => m.id === metodoPagoId) || null
  const estadoCobro = modoEdicion || !metodosPago?.length ? null : (
    <span className={`mt-0.5 flex items-center gap-1 text-[11px] font-bold ${metodoElegido ? 'text-exito-700' : 'text-alerta-700'}`}>
      {metodoElegido ? <Banknote size={12} className="shrink-0" /> : <Clock size={12} className="shrink-0" />}
      <span className="truncate">{metodoElegido ? `Se cobra ahora: ${metodoElegido.name}` : 'Queda pendiente de cobro'}</span>
    </span>
  )

  // Editando una factura ya emitida no se cobra: el cobro se registra aparte.
  const selectorPago = !modoEdicion && metodosPago?.length > 0 ? (
    <SelectorPago
      metodos={metodosPago}
      metodoId={metodoPagoId}
      onElegirMetodo={onElegirMetodoPago}
      referencia={referenciaPago}
      onCambiarReferencia={onCambiarReferenciaPago}
    />
  ) : null

  const botones = (
    <div className="flex flex-col gap-2">
      <button
        onClick={onFinalizar}
        disabled={bloqueado}
        className={`btn flex w-full items-center justify-center gap-2 py-3 text-base font-bold disabled:opacity-50 ${
          modoEdicion ? 'bg-alerta-600 text-white hover:bg-alerta-700' : 'btn-primary'
        }`}
      >
        {loading
          ? <Loader2 size={20} className="animate-spin" />
          : modoEdicion ? <PencilLine size={20} /> : <Check size={20} strokeWidth={3} />}
        {loading ? 'Procesando…' : modoEdicion ? 'Guardar cambios' : 'Facturar'}
      </button>
      <button onClick={onCancelar} className="btn btn-outline flex w-full items-center justify-center gap-2">
        <X size={18} /> Cancelar
      </button>
    </div>
  )

  return (
    <>
      {/* ---------- Escritorio: columna derecha, pegada ---------- */}
      <aside className="hidden lg:block">
        <div className="card sticky top-6 flex flex-col gap-4 rounded-2xl p-5">
          <div className="flex items-baseline justify-between">
            <h3 className="font-bold text-neutro-900">Resumen</h3>
            <span className="text-xs text-neutro-500">
              {items.length} {items.length === 1 ? 'línea' : 'líneas'}
            </span>
          </div>

          {desglose}

          <div className="flex items-baseline justify-between border-t-2 border-neutro-200 pt-3">
            <span className="font-bold text-neutro-900">Total</span>
            <span className="text-2xl font-extrabold text-exito-600">{colones(total)}</span>
          </div>

          {selectorPago}

          {botones}
        </div>
      </aside>

      {/* ---------- Teléfono y tableta: barra fija abajo ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutro-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,.08)] lg:hidden">
        {/* El desglose se abre tocando el total, y con él aparece cancelar:
            en la barra cerrada solo cabe una acción, y esa tiene que ser la
            que se usa siempre. */}
        {desgloseAbierto && (
          <div className="flex flex-col gap-3 border-b border-neutro-100 px-4 py-3">
            {desglose}
            {selectorPago}
            <button onClick={onCancelar} className="btn btn-outline flex w-full items-center justify-center gap-2">
              <X size={18} /> Cancelar factura
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setDesgloseAbierto((v) => !v)}
            className="min-w-0 flex-1 text-left"
            aria-expanded={desgloseAbierto}
          >
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-neutro-500">
              Total · {items.length} {items.length === 1 ? 'línea' : 'líneas'}
              {desgloseAbierto ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </span>
            <span className="block truncate text-xl font-extrabold leading-tight text-exito-600">
              {colones(total)}
            </span>
            {estadoCobro}
          </button>

          <button
            onClick={onFinalizar}
            disabled={bloqueado}
            className={`btn flex shrink-0 items-center justify-center gap-2 px-6 py-3 text-base font-bold disabled:opacity-50 ${
              modoEdicion ? 'bg-alerta-600 text-white' : 'btn-primary'
            }`}
          >
            {loading
              ? <Loader2 size={20} className="animate-spin" />
              : modoEdicion ? <PencilLine size={20} /> : <Check size={20} strokeWidth={3} />}
            {loading ? 'Procesando…' : modoEdicion ? 'Guardar' : 'Facturar'}
          </button>
        </div>
      </div>
    </>
  )
}
