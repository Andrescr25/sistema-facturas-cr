import { useState, useEffect } from 'react'
import { Printer, Clock, CheckCircle, AlertCircle, Calendar, User, FileText, Package } from 'lucide-react'
import { alegraService } from '../services/alegraService'

export default function Reimpresion() {
    const [activeTab, setActiveTab] = useState('pendientes')
    const [facturasPendientes, setFacturasPendientes] = useState([])
    const [historialProcesos, setHistorialProcesos] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [resumen, setResumen] = useState(null)
    const [expandedItems, setExpandedItems] = useState(new Set()) // NUEVO: Estado para expansión

    useEffect(() => {
        if (activeTab === 'pendientes') {
            loadFacturasPendientes()
        } else {
            loadHistorialProcesos()
        }
    }, [activeTab])

    const loadFacturasPendientes = async () => {
        try {
            setLoading(true)
            setError(null)

            const result = await alegraService.getFacturasPendientesReimpresion()


            if (result.success) {
                setFacturasPendientes(result.data)
                setResumen(result.resumen)
            } else {
                setError(result.message || 'Error cargando facturas pendientes')
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const loadHistorialProcesos = async () => {
        try {
            setLoading(true)
            setError(null)

            const result = await alegraService.getHistorialProcesos()

            if (result.success) {
                setHistorialProcesos(result.data)
            } else {
                setError(result.message || 'Error cargando historial')
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const handleActualizarTodasEnAlegra = async () => {
        if (facturasPendientes.length === 0) {
            alert('ℹ️ No hay facturas pendientes para actualizar.')
            return
        }

        const facturasConCambios = facturasPendientes.filter(f => f.requiere_actualizacion)

        const resumen = `🖨️ Actualizar facturas en Alegra:

- Total facturas: ${facturasPendientes.length}
- Con cambios requeridos: ${facturasConCambios.length}
- Solo resueltas: ${facturasPendientes.length - facturasConCambios.length}

⚠️ Esta acción actualizará las facturas directamente en Alegra.
¿Continuar con el procesamiento?`

        if (!window.confirm(resumen)) {
            return
        }

        try {
            setLoading(true)

            const resultado = await alegraService.actualizarFacturasMasivo(facturasPendientes)

            // Recargar facturas pendientes
            loadFacturasPendientes()

            alert(`✅ Procesamiento completado:\n\n• ${resultado.facturas_actualizadas} facturas actualizadas\n• ${resultado.facturas_marcadas} facturas marcadas como procesadas`)

        } catch (error) {
            alert(`❌ Error en actualización masiva: ${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    // NUEVO: Función para limpiar historial
    const handleLimpiarHistorial = async () => {
        const resumen = `🗑️ Limpiar Historial de Procesamientos:

- Total registros: ${historialProcesos.length}
- Esta acción es irreversible
- Se eliminarán todos los procesamientos del historial

⚠️ ¿Estás seguro de continuar?`

        if (!window.confirm(resumen)) {
            return
        }

        try {
            setLoading(true)

            const result = await alegraService.limpiarHistorial()

            if (result.success) {
                setHistorialProcesos([])
                alert(`✅ Historial limpiado correctamente\n\n• ${result.registros_eliminados} procesamientos eliminados`)
            } else {
                alert(`❌ Error limpiando historial: ${result.message}`)
            }

        } catch (error) {
            alert(`❌ Error limpiando historial: ${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    // NUEVO: Toggle expansión
    const toggleExpanded = (id) => {
        const newExpanded = new Set(expandedItems)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedItems(newExpanded)
    }

    // NUEVO: Componente HistorialItem
    const HistorialItem = ({ proceso, formatDate }) => {
        const isExpanded = expandedItems.has(proceso.id)
        const detalles = proceso.detalles_procesados || {}

        // Extraer información de las facturas procesadas
        const facturasInfo = []

        // Si es procesamiento individual
        if (detalles.factura_procesada) {
            facturasInfo.push(detalles.factura_procesada)
        }

        // Si es procesamiento masivo
        if (detalles.facturas_procesadas) {
            facturasInfo.push(...detalles.facturas_procesadas)
        }

        return (
            <div>
                {/* Header del procesamiento */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <div className="p-2 bg-blue-100 rounded-lg mr-4">
                            <Calendar className="text-blue-600" size={20} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900">
                                Procesamiento #{proceso.id}
                            </h3>
                            <p className="text-sm text-gray-600">
                                {formatDate(proceso.fecha_procesamiento)}
                            </p>
                            <p className="text-xs text-gray-500">
                                Por: {proceso.procesado_por}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                        {/* Estadísticas */}
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <p className="text-sm text-gray-600">Total</p>
                                <p className="text-lg font-semibold text-gray-900">
                                    {proceso.total_facturas}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">Historial</p>
                                <p className="text-lg font-semibold text-blue-600">
                                    {proceso.facturas_para_historial}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">Reimpresión</p>
                                <p className="text-lg font-semibold text-yellow-600">
                                    {proceso.facturas_para_reimpresion}
                                </p>
                            </div>
                        </div>

                        {/* Botón expandir */}
                        <button
                            onClick={() => toggleExpanded(proceso.id)}
                            className="btn btn-outline flex items-center"
                        >
                            {isExpanded ? 'Ocultar' : 'Ver'} Detalles
                            <span className={`ml-2 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                ▼
                            </span>
                        </button>
                    </div>
                </div>

                {/* NUEVO: Detalles expandibles */}
                {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                        {facturasInfo.length > 0 ? (
                            <div className="space-y-4">
                                <h4 className="font-medium text-gray-900 flex items-center">
                                    <FileText size={16} className="mr-2" />
                                    Facturas Procesadas:
                                </h4>

                                {facturasInfo.map((facturaInfo, index) => (
                                    <div key={index} className="bg-gray-50 rounded-lg p-4">
                                        {/* Header de la factura */}
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <h5 className="font-medium text-gray-900">
                                                    📄 Factura #{facturaInfo.numero_factura}
                                                </h5>
                                                <p className="text-sm text-gray-600">
                                                    Cliente: {facturaInfo.cliente_nombre}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    Fecha emisión: {formatDate(facturaInfo.fecha_emision)}
                                                </p>
                                            </div>
                                            <div className={`px-3 py-1 rounded-full text-sm font-medium ${facturaInfo.estado === 'requiere_reimpresion'
                                                ? 'bg-yellow-100 text-yellow-800'
                                                : facturaInfo.estado === 'resuelto_sin_cambios'
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                {facturaInfo.estado === 'requiere_reimpresion' && '🖨️ Reimpresión'}
                                                {facturaInfo.estado === 'resuelto_sin_cambios' && '✅ Sin cambios'}
                                                {facturaInfo.estado === 'sin_cambios' && 'ℹ️ Sin ajustes'}
                                            </div>
                                        </div>

                                        {/* Ajustes realizados */}
                                        {facturaInfo.ajustes && facturaInfo.ajustes.length > 0 && (
                                            <div>
                                                <h6 className="font-medium text-gray-800 mb-2 flex items-center">
                                                    <Package size={14} className="mr-1" />
                                                    Ajustes realizados ({facturaInfo.ajustes.length}):
                                                </h6>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {facturaInfo.ajustes.map((ajuste, ajusteIndex) => (
                                                        <div key={ajusteIndex} className="bg-white rounded-lg p-3 border">
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <p className="font-medium text-gray-900 text-sm">
                                                                        {ajuste.producto_nombre}
                                                                    </p>
                                                                    <p className="text-xs text-gray-500">
                                                                        {ajuste.producto_codigo}
                                                                    </p>
                                                                </div>
                                                                <div className={`px-2 py-1 rounded-full text-xs font-medium ${ajuste.estado === 'completo'
                                                                    ? 'bg-green-100 text-green-800'
                                                                    : ajuste.estado === 'parcial'
                                                                        ? 'bg-yellow-100 text-yellow-800'
                                                                        : ajuste.estado === 'no_llego'
                                                                            ? 'bg-red-100 text-red-800'
                                                                            : 'bg-gray-100 text-gray-800'
                                                                    }`}>
                                                                    {ajuste.estado === 'completo' && '✅ Completo'}
                                                                    {ajuste.estado === 'parcial' && '◐ Parcial'}
                                                                    {ajuste.estado === 'no_llego' && '❌ No llegó'}
                                                                </div>
                                                            </div>
                                                            <div className="mt-2 text-xs text-gray-600">
                                                                <div className="flex justify-between">
                                                                    <span>Faltante:</span>
                                                                    <span className="font-medium">{ajuste.cantidad_faltante}</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span>Entregado:</span>
                                                                    <span className="font-medium">{ajuste.cantidad_entregada}</span>
                                                                </div>
                                                                {ajuste.requiere_actualizacion && (
                                                                    <p className="text-yellow-600 font-medium mt-1">
                                                                        ⚠️ Requirió actualización
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Si no hay ajustes */}
                                        {(!facturaInfo.ajustes || facturaInfo.ajustes.length === 0) && (
                                            <div className="text-center py-4 text-gray-500">
                                                <p className="text-sm">Sin ajustes realizados</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                <FileText size={32} className="mx-auto mb-2 opacity-50" />
                                <p>No hay detalles disponibles para este procesamiento</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                        <Printer className="mr-3" size={32} />
                        Sistema de Reimpresión
                    </h1>
                    <p className="text-gray-600 mt-1">
                        Gestión de facturas pendientes de actualizar en Alegra y historial de procesamientos
                    </p>
                </div>

                {/* Resumen rápido */}
                {resumen && activeTab === 'pendientes' && (
                    <div className="bg-blue-50 rounded-lg p-4">
                        <div className="text-sm text-blue-600 font-medium">Facturas Pendientes</div>
                        <div className="text-2xl font-bold text-blue-900">{resumen.facturas_pendientes}</div>
                        <div className="text-xs text-blue-600">
                            {resumen.facturas_con_cambios} requieren actualización
                        </div>
                    </div>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="card bg-red-50 border-red-200 mb-8">
                    <div className="flex items-center">
                        <AlertCircle className="text-red-500 mr-2" size={20} />
                        <p className="text-red-700">Error: {error}</p>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-gray-200 mb-8">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('pendientes')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'pendientes'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        <Clock className="inline mr-2" size={16} />
                        Facturas Pendientes
                        {resumen && (
                            <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                {resumen.facturas_pendientes}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('historial')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'historial'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        <FileText className="inline mr-2" size={16} />
                        Historial de Procesamientos
                    </button>
                </nav>
            </div>

            {/* Loading */}
            {loading && (
                <div className="text-center py-8">
                    <div className="spinner mx-auto mb-4"></div>
                    <p className="text-gray-600">
                        {activeTab === 'pendientes' ? 'Cargando facturas pendientes...' : 'Cargando historial...'}
                    </p>
                </div>
            )}

            {/* Tab Pendientes */}
            {activeTab === 'pendientes' && !loading && (
                <div>
                    {facturasPendientes.length === 0 ? (
                        <div className="card text-center py-12">
                            <CheckCircle className="mx-auto text-green-400 mb-4" size={48} />
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                ¡No hay facturas pendientes!
                            </h3>
                            <p className="text-gray-600">
                                Todas las facturas han sido procesadas correctamente.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Botón Procesar Todas */}
                            <div className="card bg-blue-50 border-blue-200">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold text-blue-900">
                                            Procesamiento Masivo
                                        </h3>
                                        <p className="text-blue-700">
                                            {facturasPendientes.length} facturas listas para actualizar en Alegra
                                        </p>
                                    </div>
                                    <button className="btn btn-primary" onClick={handleActualizarTodasEnAlegra}>
                                        <Printer size={16} className="mr-2" />
                                        Actualizar Todas en Alegra
                                    </button>
                                </div>
                            </div>

                            {/* Lista de Facturas */}
                            {facturasPendientes.map((factura) => (
                                <div key={factura.reimpresion_id} className="card">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900">
                                                Factura #{factura.numero_factura}
                                            </h3>
                                            <p className="text-gray-600">
                                                Cliente: {factura.cliente_nombre}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                Fecha emisión: {formatDate(factura.fecha_emision)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${factura.requiere_actualizacion
                                                ? 'bg-yellow-100 text-yellow-800'
                                                : 'bg-green-100 text-green-800'
                                                }`}>
                                                {factura.requiere_actualizacion ? 'Requiere Cambios' : 'Solo Resuelto'}
                                            </div>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {factura.total_ajustes} ajuste{factura.total_ajustes !== 1 ? 's' : ''}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Detalles de ajustes */}
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                                            <Package size={16} className="mr-2" />
                                            Ajustes realizados:
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {factura.ajustes_realizados?.map((ajuste, index) => (
                                                <div key={`${factura.reimpresion_id}-ajuste-${index}`} className="bg-white rounded-lg p-3 border">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <p className="font-medium text-gray-900">
                                                                {ajuste.producto_nombre}
                                                            </p>
                                                            <p className="text-sm text-gray-600">
                                                                Código: {ajuste.producto_codigo}
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${ajuste.estado === 'completo'
                                                                ? 'bg-green-100 text-green-800'
                                                                : ajuste.estado === 'parcial'
                                                                    ? 'bg-yellow-100 text-yellow-800'
                                                                    : 'bg-red-100 text-red-800'
                                                                }`}>
                                                                {ajuste.estado === 'completo' ? 'Llegó Todo' :
                                                                    ajuste.estado === 'parcial' ? 'Llegó Parcial' : 'No Llegó'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 text-sm text-gray-600">
                                                        <p>Faltante original: {ajuste.cantidad_faltante}</p>
                                                        <p>Cantidad entregada: {ajuste.cantidad_entregada}</p>
                                                        {ajuste.requiere_actualizacion && (
                                                            <p className="text-yellow-600 font-medium">
                                                                ⚠️ Requiere actualización en Alegra
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Tab Historial - VERSIÓN MEJORADA */}
            {activeTab === 'historial' && !loading && (
                <div>
                    {historialProcesos.length === 0 ? (
                        <div className="card text-center py-12">
                            <FileText className="mx-auto text-gray-400 mb-4" size={48} />
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                No hay historial disponible
                            </h3>
                            <p className="text-gray-600">
                                Los procesamientos aparecerán aquí una vez que se realicen limpiezas.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* NUEVO: Header con botón limpiar */}
                            <div className="card bg-red-50 border-red-200">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold text-red-900">
                                            Gestión del Historial
                                        </h3>
                                        <p className="text-red-700">
                                            {historialProcesos.length} procesamientos registrados
                                        </p>
                                    </div>
                                    <button
                                        className="btn bg-red-600 text-white border-red-600 hover:bg-red-700"
                                        onClick={handleLimpiarHistorial}
                                    >
                                        <AlertCircle size={16} className="mr-2" />
                                        Limpiar Historial
                                    </button>
                                </div>
                            </div>

                            {/* NUEVO: Lista expandible de procesamientos */}
                            {historialProcesos.map((proceso) => (
                                <div key={proceso.id} className="card">
                                    <HistorialItem proceso={proceso} formatDate={formatDate} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}