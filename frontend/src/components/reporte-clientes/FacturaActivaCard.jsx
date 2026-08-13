import { useState } from 'react'
import { Check, Package, Printer, ChevronDown } from 'lucide-react'
import { FilaPorRevisar, FilaRevisada } from './FilaProducto'
import {
  getProductKey,
  getEntregaInfo,
  getFacturaProgreso,
  productosValidosDe,
  productoEstaRevisado,
  facturaListaParaImprimir,
  formatDate
} from '../../utils/reporteClientesUtils'

/**
 * Tarjeta de una factura activa dentro del detalle de cliente, planteada como
 * un checklist de bodega: por cada producto se responde una sola pregunta
 * (¿qué llegó?). Arriba lo que falta por responder, agrupado por proveedor;
 * al fondo lo ya revisado, colapsado tras un divisor.
 * Extraído de ReporteClientes.jsx (antes renderFacturaActiva).
 */
export default function FacturaActivaCard({
  factura,
  clienteNombre,
  entregasAjustadas,
  onFacturaLista,
  onCantidadEntregadaChange,
  onMarcarCompleto,
  onNoLlegoNada,
  onDeshacer,
  onMarcarFacturaRevisada,
  onReabrirRevision,
  onQuitarRespuesta
}) {
  const [mostrarRevisados, setMostrarRevisados] = useState(false)

  const productosValidos = productosValidosDe(factura)
  const esFacturaSinCaja = (factura.total_items_factura || 0) > 0 && productosValidos.filter(p => p.tipo_faltante === 'total').length >= factura.total_items_factura

  const progreso = getFacturaProgreso(factura, entregasAjustadas)
  const todoRevisado = facturaListaParaImprimir(factura, entregasAjustadas)

  const porRevisar = productosValidos.filter(p => !productoEstaRevisado(factura, p, entregasAjustadas))
  const revisados = productosValidos.filter(p => productoEstaRevisado(factura, p, entregasAjustadas))

  // Los que faltan por revisar se agrupan por proveedor: así se recorre la
  // bodega proveedor por proveedor. Los ya revisados no necesitan el grupo.
  const gruposPorProveedor = new Map()
  porRevisar.forEach(producto => {
    const prov = producto.proveedor_asignado || producto.proveedor || 'Sin proveedor'
    if (!gruposPorProveedor.has(prov)) gruposPorProveedor.set(prov, [])
    gruposPorProveedor.get(prov).push(producto)
  })

  const bordeIzquierdo = todoRevisado
    ? 'border-l-green-400'
    : esFacturaSinCaja
      ? 'border-l-red-400'
      : progreso.revisados > 0
        ? 'border-l-amber-300'
        : 'border-l-gray-200'

  const sinConfirmarCount = Math.max((progreso.conRespuesta || 0) - progreso.revisados, 0)

  return (
    <div className={`bg-white rounded-xl shadow-sm overflow-hidden border-l-4 transition-all ${bordeIzquierdo}`}>
      {/* Header: identidad de la factura + progreso + acciones */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="min-w-0">
            <h5 className="font-bold text-lg text-gray-900">
              Factura #{factura.numero_factura}
              {esFacturaSinCaja && <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded-full align-middle">📦 Sin Caja</span>}
            </h5>
            <p className="text-sm text-gray-500">{formatDate(factura.fecha_emision)}</p>
          </div>

          {/* Acciones principales a nivel de factura */}
          <div className="flex items-center gap-2 flex-wrap md:flex-nowrap flex-shrink-0">
            {sinConfirmarCount > 0 && (
              <button
                type="button"
                onClick={() => onMarcarFacturaRevisada && onMarcarFacturaRevisada(factura)}
                className="btn btn-sm bg-blue-600 text-white border-blue-600 hover:bg-blue-700 font-semibold shadow-sm flex items-center gap-1.5 whitespace-nowrap"
              >
                <Check size={15} />
                Confirmar revisión ({sinConfirmarCount})
              </button>
            )}

            <button
              type="button"
              onClick={() => onFacturaLista(clienteNombre, factura)}
              disabled={!todoRevisado}
              title={!todoRevisado ? `Falta revisar ${progreso.porRevisar} producto(s)` : 'Enviar a impresión'}
              className={`btn btn-sm whitespace-nowrap flex items-center gap-1.5 ${
                todoRevisado
                  ? 'bg-green-600 text-white border-green-600 hover:bg-green-700 font-bold shadow-sm'
                  : 'bg-gray-200 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
              }`}
            >
              <Printer size={15} />
              Enviar a impresión
            </button>
          </div>
        </div>

        {/* Progreso del checklist */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className={`font-semibold ${todoRevisado ? 'text-green-700' : 'text-gray-600'}`}>
              {todoRevisado
                ? `✓ Todo revisado — ${progreso.total} producto${progreso.total !== 1 ? 's' : ''}`
                : `${progreso.revisados} de ${progreso.total} revisados${sinConfirmarCount > 0 ? ` · ${sinConfirmarCount} listo${sinConfirmarCount !== 1 ? 's' : ''} para confirmar` : ''}`}
            </span>
            {!todoRevisado && (
              <span className="text-amber-700 font-medium">{progreso.porRevisar} por revisar</span>
            )}
          </div>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${todoRevisado ? 'bg-green-500' : 'bg-amber-400'}`}
              style={{ width: `${progreso.porcentaje}%` }}
            />
          </div>
        </div>
      </div>

      {/* Zona 1 — Por revisar, agrupados por proveedor */}
      {porRevisar.length > 0 && (
        <div>
          {[...gruposPorProveedor.entries()].map(([provNombre, productos]) => (
            <div key={provNombre}>
              <div className="px-5 py-2 bg-purple-50 border-y border-purple-100 flex items-center gap-2">
                <Package size={13} className="text-purple-500" />
                <span className="text-xs font-bold text-purple-700 uppercase tracking-wider truncate">{provNombre}</span>
                <span className="text-[10px] text-purple-400 font-medium">({productos.length})</span>
              </div>
              <div className="divide-y divide-gray-50">
                {productos.map(producto => {
                  const productoKey = getProductKey(factura, producto)
                  const entrega = getEntregaInfo(productoKey, producto, entregasAjustadas)
                  return (
                    <FilaPorRevisar
                      key={productoKey}
                      producto={producto}
                      productoKey={productoKey}
                      entrega={entrega}
                      onMarcarCompleto={onMarcarCompleto}
                      onNoLlegoNada={onNoLlegoNada}
                      onCantidadEntregadaChange={onCantidadEntregadaChange}
                      onQuitarRespuesta={onQuitarRespuesta}
                    />
                  )
                })}
              </div>
            </div>
          ))}

          {/* Barra de confirmación a nivel de factura al final de los productos por revisar */}
          {sinConfirmarCount > 0 && (
            <div className="p-4 bg-blue-50/90 border-t border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm font-medium text-blue-900">
                Tenés <strong>{sinConfirmarCount}</strong> producto{sinConfirmarCount !== 1 ? 's' : ''} respondido{sinConfirmarCount !== 1 ? 's' : ''}. ¿Confirmar revisión?
              </p>
              <button
                type="button"
                onClick={() => onMarcarFacturaRevisada && onMarcarFacturaRevisada(factura)}
                className="w-full sm:w-auto px-5 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 text-sm shadow transition-colors flex items-center justify-center gap-2"
              >
                <Check size={16} />
                Marcar factura como revisada
              </button>
            </div>
          )}
        </div>
      )}

      {/* Todo listo dentro de la factura */}
      {porRevisar.length === 0 && progreso.total > 0 && (
        <div className="px-5 py-6 text-center bg-green-50/40">
          <Check className="mx-auto text-green-500 mb-1.5" size={24} />
          <p className="text-sm text-green-800 font-medium">Todos los productos revisados.</p>
          <p className="text-xs text-green-700 mt-0.5">Ya podés enviar la factura a impresión.</p>
        </div>
      )}

      {/* Zona 2 — Revisados, colapsados al fondo */}
      {revisados.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            type="button"
            onClick={() => setMostrarRevisados(!mostrarRevisados)}
            className="w-full px-5 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors"
          >
            <div className="h-[1px] flex-1 bg-gray-200" />
            <span className="text-xs text-gray-500 uppercase tracking-widest font-semibold flex items-center gap-1.5 whitespace-nowrap">
              <Check size={12} /> {revisados.length} revisado{revisados.length !== 1 ? 's' : ''}
              <ChevronDown size={13} className={`transition-transform ${mostrarRevisados ? 'rotate-180' : ''}`} />
            </span>
            <div className="h-[1px] flex-1 bg-gray-200" />
          </button>

          {mostrarRevisados && (
            <div className="divide-y divide-gray-100">
              {revisados.map(producto => {
                const productoKey = getProductKey(factura, producto)
                return (
                  <FilaRevisada
                    key={productoKey}
                    producto={producto}
                    productoKey={productoKey}
                    entrega={getEntregaInfo(productoKey, producto, entregasAjustadas)}
                    onDeshacer={onDeshacer}
                    onReabrirRevision={onReabrirRevision}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Observaciones adicionales */}
      {factura.observaciones_adicionales && (
        <div className="p-4 bg-yellow-50 border-t border-yellow-200">
          <p className="text-sm text-yellow-800"><strong>📝 Encargos:</strong> {factura.observaciones_adicionales}</p>
        </div>
      )}
    </div>
  )
}
