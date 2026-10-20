import { Plus, Printer, Trash2, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'
import { formatDate, totalDeItems, subtotalDeItem, DESPUES } from '../../utils/impresionUtils'
import BuscadorProductoNuevo from './BuscadorProductoNuevo'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import { colones } from '../../utils/colones'

/**
 * Editar una factura antes de reimprimirla.
 *
 * QUÉ ESTABA CONFUSO
 * Era un bloque que reemplazaba la lista de facturas: al entrar a editar se
 * perdía de vista todo lo demás, y no cerraba con Escape porque no era un
 * modal. Adentro, cada línea se titulaba "Producto #1", "Producto #2" —el
 * nombre del producto quedaba metido en un campo deshabilitado— así que no
 * se sabía qué se estaba tocando sin leer los cuadritos grises.
 *
 * Los cinco campos entraban en una rejilla de 12 columnas donde el subtotal
 * ocupaba UNA, ilegible. Bajo cada referencia se repetía "Código original
 * (no editable)" en todas las líneas, que es ruido dicho quince veces.
 *
 * Y faltaba el número que importa: se editaban cantidades y precios sin ver
 * nunca el total nuevo. Estaba el "Total Original" arriba y nada más, así
 * que para saber en cuánto quedaba la factura había que sumar a mano.
 *
 * CÓMO QUEDÓ
 *   · Es el Modal del sistema: cierra con Escape, no deja correr la lista de
 *     atrás y en teléfono entra como hoja.
 *   · Cada línea se titula con el NOMBRE del producto.
 *   · Lo que no se puede editar se muestra como texto, no como campo gris —
 *     un campo deshabilitado invita a hacer clic y no explica por qué no
 *     responde.
 *   · El pie lleva el total nuevo y cuánto cambió contra el original.
 */
export default function FormularioEdicionFactura({
  facturaEditando,
  itemsEditados,
  cargandoItems,
  procesando,
  productoBusqueda,
  onCancelar,
  onAgregarItem,
  onEliminarItem,
  onItemChange,
  onIniciarBusqueda,
  onCambiarTermino,
  onSeleccionarProducto,
  onGuardar,
  emitible = false
}) {

  // El total de la factura que se va a imprimir, con el impuesto de cada
  // línea: el original también lo lleva. Una línea que se quita por faltante
  // ya viene en cero.
  const totalNuevo = totalDeItems(itemsEditados)
  const totalOriginal = Number(facturaEditando.total) || 0
  const diferencia = totalNuevo - totalOriginal

  return (
    <Modal
      onCerrar={onCancelar}
      titulo={`Factura ${facturaEditando.numero_factura}`}
      ancho="2xl"
      pie={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-neutro-400">Total nuevo</p>
            {/* Mientras las líneas vienen del servidor NO se muestra un total:
                un ₡0 con "−₡47.425 contra el original" se lee como una
                factura vaciada, y es solo que los datos no llegaron. */}
            {cargandoItems ? (
              <p className="text-xl font-extrabold text-neutro-300">—</p>
            ) : (
              <>
                <p className="text-xl font-extrabold text-neutro-900">{colones(totalNuevo)}</p>
                {Math.round(diferencia) !== 0 && (
                  <p className={`text-[11px] font-bold ${diferencia < 0 ? 'text-peligro-600' : 'text-exito-600'}`}>
                    {diferencia < 0 ? '−' : '+'}{colones(Math.abs(diferencia))} contra el original
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" onClick={onCancelar} disabled={procesando}>
              Cancelar
            </Boton>
            <Boton variante="secundario" onClick={() => onGuardar(DESPUES.GUARDAR)}
              cargando={procesando} disabled={cargandoItems}>
              Solo guardar
            </Boton>
            <Boton variante={emitible ? 'secundario' : 'primario'} icono={Printer} onClick={() => onGuardar(DESPUES.IMPRIMIR)}
              cargando={procesando} disabled={cargandoItems}>
              Guardar e imprimir
            </Boton>
            {/* Con correo: guarda los ajustes, emite y después imprime. */}
            {emitible && (
              <Boton variante="primario" icono={ShieldCheck} onClick={() => onGuardar(DESPUES.EMITIR)}
                cargando={procesando} disabled={cargandoItems}>
                Imprimir y emitir
              </Boton>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-2xl bg-neutro-50 px-4 py-3 text-[13px]">
          <span className="text-neutro-500">
            Cliente <span className="font-bold text-neutro-900">{facturaEditando.cliente_nombre}</span>
          </span>
          <span className="text-neutro-500">
            Emitida <span className="font-semibold text-neutro-700">{formatDate(facturaEditando.fecha_emision)}</span>
          </span>
          <span className="text-neutro-500">
            Total original <span className="font-semibold text-neutro-700">{colones(totalOriginal)}</span>
          </span>
        </div>

        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-neutro-900">
            Productos{' '}
            <span className="font-semibold text-neutro-400">
              {cargandoItems ? '' : `(${itemsEditados.length})`}
            </span>
          </h4>
          <Boton variante="secundario" tamano="sm" icono={Plus}
            onClick={onAgregarItem} disabled={cargandoItems}>
            Agregar producto
          </Boton>
        </div>

        {cargandoItems && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutro-400">
            <Loader2 size={18} className="animate-spin" />
            Trayendo las líneas de la factura…
          </div>
        )}

        <div className="space-y-3">
          {itemsEditados.map((item, index) => {
            const subtotal = subtotalDeItem(item)
            return (
              <div
                key={index}
                className={`rounded-2xl border p-4 ${
                  item.eliminar_por_faltante
                    ? 'border-peligro-200 bg-peligro-50/40'
                    : 'border-neutro-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {item.esNuevo ? (
                      <Insignia tono="alerta">Producto nuevo</Insignia>
                    ) : (
                      <>
                        {/* El nombre como título: antes vivía en un campo gris
                            y había que leerlo dentro del cuadro para saber qué
                            línea era. */}
                        <p className="truncate text-sm font-bold text-neutro-900">
                          {item.description || '(sin descripción)'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-neutro-400">
                          Ref. {item.reference || '—'}
                        </p>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onEliminarItem(index)}
                    aria-label={`Quitar ${item.description || 'producto'}`}
                    className="shrink-0 rounded-lg p-1.5 text-neutro-300 transition-colors hover:bg-peligro-50 hover:text-peligro-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {item.eliminar_por_faltante && (
                  <div className="mt-2 flex items-start gap-2 text-[12px] text-peligro-700">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <p>Se va a quitar de la factura al reimprimir: quedó como faltante sin recibir.</p>
                  </div>
                )}

                {/* Un producto nuevo sí necesita sus campos; uno que ya está
                    en la factura no, y mostrárselos deshabilitados solo invita
                    a hacer clic en algo que no responde. */}
                {item.esNuevo && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutro-400">
                        Referencia
                      </label>
                      <input
                        type="text"
                        value={item.reference || ''}
                        onChange={(e) => onItemChange(index, 'reference', e.target.value)}
                        onFocus={() => onIniciarBusqueda(index)}
                        placeholder="Código o referencia"
                        className="w-full rounded-xl border-2 border-neutro-200 px-3 py-2 text-sm font-semibold focus:border-acento-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutro-400">
                        Descripción
                      </label>
                      <input
                        type="text"
                        value={item.description || ''}
                        onChange={(e) => onItemChange(index, 'description', e.target.value)}
                        placeholder="Descripción del producto"
                        className="w-full rounded-xl border-2 border-neutro-200 px-3 py-2 text-sm font-semibold focus:border-acento-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutro-400">
                      Cantidad
                    </label>
                    <input
                      type="number" min="0" step="1" inputMode="numeric"
                      value={item.quantity}
                      onChange={(e) => onItemChange(index, 'quantity', e.target.value)}
                      onFocus={(e) => e.target.select()}
                      aria-label={`Cantidad de ${item.description || 'producto'}`}
                      className="w-24 rounded-xl border-2 border-neutro-200 px-3 py-2 text-center text-sm font-extrabold focus:border-acento-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutro-400">
                      Precio unitario
                    </label>
                    <input
                      type="number" min="0" step="0.01" inputMode="decimal"
                      value={item.price}
                      onChange={(e) => onItemChange(index, 'price', e.target.value)}
                      onFocus={(e) => e.target.select()}
                      aria-label={`Precio de ${item.description || 'producto'}`}
                      className="w-32 rounded-xl border-2 border-neutro-200 px-3 py-2 text-right text-sm font-semibold focus:border-acento-500 focus:outline-none"
                    />
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-neutro-400">Subtotal</p>
                    <p className={`text-base font-extrabold ${item.eliminar_por_faltante ? 'text-neutro-300 line-through' : 'text-neutro-900'}`}>
                      {colones(subtotal)}
                    </p>
                  </div>
                </div>

                <BuscadorProductoNuevo
                  item={item}
                  index={index}
                  productoBusqueda={productoBusqueda}
                  onIniciarBusqueda={onIniciarBusqueda}
                  onCambiarTermino={onCambiarTermino}
                  onSeleccionarProducto={onSeleccionarProducto}
                />
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
