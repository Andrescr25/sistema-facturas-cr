import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { useComprasParaRevisar } from '../../hooks/useComprasParaRevisar'
import { formatDate } from '../../utils/pagos'
import { MOTIVOS_PARA_REVISAR } from '../../utils/compraRegistrada'

/**
 * Arriba de «Registradas»: las compras con alguna línea que no cuadra, para
 * no tener que abrir factura por factura (2026-11-05). Cada una abre la
 * compra, donde se corrige. Medido en una copia de producción: 165 líneas.
 */
export default function ComprasParaRevisar({ onAbrir }) {
  const { datos, error } = useComprasParaRevisar()
  const [abierto, setAbierto] = useState(false)
  if (error) return <p className="mb-4 text-sm text-peligro-700">{error}</p>
  if (!datos?.facturas.length) return null

  const abrir = (f) => onAbrir({
    id: f.facturaId, estado: 'ENVIADA', proveedorNombre: f.proveedor, numeroConsecutivo: f.numero,
    fechaEmision: f.fecha, totalFactura: f.total, productos: []
  })

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-alerta-300 bg-white">
      <button type="button" onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-alerta-50">
        {abierto ? <ChevronDown size={18} className="shrink-0 text-neutro-400" /> : <ChevronRight size={18} className="shrink-0 text-neutro-400" />}
        <AlertTriangle size={20} className="shrink-0 text-alerta-600" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-neutro-900">
            {datos.lineas}{datos.tope ? '+' : ''} {datos.lineas === 1 ? 'línea' : 'líneas'} en {datos.facturas.length} {datos.facturas.length === 1 ? 'compra' : 'compras'} no cuadran
          </span>
          <span className="block text-sm text-neutro-500">El producto de la compra no es el de la relación o el de Revisión de Precios, o quedó sin producto.</span>
        </span>
      </button>
      {abierto && (
        <ul className="divide-y divide-neutro-100 border-t border-neutro-100">
          {datos.facturas.map((f) => (
            <li key={f.facturaId}>
              <button type="button" onClick={() => abrir(f)} className="w-full px-4 py-3 text-left transition-colors hover:bg-neutro-50">
                <p className="font-semibold text-neutro-900">{f.proveedor}</p>
                <p className="text-sm text-neutro-500">Factura #{f.numero} · {formatDate(f.fecha)}</p>
                <ul className="mt-1.5 space-y-1">
                  {f.lineas.map((l) => (
                    <li key={l.id} className="text-sm text-neutro-700">
                      <span className="font-medium">{l.descripcion}</span>
                      <span className="text-neutro-500"> · {MOTIVOS_PARA_REVISAR[l.motivo](l)}</span>
                    </li>
                  ))}
                </ul>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
