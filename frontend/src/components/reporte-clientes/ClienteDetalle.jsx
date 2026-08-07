import { User, Mail, Clock, Check, RotateCcw, ArrowLeft, AlertTriangle } from 'lucide-react'
import FacturaActivaCard from './FacturaActivaCard'
import { getFacturaKey, getFacturaEstado, getClienteProgreso, clienteTieneSinCaja, formatDate, formatDateTime } from '../../utils/reporteClientesUtils'

/**
 * Vista de detalle de un cliente: header con stats, facturas activas
 * (editables) y facturas ya procesadas (colapsadas al fondo).
 * Extraído de ReporteClientes.jsx (antes renderClienteDetalle).
 */
export default function ClienteDetalle({
  cliente,
  facturasEstado,
  entregasAjustadas,
  onVolver,
  onFacturaLista,
  onRecuperarFactura,
  onCantidadEntregadaChange,
  onMarcarCompleto,
  onNoLlegoNada,
  onDeshacer
}) {
  const esSinCaja = clienteTieneSinCaja(cliente, facturasEstado)
  const progreso = getClienteProgreso(cliente, facturasEstado, entregasAjustadas)

  // Separar facturas activas de procesadas
  const facturasActivas = cliente.facturas_con_faltantes.filter(f => {
    const e = getFacturaEstado(f, facturasEstado)
    return e.estado !== 'procesado' && e.estado !== 'en_cola_impresion'
  })
  const facturasProcesadas = cliente.facturas_con_faltantes.filter(f => {
    const e = getFacturaEstado(f, facturasEstado)
    return e.estado === 'procesado' || e.estado === 'en_cola_impresion'
  })

  return (
    <div className="animate-fade-in-up">
      {/* Barra superior */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={onVolver} className="flex items-center text-gray-500 hover:text-purple-600 transition-colors">
          <ArrowLeft className="mr-2" size={20} /> Volver a clientes
        </button>
      </div>

      {/* Header del cliente */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className={`p-4 rounded-xl ${esSinCaja ? 'bg-red-100' : 'bg-purple-100'}`}>
            <User className={esSinCaja ? 'text-red-600' : 'text-purple-600'} size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold text-gray-900">{cliente.nombre}</h1>
              {esSinCaja && <span className="text-[10px] bg-red-500 text-white px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">📦 Sin Caja</span>}
            </div>
            {cliente.email && <p className="text-gray-500 flex items-center mt-1"><Mail size={14} className="mr-1.5" /> {cliente.email}</p>}
            <p className="text-xs text-gray-400 mt-1"><Clock size={12} className="inline mr-1" /> Última actividad: {formatDateTime(cliente.ultima_actividad)}</p>
          </div>
        </div>
        <div className="flex bg-gray-50 p-4 rounded-xl divide-x divide-gray-200">
          <div className="px-5 text-center">
            <p className="text-sm text-gray-500 font-medium">Facturas</p>
            <p className="text-2xl font-bold text-gray-900">{facturasActivas.length}</p>
          </div>
          <div className="px-5 text-center">
            <p className="text-sm text-gray-500 font-medium">Por revisar</p>
            <p className={`text-2xl font-bold ${progreso.porRevisar === 0 ? 'text-green-600' : 'text-amber-600'}`}>{progreso.porRevisar}</p>
          </div>
          <div className="px-5 text-center">
            <p className="text-sm text-gray-500 font-medium">Revisados</p>
            <p className="text-2xl font-bold text-gray-900">{progreso.revisados}</p>
          </div>
        </div>
      </div>

      {/* Aviso sin caja */}
      {esSinCaja && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="text-red-500 flex-shrink-0" size={20} />
          <p className="text-sm text-red-800">Este cliente tiene facturas con <strong>100% de faltantes totales</strong> — no tiene caja ni empaque en bodega.</p>
        </div>
      )}

      {/* Facturas activas */}
      {facturasActivas.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center mb-6">
          <Check className="mx-auto text-green-400 mb-2" size={32} />
          <p className="text-green-800 font-medium">Todas las facturas de este cliente han sido procesadas.</p>
        </div>
      )}

      <div className="space-y-4">
        {facturasActivas.map((factura) => (
          <FacturaActivaCard
            key={getFacturaKey(factura)}
            factura={factura}
            clienteNombre={cliente.nombre}
            entregasAjustadas={entregasAjustadas}
            onFacturaLista={onFacturaLista}
            onCantidadEntregadaChange={onCantidadEntregadaChange}
            onMarcarCompleto={onMarcarCompleto}
            onNoLlegoNada={onNoLlegoNada}
            onDeshacer={onDeshacer}
          />
        ))}
      </div>

      {/* Separador + Facturas Procesadas al fondo */}
      {facturasProcesadas.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-[1px] flex-1 bg-gray-200"></div>
            <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
              <Check size={12} /> {facturasProcesadas.length} procesada{facturasProcesadas.length > 1 ? 's' : ''}
            </span>
            <div className="h-[1px] flex-1 bg-gray-200"></div>
          </div>
          <div className="space-y-3">
            {facturasProcesadas.map((factura) => {
              const estadoFactura = getFacturaEstado(factura, facturasEstado)
              const productosValidos = factura.productos_faltantes.filter(p => Number(p.cantidad_faltante) > 0)
              return (
                <div key={getFacturaKey(factura)} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden opacity-60 hover:opacity-80 transition-opacity">
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <h5 className="font-medium text-gray-400 line-through">
                        <Check size={14} className="inline text-green-500 mr-1" />
                        Factura #{factura.numero_factura}
                        <span className="ml-2 px-2 py-0.5 text-[10px] bg-green-100 text-green-700 rounded-full no-underline inline-block">✓ Procesada</span>
                      </h5>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(factura.fecha_emision)} • {productosValidos.length} producto{productosValidos.length !== 1 ? 's' : ''}</p>
                      {estadoFactura.timestamp && <p className="text-[10px] text-green-600 mt-0.5">{estadoFactura.requiere_reimpresion ? '🖨️ En impresión' : '📚 Historial'} — {formatDateTime(estadoFactura.timestamp)}</p>}
                    </div>
                    <button onClick={() => onRecuperarFactura(factura)} className="btn btn-sm bg-orange-500 text-white border-orange-500 hover:bg-orange-600 whitespace-nowrap">
                      <RotateCcw size={13} className="mr-1" /> Recuperar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
