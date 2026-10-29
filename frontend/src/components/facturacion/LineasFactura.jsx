import { Plus, Trash2 } from 'lucide-react'
import { colones, colonesExacto } from '../../utils/colones'
import { num, baseDe, esDetallePropio } from '../../utils/facturaVista'
import { CELDA } from './estilosFactura'
import PrecioConIva from './PrecioConIva'
import { puedeAccion } from '../../utils/modulos'
import { useAuth } from '../../contexts/AuthContext'

/**
 * Las líneas de la factura. En edición cada dato se vuelve un input EN SU
 * PROPIO LUGAR —la cantidad donde va la cantidad, el precio donde va el
 * precio—.
 *
 * EN PANTALLA ANCHA ES UNA TABLA; EN EL TELÉFONO, UNA TARJETA POR LÍNEA
 * (pedido del usuario, 2026-10-19: «este módulo hazlo completamente
 * responsive»). La tabla de seis columnas no cabía en 390 px y cortaba el
 * precio, el descuento, el impuesto y el total. Cada campo es UN componente
 * de este archivo que usan las dos: no hay dos copias de cómo se edita.
 *
 * EL IMPUESTO NO SE ESCRIBE: la tarifa sale del maestro del producto. Dejarla
 * editable es el agujero por el que se facturaron productos al 1 % cobrando
 * 13 %.
 */
