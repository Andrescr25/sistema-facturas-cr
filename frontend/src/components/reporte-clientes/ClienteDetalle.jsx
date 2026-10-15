import FacturaEnviadaCard from './FacturaEnviadaCard'
import VisitaCliente from './VisitaCliente'
import { User, Mail, Clock, Check, ArrowLeft, AlertTriangle } from 'lucide-react'
import FacturaActivaCard from './FacturaActivaCard'
import { getFacturaKey, getFacturaEstado, getClienteProgreso, clienteTieneSinCaja, formatDateTime } from '../../utils/reporteClientesUtils'

/**
 * Vista de detalle de un cliente: header con stats, facturas activas
 * (editables) y facturas ya procesadas (colapsadas al fondo).
 * Extraído de ReporteClientes.jsx (antes renderClienteDetalle).
 */
export default function ClienteDetalle({
  cliente,
  historial = false,
  facturasEstado,
  entregasAjustadas,
  onVolver,
  onFacturaLista,
  onRecuperarFactura,
  onCantidadEntregadaChange,
  onMarcarCompleto,
  onNoLlegoNada,
  onDeshacer,
  onMarcarRevisado,
  onMarcarFacturaRevisada,
  onReabrirRevision,
  onQuitarRespuesta
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
        <button onClick={onVolver} className="flex items-center text-neutro-500 hover:text-nota-600 transition-colors">
          <ArrowLeft className="mr-2" size={20} /> Volver a clientes
        </button>
      </div>

      {/* Header del cliente */}
      <div className="bg-white rounded-xl shadow-sm border border-neutro-100 p-6 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className={`p-4 rounded-xl ${esSinCaja ? 'bg-peligro-100' : 'bg-nota-100'}`}>
            <User className={esSinCaja ? 'text-peligro-600' : 'text-nota-600'} size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold text-neutro-900">{cliente.nombre}</h1>
              {esSinCaja && <span className="text-[10px] bg-peligro-500 text-white px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">📦 Sin Caja</span>}
            </div>
            {cliente.email && <p className="text-neutro-500 flex items-center mt-1"><Mail size={14} className="mr-1.5" /> {cliente.email}</p>}
            {historial
              ? <p className="mt-1 text-sm font-semibold text-neutro-600">{cliente.ruta?.nombre || 'Sin ruta asignada'}</p>
              : <VisitaCliente cliente={cliente} />}
            <p className="text-xs text-neutro-400 mt-1"><Clock size={12} className="inline mr-1" /> Última actividad: {formatDateTime(cliente.ultima_actividad)}</p>
          </div>
        </div>
        <div className="flex bg-neutro-50 p-4 rounded-xl divide-x divide-neutro-200">
          <div className="px-5 text-center">
            <p className="text-sm text-neutro-500 font-medium">Facturas</p>
            <p className="text-2xl font-bold text-neutro-900">{cliente.facturas_con_faltantes.length}</p>
          </div>
          <div className="px-5 text-center">
            <p className="text-sm text-neutro-500 font-medium">{historial ? 'Productos' : 'Por revisar'}</p>
            <p className="text-2xl font-bold text-neutro-800">{historial ? cliente.total_productos : progreso.porRevisar}</p>
          </div>
          <div className="px-5 text-center">
            <p className="text-sm text-neutro-500 font-medium">{historial ? 'Unidades' : 'Revisados'}</p>
            <p className="text-2xl font-bold text-neutro-900">{historial ? cliente.total_cantidad : progreso.revisados}</p>
          </div>
        </div>
      </div>

      {/* Aviso sin caja */}
      {esSinCaja && (
        <div className="bg-peligro-50 border border-peligro-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="text-peligro-500 flex-shrink-0" size={20} />
          <p className="text-sm text-peligro-800">Este cliente tiene facturas con <strong>100% de faltantes totales</strong> — no tiene caja ni empaque en bodega.</p>
        </div>
      )}

      {/* Facturas activas */}
      {!historial && facturasActivas.length === 0 && (
        <div className="bg-white border border-neutro-200 rounded-xl p-6 text-center mb-6">
          <Check className="mx-auto text-neutro-400 mb-2" size={32} />
          <p className="text-neutro-800 font-medium">Las facturas están en Impresión o ya fueron procesadas.</p>
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
            onMarcarRevisado={onMarcarRevisado}
            onMarcarFacturaRevisada={onMarcarFacturaRevisada}
            onReabrirRevision={onReabrirRevision}
            onQuitarRespuesta={onQuitarRespuesta}
          />
        ))}
      </div>

      {/* Separador + Facturas Procesadas al fondo */}
      {facturasProcesadas.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-[1px] flex-1 bg-neutro-200"></div>
            <span className="text-xs text-neutro-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
              <Check size={12} /> {facturasProcesadas.length} {historial ? 'en historial' : 'enviadas a Impresión'}
            </span>
            <div className="h-[1px] flex-1 bg-neutro-200"></div>
          </div>
          <div className="space-y-3">
            {facturasProcesadas.map(factura => (
              <FacturaEnviadaCard key={getFacturaKey(factura)} factura={factura}
                estado={getFacturaEstado(factura, facturasEstado)} onRecuperar={onRecuperarFactura} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
