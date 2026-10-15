import { Loader2, Truck } from 'lucide-react'
import Boton from '../ui/Boton'
import { fechaCorta } from '../../utils/fechaCR'
import { formatearMoneda } from '../../utils/moneda'

export default function ProveedoresProducto({ relaciones, cargando, error, reintentar }) {
  if (cargando) return (
    <p role="status" className="flex items-center gap-2 py-8 text-sm text-neutro-600">
      <Loader2 size={18} className="animate-spin" /> Cargando proveedores…
    </p>
  )
  if (error) return (
    <div role="alert" className="space-y-3 rounded-xl bg-peligro-50 p-4 text-sm text-peligro-800">
      <p>{error}</p>
      <Boton type="button" variante="secundario" onClick={reintentar}>Reintentar</Boton>
    </div>
  )
  if (!relaciones.length) return (
    <div className="rounded-2xl border border-neutro-200 bg-neutro-50 px-5 py-8 text-center">
      <Truck size={24} className="mx-auto mb-3 text-neutro-400" />
      <p className="font-semibold text-neutro-800">Sin proveedores relacionados</p>
      <p className="mt-1 text-sm text-neutro-600">Aparecerán al relacionar este producto con una factura de proveedor.</p>
    </div>
  )
  return (
    <div className="space-y-3">
      <p className="text-xs text-neutro-500">Último costo facturado por unidad propia, con descuento e IVA. No incluye regalías.</p>
      {relaciones.map(r => (
        <article key={r.mapeoId} className="min-w-0 space-y-3 rounded-2xl border border-neutro-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 basis-40">
              <h3 className="break-words font-bold text-neutro-900">{r.proveedor.nombre}</h3>
              <p className="text-xs text-neutro-500">{r.proveedor.cedula}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold uppercase text-neutro-500">Costo unitario con IVA</p>
              <p className="text-lg font-bold text-primario-800">
                {r.precio === null ? 'Sin costo registrado' : formatearMoneda(r.precio, r.moneda)}
              </p>
              {r.fechaUltimoCosto && <p className="text-xs text-neutro-500">{fechaCorta(r.fechaUltimoCosto)}</p>}
            </div>
          </div>
          <div className="rounded-xl bg-neutro-50 p-3">
            <p className="text-[11px] font-bold uppercase text-neutro-500">Nombre en la factura del proveedor</p>
            <p className="mt-1 break-words text-sm text-neutro-800">{r.descripcionProveedor || 'Sin descripción registrada'}</p>
            <p className="mt-1 break-all text-xs text-neutro-500">Código: {r.codigoProveedor || '—'}</p>
          </div>
          {r.precioProveedor !== null && r.factorConversion !== 1 && (
            <p className="text-xs text-neutro-600">
              Unidad del proveedor: {formatearMoneda(r.precioProveedor, r.moneda)} con IVA
              {' · '}1 unidad del proveedor = {r.factorConversion.toLocaleString('es-CR', { maximumFractionDigits: 6 })} propias.
            </p>
          )}
        </article>
      ))}
    </div>
  )
}