export default function LineasFactura({ filas, editando, edicion, totales }) {
  const { hayDescuento } = totales
  const comun = { editando, edicion, totales }
  // Sin «Cambiar precio y descuento», al editar se ven pero no se cambian.
  const { usuario } = useAuth()
  const fijo = { ...comun, editando: editando && puedeAccion(usuario, 'precio-factura') }
  return (
    <>
      {/* Teléfono y tablet angosta: una tarjeta por línea. */}
      <ul className="divide-y divide-neutro-100 md:hidden">
        {filas.map((l, i) => (
          <li key={`${l.productoId}-${i}`} className="px-4 py-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1"><Producto l={l} i={i} {...comun} /></div>
              {editando && <Quitar l={l} i={i} edicion={edicion} />}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
              <Campo etiqueta="Cantidad"><Cantidad l={l} i={i} {...comun} /></Campo>
              <Campo etiqueta="Precio unit."><Precio l={l} i={i} {...fijo} /></Campo>
              {hayDescuento && <Campo etiqueta="Descuento"><Descuento l={l} i={i} {...fijo} /></Campo>}
              <Campo etiqueta="Impuesto"><Impuesto l={l} totales={totales} /></Campo>
            </dl>
            <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-neutro-200 pt-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutro-500">Total línea</span>
              <span className="text-base font-bold text-neutro-900">{colones(baseDe(l))}</span>
            </div>
          </li>
        ))}
        {editando && <li className="bg-primario-50/30 px-4 py-3"><AgregarProducto edicion={edicion} /></li>}
      </ul>

      {/* Pantalla ancha: la tabla. */}
      <div className="hidden overflow-x-auto md:block">
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
                <td className="px-4 py-2.5"><Producto l={l} i={i} {...comun} /></td>
                <td className="px-2 py-2.5 text-center"><Cantidad l={l} i={i} {...comun} /></td>
                <td className="px-2 py-2.5 text-right"><Precio l={l} i={i} {...fijo} /></td>
                {hayDescuento && <td className="px-2 py-2.5 text-right"><Descuento l={l} i={i} {...fijo} /></td>}
                <td className="px-2 py-2.5 text-right"><Impuesto l={l} totales={totales} /></td>
                <td className="px-4 py-2.5 text-right font-bold text-neutro-900">{colones(baseDe(l))}</td>
                {editando && <td className="px-2 py-2.5 text-right"><Quitar l={l} i={i} edicion={edicion} /></td>}
              </tr>
            ))}

            {/* Agregar un producto: una fila más de la misma tabla */}
            {editando && (
              <tr className="border-t border-neutro-200 bg-primario-50/30">
                <td colSpan={hayDescuento ? 7 : 6} className="px-4 py-2.5"><AgregarProducto edicion={edicion} /></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** Una etiqueta y su dato, en la tarjeta del teléfono. */
function Campo({ etiqueta, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-neutro-400">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

function Producto({ l, i, editando, edicion }) {
  return (
    <>
      <p className="font-semibold text-neutro-800">{l.nombre}</p>
      <p className="break-words text-[11px] text-neutro-400">
        {[l.referencia && `Ref: ${l.referencia}`, l.cabys && `CAByS: ${l.cabys}`].filter(Boolean).join('   ')}
      </p>
      {/* Lo que se escribió para ESTA línea al facturar. */}
      {editando ? (
        <input
          value={l.descripcion || ''}
          onChange={(e) => edicion.cambiarLinea(i, 'descripcion', e.target.value.slice(0, 250))}
          placeholder="Detalle de esta línea (opcional)"
          aria-label={`Detalle de ${l.nombre}`}
          className={`${CELDA} mt-1 md:max-w-md md:text-xs`}
        />
      ) : esDetallePropio(l) && (
        <p className="mt-0.5 text-xs italic text-neutro-600">{l.descripcion}</p>
      )}
    </>
  )
}

function Cantidad({ l, i, editando, edicion }) {
  if (!editando) return <span className="font-semibold text-neutro-800">{l.cantidad}</span>
  return (
    <input
      type="number" min="0" step="1" inputMode="numeric" value={l.cantidad} aria-label={`Cantidad de ${l.nombre}`}
      onChange={(e) => edicion.cambiarLinea(i, 'cantidad', e.target.value)}
      className={`${CELDA} text-center md:max-w-[4.5rem]`}
    />
  )
}

function Precio({ l, i, editando, edicion }) {
  if (!editando) return <span className="text-neutro-600">{colonesExacto(l.precioUnitario)}</span>
  return (
    <input
      type="number" min="0" step="0.01" inputMode="decimal" value={l.precioUnitario} aria-label={`Precio de ${l.nombre}`}
      onChange={(e) => edicion.cambiarLinea(i, 'precioUnitario', e.target.value)}
      className={`${CELDA} text-right md:max-w-[6.5rem]`}
    />
  )
}

function Descuento({ l, i, editando, edicion }) {
  if (!editando) {
    return (
      <span className="text-alerta-600">
        {num(l.descuentoPorcentaje) > 0 ? `−${l.descuentoPorcentaje}%` : '—'}
      </span>
    )
  }
  return (
    <div className="flex items-center gap-1 md:justify-end">
      <input
        type="number" min="0" max="100" step="1" inputMode="decimal" value={l.descuentoPorcentaje} aria-label={`Descuento de ${l.nombre}`}
        onChange={(e) => edicion.cambiarLinea(i, 'descuentoPorcentaje', e.target.value)}
        className={`${CELDA} text-right md:max-w-[3.5rem]`}
      />
      <span className="text-xs text-neutro-400">%</span>
    </div>
  )
}

function Impuesto({ l, totales }) {
  return (
    <span className="text-neutro-600">
      {colones(totales.impuestoDe(l))}
      <span className="ml-1 text-[11px] text-neutro-400">{l.tarifa}%</span>
    </span>
  )
}

function Quitar({ l, i, edicion }) {
  return (
    <button
      type="button"
      onClick={() => edicion.quitarLinea(i)}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutro-400 hover:bg-peligro-50 hover:text-peligro-600 md:h-8 md:w-8"
      title="Quitar esta línea"
      aria-label={`Quitar ${l.nombre}`}
    >
      <Trash2 size={15} />
    </button>
  )
}

function AgregarProducto({ edicion }) {
  return (
    <>
      <div className="relative md:max-w-md">
        <Plus size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutro-400" />
        <input
          value={edicion.textoProducto}
          onChange={(e) => edicion.setTextoProducto(e.target.value)}
          placeholder="Agregar un producto: nombre o código…"
          className={`${CELDA} pl-8`}
        />
      </div>
      {edicion.productosEncontrados.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1 md:max-w-md">
          {edicion.productosEncontrados.map(p => (
            <button
              type="button"
              key={p.id}
              onClick={() => edicion.agregarProducto(p)}
              className="flex min-h-11 items-center justify-between rounded-lg border border-neutro-200 bg-white px-2.5 py-1.5 text-left text-sm hover:border-primario-300 md:min-h-0"
            >
              <span className="min-w-0 truncate font-semibold text-neutro-800">{p.name}</span>
              <PrecioConIva producto={p} className="ml-2 shrink-0 text-neutro-700" />
            </button>
          ))}
        </div>
      )}
    </>
  )
}
