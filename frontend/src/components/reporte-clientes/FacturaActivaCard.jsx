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
 *
 * Sobria a propósito (pedido del usuario, 2026-10-01): sin la línea de color
 * a la izquierda según el avance, sin fondos de color por sección. Quedan
 * la barra de progreso (azul avanzando, verde al 100 %) y "Sin Caja".
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

  const sinConfirmarCount = Math.max((progreso.conRespuesta || 0) - progreso.revisados, 0)

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-neutro-200">
      {/* Header: identidad de la factura + progreso + acciones */}
      <div className="p-5 border-b border-neutro-100">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="min-w-0">
            <h5 className="font-bold text-lg text-neutro-900">
              Factura #{factura.numero_factura}
              {esFacturaSinCaja && <span className="ml-2 px-2 py-0.5 text-xs bg-peligro-100 text-peligro-800 rounded-full align-middle">📦 Sin Caja</span>}
            </h5>
            <p className="text-sm text-neutro-500">{formatDate(factura.fecha_emision)}</p>
          </div>

          {/* Acciones principales a nivel de factura */}
          <div className="flex items-center gap-2 flex-wrap md:flex-nowrap flex-shrink-0">
            {sinConfirmarCount > 0 && (
              <button
                type="button"
                onClick={() => onMarcarFacturaRevisada && onMarcarFacturaRevisada(factura)}
                className="btn btn-sm bg-white text-neutro-800 border-neutro-300 hover:bg-neutro-50 font-semibold flex items-center gap-1.5 whitespace-nowrap"
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
                  ? 'bg-primario-600 text-white border-primario-600 hover:bg-primario-700 font-bold shadow-sm'
                  : 'bg-neutro-200 text-neutro-400 border-neutro-200 cursor-not-allowed opacity-60'
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
            <span className="font-semibold text-neutro-700">
              {todoRevisado
                ? `✓ Todo revisado — ${progreso.total} producto${progreso.total !== 1 ? 's' : ''}`
                : `${progreso.revisados} de ${progreso.total} revisados${sinConfirmarCount > 0 ? ` · ${sinConfirmarCount} listo${sinConfirmarCount !== 1 ? 's' : ''} para confirmar` : ''}`}
            </span>
            {!todoRevisado && (
              <span className="text-neutro-500 font-medium">{progreso.porRevisar} por revisar</span>
            )}
          </div>
          <div className="h-1.5 w-full bg-neutro-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${todoRevisado ? 'bg-exito-500' : 'bg-primario-500'}`}
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
              <div className="px-5 py-2 bg-neutro-50 border-y border-neutro-100 flex items-center gap-2">
                <Package size={13} className="text-neutro-400" />
                <span className="text-xs font-bold text-neutro-600 uppercase tracking-wider truncate">{provNombre}</span>
                <span className="text-[10px] text-neutro-400 font-medium">({productos.length})</span>
              </div>
              <div className="divide-y divide-neutro-50">
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
            <div className="p-4 bg-neutro-50 border-t border-neutro-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm font-medium text-neutro-800">
                Tenés <strong>{sinConfirmarCount}</strong> producto{sinConfirmarCount !== 1 ? 's' : ''} respondido{sinConfirmarCount !== 1 ? 's' : ''}. ¿Confirmar revisión?
              </p>
              <button
                type="button"
                onClick={() => onMarcarFacturaRevisada && onMarcarFacturaRevisada(factura)}
                className="w-full sm:w-auto px-5 py-2 bg-primario-600 text-white font-bold rounded-lg hover:bg-primario-700 text-sm shadow transition-colors flex items-center justify-center gap-2"
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
        <div className="px-5 py-6 text-center">
          <Check className="mx-auto text-neutro-400 mb-1.5" size={24} />
          <p className="text-sm text-neutro-800 font-medium">Todos los productos revisados.</p>
          <p className="text-xs text-neutro-500 mt-0.5">Ya podés enviar la factura a impresión.</p>
        </div>
      )}

      {/* Zona 2 — Revisados, colapsados al fondo */}
      {revisados.length > 0 && (
        <div className="border-t border-neutro-100">
          <button
            type="button"
            onClick={() => setMostrarRevisados(!mostrarRevisados)}
            className="w-full px-5 py-2.5 flex items-center gap-3 hover:bg-neutro-50 transition-colors"
          >
            <div className="h-[1px] flex-1 bg-neutro-200" />
            <span className="text-xs text-neutro-500 uppercase tracking-widest font-semibold flex items-center gap-1.5 whitespace-nowrap">
              <Check size={12} /> {revisados.length} revisado{revisados.length !== 1 ? 's' : ''}
              <ChevronDown size={13} className={`transition-transform ${mostrarRevisados ? 'rotate-180' : ''}`} />
            </span>
            <div className="h-[1px] flex-1 bg-neutro-200" />
          </button>

          {mostrarRevisados && (
            <div className="divide-y divide-neutro-100">
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
        <div className="p-4 bg-neutro-50 border-t border-neutro-100">
          <p className="text-sm text-neutro-800"><strong>📝 Encargos:</strong> {factura.observaciones_adicionales}</p>
        </div>
      )}
    </div>
  )
}
