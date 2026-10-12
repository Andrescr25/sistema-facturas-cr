import { Plus, Trash2 } from 'lucide-react'
import { colones, colonesExacto } from '../../utils/colones'
import { num, baseDe, esDetallePropio } from '../../utils/facturaVista'
import { CELDA } from './estilosFactura'

/**
 * Las líneas de la factura. En edición cada dato se vuelve un input EN SU
 * PROPIA CELDA —la cantidad en su columna, el precio en la suya—.
 *
 * EL IMPUESTO NO SE ESCRIBE: la tarifa sale del maestro del producto. Dejarla
 * editable es el agujero por el que se facturaron productos al 1 % cobrando
 * 13 %.
 */
export default function LineasFactura({ filas, editando, edicion, totales }) {
  const { hayDescuento, impuestoDe } = totales
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-neutro-200 bg-neutro-50 text-left text-[10px] uppercase tracking-wider text-neutro-500">
            <th className="px-4 py-2 font-semibold">Producto / servicio</th>
            <th className="px-2 py-2 text-center font-semibold">Cant.</th>
            <th className="px-2 py-2 text-right font-semibold">Precio unit.</th>
            {hayDescuento && <th className="px-2 py-2 text-right font-semibold">Descuento</th>}
            <th className="px-2 py-2 text-right font-semibold">Impuesto</th>
            <th className="px-4 py-2 text-right font-semibold">Total línea</th>
            {editando && <th className="w-10 px-2 py-2" />}
          </tr>
        </thead>
        <tbody>
          {filas.map((l, i) => (
            <tr key={`${l.productoId}-${i}`} className="border-b border-neutro-100 last:border-0">
              <td className="px-4 py-2.5">
                <p className="font-semibold text-neutro-800">{l.nombre}</p>
                <p className="text-[11px] text-neutro-400">
                  {[l.referencia && `Ref: ${l.referencia}`, l.cabys && `CAByS: ${l.cabys}`].filter(Boolean).join('   ')}
                </p>
                {/* Lo que se escribió para ESTA línea al facturar. */}
                {editando ? (
                  <input
                    value={l.descripcion || ''}
                    onChange={(e) => edicion.cambiarLinea(i, 'descripcion', e.target.value.slice(0, 250))}
                    placeholder="Detalle de esta línea (opcional)"
                    aria-label={`Detalle de ${l.nombre}`}
                    className={`${CELDA} mt-1 max-w-md text-xs`}
                  />
                ) : esDetallePropio(l) && (
                  <p className="mt-0.5 text-xs italic text-neutro-600">{l.descripcion}</p>
                )}
              </td>

              <td className="px-2 py-2.5 text-center">
                {editando ? (
                  <input
                    type="number" min="0" step="1" value={l.cantidad}
                    onChange={(e) => edicion.cambiarLinea(i, 'cantidad', e.target.value)}
                    className={`${CELDA} max-w-[4.5rem] text-center`}
                  />
                ) : (
                  <span className="font-semibold text-neutro-800">{l.cantidad}</span>
                )}
              </td>

              <td className="px-2 py-2.5 text-right">
                {editando ? (
                  <input
                    type="number" min="0" step="0.01" value={l.precioUnitario}
                    onChange={(e) => edicion.cambiarLinea(i, 'precioUnitario', e.target.value)}
                    className={`${CELDA} max-w-[6.5rem] text-right`}
                  />
                ) : (
                  <span className="text-neutro-600">{colonesExacto(l.precioUnitario)}</span>
                )}
              </td>

              {hayDescuento && (
                <td className="px-2 py-2.5 text-right">
                  {editando ? (
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number" min="0" max="100" step="1" value={l.descuentoPorcentaje}
                        onChange={(e) => edicion.cambiarLinea(i, 'descuentoPorcentaje', e.target.value)}
                        className={`${CELDA} max-w-[3.5rem] text-right`}
                      />
                      <span className="text-xs text-neutro-400">%</span>
                    </div>
                  ) : (
                    <span className="text-alerta-600">
                      {num(l.descuentoPorcentaje) > 0 ? `−${l.descuentoPorcentaje}%` : '—'}
                    </span>
                  )}
                </td>
              )}

              <td className="px-2 py-2.5 text-right text-neutro-600">
                {colones(impuestoDe(l))}
                <span className="ml-1 text-[11px] text-neutro-400">{l.tarifa}%</span>
              </td>

              <td className="px-4 py-2.5 text-right font-bold text-neutro-900">{colones(baseDe(l))}</td>

              {editando && (
                <td className="px-2 py-2.5 text-right">
                  <button
                    onClick={() => edicion.quitarLinea(i)}
                    className="rounded-lg p-1.5 text-neutro-400 hover:bg-peligro-50 hover:text-peligro-600"
                    title="Quitar esta línea"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              )}
            </tr>
          ))}

          {/* Agregar un producto: una fila más de la misma tabla */}
          {editando && (
            <tr className="border-t border-neutro-200 bg-primario-50/30">
              <td colSpan={hayDescuento ? 7 : 6} className="px-4 py-2.5">
                <div className="relative max-w-md">
                  <Plus size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutro-400" />
                  <input
                    value={edicion.textoProducto}
                    onChange={(e) => edicion.setTextoProducto(e.target.value)}
                    placeholder="Agregar un producto: nombre o código…"
                    className={`${CELDA} pl-8`}
                  />
                </div>
                {edicion.productosEncontrados.length > 0 && (
                  <div className="mt-1.5 flex max-w-md flex-col gap-1">
                    {edicion.productosEncontrados.map(p => (
                      <button
                        key={p.id}
                        onClick={() => edicion.agregarProducto(p)}
                        className="flex items-center justify-between rounded-lg border border-neutro-200 bg-white px-2.5 py-1.5 text-left text-sm hover:border-primario-300"
                      >
                        <span className="min-w-0 truncate font-semibold text-neutro-800">{p.name}</span>
                        <span className="ml-2 shrink-0 text-neutro-500">{colones(p.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
