import { useState } from 'react'
import { Loader2, PackageSearch, ChevronDown, ChevronUp } from 'lucide-react'
import { formatCurrency } from '../../utils/pagos'

/**
 * Qué trae la factura, línea por línea.
 *
 * Existía solo en Pagos a Proveedores; ahora también en Cuentas por Cobrar,
 * que es lo que se pidió. Una sola tabla para los dos: cada módulo trae sus
 * líneas de su documento propio, con la misma forma para dibujarlas.
 *
 * OJO CON LAS DOS COLUMNAS DE PLATA
 * La factura guarda el precio unitario SIN impuesto y el total de la línea CON
 * impuesto. Multiplicar cantidad por precio no da el total, y eso se lee
 * como un error de la pantalla si no está dicho. Por eso el encabezado lo
 * aclara en vez de dejar dos números que no cuadran.
 *
 * Viene plegada: en una factura de veinte líneas, quien abre el modal
 * normalmente va a cobrar, no a auditar el detalle.
 */
export default function TablaProductosFactura({ productos, cargando, error, onReintentar, abiertaPorDefecto = false }) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto)

  const cantidad = productos?.length || 0

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl bg-neutro-50 px-4 py-3 text-left transition-colors hover:bg-neutro-100"
        aria-expanded={abierta}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-neutro-700">
          <PackageSearch size={16} className="text-neutro-400" />
          Productos de la factura
          {!cargando && cantidad > 0 && (
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-neutro-600">{cantidad}</span>
          )}
        </span>
        {cargando
          ? <Loader2 size={16} className="animate-spin text-neutro-400" />
          : abierta ? <ChevronUp size={16} className="text-neutro-400" /> : <ChevronDown size={16} className="text-neutro-400" />}
      </button>

      {abierta && (
        <div className="mt-2">
          {cargando ? (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-neutro-400">
              <Loader2 size={14} className="animate-spin" /> Cargando el detalle…
            </p>
          ) : error ? (
            <div role="alert" className="rounded-xl bg-alerta-50 px-4 py-3 text-sm text-alerta-900">
              <p>{error}</p>
              {onReintentar && <button type="button" onClick={onReintentar}
                className="mt-1 min-h-11 font-bold underline">Reintentar</button>}
            </div>
          ) : cantidad === 0 ? (
            <p className="rounded-xl bg-neutro-50 px-4 py-3 text-center text-sm text-neutro-500">
              Esta factura no trae detalle de productos.
            </p>
          ) : (
            <>
              {/* Teléfono: una ficha por línea. Una tabla de cinco columnas
                  en 390px obliga a desplazarse de lado por cada producto. */}
              <div className="divide-y divide-neutro-100 overflow-hidden rounded-xl border border-neutro-100 sm:hidden">
                {productos.map((p) => (
                  <div key={p.id} className="px-3 py-2.5">
                    <p className="text-sm font-semibold leading-snug text-neutro-800">{p.descripcion}</p>
                    <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-neutro-500">
                        {p.codigo && <span className="mr-2">{p.codigo}</span>}
                        {p.cantidad} × {formatCurrency(p.precioUnitario)}
                        {p.descuento > 0 && <span className="ml-1 font-bold text-alerta-600">−{p.descuento}%</span>}
                      </span>
                      <span className="font-bold text-neutro-900">{formatCurrency(p.total)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-neutro-100 sm:block">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutro-50">
                    <tr className="text-left text-neutro-500">
                      <th className="px-3 py-2 font-semibold">Descripción</th>
                      <th className="px-3 py-2 font-semibold">Código</th>
                      <th className="px-3 py-2 text-right font-semibold">Cant.</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Precio <span className="font-normal text-neutro-400">sin imp.</span>
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Total <span className="font-normal text-neutro-400">con imp.</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutro-100 text-neutro-700">
                    {productos.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2">{p.descripcion}</td>
                        <td className="px-3 py-2 text-xs text-neutro-500">{p.codigo || '—'}</td>
                        <td className="px-3 py-2 text-right">{p.cantidad}</td>
                        <td className="px-3 py-2 text-right">
                          {formatCurrency(p.precioUnitario)}
                          {p.descuento > 0 && (
                            <span className="ml-1 text-xs font-bold text-alerta-600">−{p.descuento}%</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-neutro-900">{formatCurrency(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
