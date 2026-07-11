import { Check, X, Clock, Undo2, Calculator, Package } from 'lucide-react'
import { getFacturaKey, getProductKey, getEntregaInfo, getFacturaEstado, formatDate, formatDateTime } from '../../utils/reporteClientesUtils'

/**
 * Tarjeta de una factura activa (no procesada) dentro del detalle de
 * cliente: header con acciones, y productos con faltantes agrupados por
 * proveedor, cada uno con su control de cantidad entregada.
 * Extraído de ReporteClientes.jsx (antes renderFacturaActiva).
 */
export default function FacturaActivaCard({
  factura,
  clienteNombre,
  facturasEstado,
  entregasAjustadas,
  onFacturaLista,
  onMarcarPendiente,
  onQuitarPendiente,
  onCantidadEntregadaChange,
  onMarcarCompleto,
  onNoLlegoNada,
  onDeshacer
}) {
  const estadoFactura = getFacturaEstado(factura, facturasEstado)
  const estaPendienteManual = estadoFactura.estado === 'pendiente' && estadoFactura.origen === 'manual'
  const productosValidos = factura.productos_faltantes.filter(p => Number(p.cantidad_faltante) > 0)
  const esFacturaSinCaja = (factura.total_items_factura || 0) > 0 && productosValidos.filter(p => p.tipo_faltante === 'total').length >= factura.total_items_factura

  // Agrupar productos por proveedor
  const gruposPorProveedor = new Map()
  productosValidos.forEach(producto => {
    const prov = producto.proveedor_asignado || producto.proveedor || 'Sin proveedor'
    if (!gruposPorProveedor.has(prov)) gruposPorProveedor.set(prov, [])
    gruposPorProveedor.get(prov).push(producto)
  })

  return (
    <div className={`bg-white rounded-xl shadow-sm overflow-hidden border-l-4 transition-all ${estaPendienteManual ? 'border-l-yellow-400' : esFacturaSinCaja ? 'border-l-red-400' : 'border-l-gray-200'
      }`}>
      {/* Header Factura */}
      <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-50">
        <div>
          <h5 className="font-bold text-lg text-gray-900">
            Factura #{factura.numero_factura}
            {estaPendienteManual && <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">⏳ Pendiente</span>}
            {esFacturaSinCaja && <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded-full">📦 Sin Caja</span>}
          </h5>
          <p className="text-sm text-gray-500">Fecha: {formatDate(factura.fecha_emision)}</p>
          {estaPendienteManual && estadoFactura.timestamp && <p className="text-xs text-yellow-700 mt-1">Pendiente desde: {formatDateTime(estadoFactura.timestamp)}</p>}
          {estaPendienteManual && estadoFactura.motivo && <p className="text-xs text-yellow-700">Motivo: {estadoFactura.motivo}</p>}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right mr-2">
            <p className="text-sm font-medium text-gray-700">{productosValidos.length} producto{productosValidos.length !== 1 ? 's' : ''}</p>
            {(() => {
              if (estaPendienteManual) return <p className="text-xs text-yellow-600">⌛ Esperando entrega</p>
              const ajustesF = factura.productos_faltantes.map(p => entregasAjustadas.get(getProductKey(factura, p))).filter(Boolean)
              if (ajustesF.length === 0) return null
              if (ajustesF.every(a => a.estado === 'completo')) return <p className="text-xs text-green-600">✓ Resuelto</p>
              if (ajustesF.some(a => a.requiereActualizacion)) return <p className="text-xs text-blue-600">✓ Con ajustes</p>
              return null
            })()}
          </div>
          <div className="flex flex-col gap-1.5">
            <button onClick={() => onFacturaLista(clienteNombre, factura)} className="btn btn-primary btn-sm whitespace-nowrap"><Check size={14} className="mr-1" /> Lista</button>
            {estaPendienteManual ? (
              <button onClick={() => onQuitarPendiente(factura, clienteNombre)} className="btn btn-outline btn-sm text-yellow-800 border-yellow-500 hover:bg-yellow-50 whitespace-nowrap"><X size={14} className="mr-1" /> Quitar</button>
            ) : (
              <button onClick={() => onMarcarPendiente(factura, clienteNombre)} className="btn btn-outline btn-sm text-yellow-700 border-yellow-400 hover:bg-yellow-50 whitespace-nowrap"><Clock size={14} className="mr-1" /> Pendiente</button>
            )}
          </div>
        </div>
      </div>

      {/* Productos agrupados por proveedor */}
      <div>
        {[...gruposPorProveedor.entries()].map(([provNombre, productos]) => (
          <div key={provNombre}>
            {/* Header del proveedor */}
            <div className="px-5 py-2 bg-purple-50 border-y border-purple-100 flex items-center gap-2">
              <Package size={13} className="text-purple-500" />
              <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">{provNombre}</span>
              <span className="text-[10px] text-purple-400 font-medium">({productos.length})</span>
            </div>

            {/* Productos del proveedor */}
            <div className="divide-y divide-gray-50">
              {productos.map((producto) => {
                const productoKey = getProductKey(factura, producto)
                const entrega = getEntregaInfo(productoKey, producto, entregasAjustadas)
                const estaCompleto = entrega.estado === 'completo'
                const noLlego = entrega.estado === 'no_llego'
                const tieneAjuste = entrega.tieneAjuste

                return (
                  <div key={productoKey} className={`p-4 transition-all ${estaCompleto ? 'bg-green-50/50' : entrega.estado === 'parcial' ? 'bg-blue-50/30' : noLlego ? 'bg-red-50/30' : 'hover:bg-gray-50/50'
                    }`}>
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                      <div className="lg:w-5/12 min-w-0">
                        <p className={`font-semibold truncate ${estaCompleto ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {estaCompleto && <Check size={14} className="inline text-green-600 mr-1" />}
                          {producto.nombre}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{producto.codigo}</p>
                        {producto.observaciones && <p className={`text-xs text-orange-600 mt-0.5 ${estaCompleto ? 'line-through opacity-60' : ''}`}>📝 {producto.observaciones}</p>}
                      </div>
                      <div className="lg:w-2/12">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${producto.tipo_faltante === 'total' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {producto.cantidad_faltante} {producto.tipo_faltante === 'total' ? 'total' : 'parcial'}
                        </span>
                      </div>
                      <div className="lg:w-2/12">
                        <input type="number" min="0" max={producto.cantidad_faltante} value={entrega.cantidadEntregada} placeholder="0"
                          onChange={(e) => onCantidadEntregadaChange(productoKey, e.target.value, producto)}
                          disabled={estaCompleto} className={`input w-full max-w-[100px] ${estaCompleto ? 'bg-gray-100 text-gray-400' : ''}`} />
                      </div>
                      <div className="lg:w-1/12">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium ${estaCompleto ? 'bg-green-100 text-green-800' : entrega.estado === 'parcial' ? 'bg-blue-100 text-blue-800' : noLlego ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'
                          }`}>
                          {estaCompleto ? '✓ Ok' : entrega.estado === 'parcial' ? '◐' : noLlego ? '✗' : '○'}
                        </span>
                      </div>
                      <div className="lg:w-2/12">
                        <div className="flex gap-1.5">
                          {!estaCompleto && !noLlego && (
                            <>
                              <button onClick={() => onMarcarCompleto(productoKey, producto)} className="btn btn-sm bg-green-600 text-white border-green-600 hover:bg-green-700" title="Completo"><Check size={13} /></button>
                              <button onClick={() => onNoLlegoNada(productoKey, producto)} className="btn btn-sm bg-red-600 text-white border-red-600 hover:bg-red-700" title="No llegó"><X size={13} /></button>
                            </>
                          )}
                          {tieneAjuste && <button onClick={() => onDeshacer(productoKey, producto)} className="btn btn-sm bg-orange-500 text-white border-orange-500 hover:bg-orange-600" title="Deshacer"><Undo2 size={13} /></button>}
                        </div>
                      </div>
                    </div>
                    {entrega.cantidadEntregada > 0 && (
                      <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200 flex items-center justify-between text-sm">
                        <span className="text-blue-800 flex items-center"><Calculator size={14} className="mr-1" /> {entrega.estado === 'completo' ? 'Resuelto — sin cambios' : `Se reducirá en ${entrega.cantidadAReducir} uds`}</span>
                        <span className="text-blue-600 font-medium">{entrega.cantidadEntregada}/{producto.cantidad_faltante}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Observaciones adicionales */}
      {factura.observaciones_adicionales && (
        <div className="p-4 bg-yellow-50 border-t border-yellow-200">
          <p className="text-sm text-yellow-800"><strong>📝 Encargos:</strong> {factura.observaciones_adicionales}</p>
        </div>
      )}
    </div>
  )
}
