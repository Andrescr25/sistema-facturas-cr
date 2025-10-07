import { useState, useEffect } from 'react'
import { 
  DollarSign, 
  Package, 
  ChevronDown,
  ChevronUp,
  AlertCircle, 
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Eye,
  Building2,
  Calendar,
  FileText,
  ShoppingCart
} from 'lucide-react'
import api from '../services/api'

export default function RevisionPrecios() {
  const [facturas, setFacturas] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('PROCESADA')
  const [facturaExpandida, setFacturaExpandida] = useState(null)
  const [productosPendientes, setProductosPendientes] = useState([])

  useEffect(() => {
    loadFacturas()
    loadProductosPendientes()
  }, [filtroEstado])

  const loadFacturas = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await api.get(`/revision-precios/facturas?estado=${filtroEstado}`)
      const result = response.data

      if (result.success) {
        setFacturas(result.facturas)
      } else {
        setError(result.error || 'Error cargando facturas')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadProductosPendientes = async () => {
    try {
      const response = await api.get('/revision-precios/productos-pendientes')
      const result = response.data

      if (result.success) {
        setProductosPendientes(result.productos)
      }
    } catch (err) {
      console.error('Error cargando productos pendientes:', err)
    }
  }

  const handleConfirmarProducto = async (productoId, alegraItemId) => {
    try {
      const response = await api.post('/revision-precios/confirmar-producto', {
        productoId, 
        alegraItemId, 
        confianza: 100
      })

      const result = response.data

      if (result.success) {
        alert('✅ Producto confirmado exitosamente')
        loadProductosPendientes()
        loadFacturas()
      } else {
        alert(`❌ Error: ${result.error}`)
      }
    } catch (err) {
      alert(`❌ Error confirmando producto: ${err.message}`)
    }
  }

  const handleRechazarProducto = async (productoId) => {
    try {
      const response = await api.post('/revision-precios/rechazar-producto', {
        productoId
      })

      const result = response.data

      if (result.success) {
        alert('✅ Producto rechazado exitosamente')
        loadProductosPendientes()
        loadFacturas()
      } else {
        alert(`❌ Error: ${result.error}`)
      }
    } catch (err) {
      alert(`❌ Error rechazando producto: ${err.message}`)
    }
  }

  const toggleFactura = (facturaId) => {
    setFacturaExpandida(facturaExpandida === facturaId ? null : facturaId)
  }

  const filteredFacturas = facturas.filter(factura =>
    factura.proveedorNombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    factura.numeroConsecutivo?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getEstadoColor = (estado) => {
    switch(estado) {
      case 'RELACIONADA': return 'bg-green-100 text-green-800 border-green-200'
      case 'PROCESADA': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'PENDIENTE': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'ENVIADA': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getEstadoProducto = (estado) => {
    switch(estado) {
      case 'RELACIONADO': return { color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', text: 'Relacionado' }
      case 'PENDIENTE': return { color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'Pendiente' }
      case 'RECHAZADO': return { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', text: 'Rechazado' }
      default: return { color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200', text: estado }
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              <DollarSign className="mr-3 text-blue-600" size={32} />
              Revisión de Precios
            </h1>
            <p className="text-gray-600 mt-1">
              Gestión de facturas y relación de productos con Alegra
            </p>
          </div>
          <button
            onClick={() => { loadFacturas(); loadProductosPendientes(); }}
            disabled={loading}
            className="btn btn-outline flex items-center"
          >
            <RefreshCw className={`mr-2 ${loading ? 'animate-spin' : ''}`} size={18} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Alerta de productos pendientes */}
      {productosPendientes.length > 0 && (
        <div className="card bg-yellow-50 border-yellow-200 mb-6">
          <div className="flex items-start">
            <AlertCircle className="text-yellow-600 mr-3 flex-shrink-0" size={24} />
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900 mb-1">
                Productos pendientes de relacionar
              </h3>
              <p className="text-yellow-800 text-sm">
                Hay <strong>{productosPendientes.length} productos</strong> esperando ser relacionados con el sistema Alegra.
                Revisa las sugerencias en cada factura.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card bg-red-50 border-red-200 mb-6">
          <div className="flex items-center">
            <AlertCircle className="text-red-500 mr-2" size={20} />
            <p className="text-red-700">Error: {error}</p>
          </div>
        </div>
      )}

      {/* Filtros y búsqueda */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Búsqueda */}
          <div>
            <label className="label">Buscar factura</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Proveedor o número de factura..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Filtro de estado */}
          <div>
            <label className="label">Estado de factura</label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="input"
            >
              <option value="PROCESADA">Procesadas</option>
              <option value="RELACIONADA">Relacionadas</option>
              <option value="ENVIADA">Enviadas</option>
              <option value="">Todas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando facturas...</p>
        </div>
      )}

      {/* Lista de facturas */}
      {!loading && (
        <div className="space-y-4">
          {filteredFacturas.length === 0 ? (
            <div className="card text-center py-12">
              <Package className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No se encontraron facturas
              </h3>
              <p className="text-gray-600">
                {searchTerm
                  ? 'Intenta con otros términos de búsqueda'
                  : 'No hay facturas con el estado seleccionado'}
              </p>
            </div>
          ) : (
            filteredFacturas.map((factura) => {
              const isExpanded = facturaExpandida === factura.id
              const productosPendientesFactura = factura.productos?.filter(p => p.estadoRelacionado === 'PENDIENTE') || []
              const productosRelacionados = factura.productos?.filter(p => p.estadoRelacionado === 'RELACIONADO') || []
              
              return (
                <div 
                  key={factura.id} 
                  className="card hover:shadow-lg transition-all duration-200 border-l-4"
                  style={{ 
                    borderLeftColor: productosPendientesFactura.length > 0 ? '#f59e0b' : '#10b981' 
                  }}
                >
                  {/* Header de la factura */}
                  <div 
                    className="cursor-pointer"
                    onClick={() => toggleFactura(factura.id)}
                  >
                    <div className="flex items-start justify-between mb-4">
                      {/* Información principal */}
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <FileText className="text-blue-600" size={24} />
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">
                              {factura.numeroConsecutivo}
                            </h3>
                            <div className="flex items-center space-x-2 mt-1">
                              <Building2 className="text-gray-400" size={14} />
                              <p className="text-sm text-gray-600 font-medium">
                                {factura.proveedorNombre}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-4 text-sm text-gray-500 ml-9">
                          <div className="flex items-center">
                            <Calendar className="mr-1" size={14} />
                            {new Date(factura.fechaEmision).toLocaleDateString('es-CR', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </div>
                          <div className="flex items-center">
                            <ShoppingCart className="mr-1" size={14} />
                            {factura.totalProductos} productos
                          </div>
                        </div>
                      </div>

                      {/* Stats y botón expandir */}
                      <div className="flex items-start space-x-4">
                        {/* Total */}
                        <div className="text-right">
                          <p className="text-sm text-gray-500 mb-1">Total Factura</p>
                          <p className="text-2xl font-bold text-gray-900">
                            ₡{factura.totalFactura?.toLocaleString('es-CR')}
                          </p>
                        </div>

                        {/* Estado y botón */}
                        <div className="flex flex-col items-end space-y-2">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getEstadoColor(factura.estado)}`}>
                            {factura.estado}
                          </span>
                          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            {isExpanded ? (
                              <ChevronUp className="text-gray-600" size={20} />
                            ) : (
                              <ChevronDown className="text-gray-600" size={20} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Mini stats */}
                    <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-lg p-3">
                      <div className="text-center">
                        <p className="text-xs text-gray-600 mb-1">Total</p>
                        <p className="text-lg font-bold text-gray-900">
                          {factura.totalProductos}
                        </p>
                      </div>
                      <div className="text-center border-l border-r border-gray-200">
                        <p className="text-xs text-green-600 mb-1">Relacionados</p>
                        <p className="text-lg font-bold text-green-600">
                          {productosRelacionados.length}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-yellow-600 mb-1">Pendientes</p>
                        <p className="text-lg font-bold text-yellow-600">
                          {productosPendientesFactura.length}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Detalles expandidos */}
                  {isExpanded && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                        <Package className="mr-2 text-blue-600" size={20} />
                        Productos de la factura ({factura.productos?.length || 0})
                      </h4>

                      {/* Lista de productos */}
                      <div className="space-y-3">
                        {factura.productos?.map((producto, index) => {
                          const estadoInfo = getEstadoProducto(producto.estadoRelacionado)
                          const productoConSugerencia = productosPendientes.find(p => p.id === producto.id)
                          
                          return (
                            <div 
                              key={producto.id || index}
                              className={`border rounded-lg p-4 ${estadoInfo.bg} ${estadoInfo.border}`}
                            >
                              {/* Header del producto */}
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-1">
                                    <h5 className="font-semibold text-gray-900">
                                      {producto.descripcion}
                                    </h5>
                                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${estadoInfo.color} bg-white border`}>
                                      {estadoInfo.text}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-600">
                                    Código: <span className="font-mono bg-white px-2 py-0.5 rounded">{producto.codigoProveedor}</span>
                                  </p>
                                  {producto.mapeo && (
                                    <p className="text-xs text-green-700 mt-1 bg-green-100 inline-block px-2 py-1 rounded">
                                      ✓ Relacionado con: {producto.mapeo.alegraProductName}
                                    </p>
                                  )}
                                </div>

                                {/* Precio y cantidad */}
                                <div className="text-right bg-white rounded-lg px-4 py-2 border border-gray-200">
                                  <p className="text-lg font-bold text-gray-900">
                                    ₡{producto.precioUnitario?.toLocaleString('es-CR')}
                                  </p>
                                  <p className="text-sm text-gray-600">
                                    x {producto.cantidad} uds
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1 pt-1 border-t">
                                    Total: ₡{(producto.precioUnitario * producto.cantidad).toLocaleString('es-CR')}
                                  </p>
                                </div>
                              </div>

                              {/* Sugerencias para productos pendientes */}
                              {productoConSugerencia?.sugerencias && productoConSugerencia.sugerencias.length > 0 && (
                                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                                  <h6 className="font-medium text-blue-900 mb-3 flex items-center">
                                    <Eye className="mr-2" size={16} />
                                    Sugerencias de relación con Alegra:
                                  </h6>
                                  <div className="space-y-2">
                                    {productoConSugerencia.sugerencias.map((sugerencia, idx) => (
                                      <div
                                        key={idx}
                                        className="bg-white rounded-lg p-3 flex items-center justify-between border border-blue-100 hover:border-blue-300 transition-colors"
                                      >
                                        <div className="flex-1">
                                          <p className="font-medium text-gray-900">
                                            {sugerencia.name}
                                          </p>
                                          <div className="flex items-center space-x-3 mt-1 text-sm text-gray-600">
                                            <span>Ref: <span className="font-mono">{sugerencia.reference}</span></span>
                                            <span>•</span>
                                            <span>₡{sugerencia.price?.toLocaleString('es-CR')}</span>
                                          </div>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                          <div className="text-center px-3">
                                            <p className="text-xs text-gray-600">Similitud</p>
                                            <p className="text-lg font-bold text-blue-600">
                                              {sugerencia.similarityScore}%
                                            </p>
                                          </div>
                                          <button
                                            onClick={() => handleConfirmarProducto(producto.id, sugerencia.alegraId)}
                                            className="btn btn-primary text-sm py-2 px-4 flex items-center"
                                          >
                                            <CheckCircle size={16} className="mr-1" />
                                            Confirmar
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  
                                  {/* Botón rechazar */}
                                  <div className="mt-3 pt-3 border-t border-blue-200">
                                    <button
                                      onClick={() => handleRechazarProducto(producto.id)}
                                      className="btn btn-outline text-sm flex items-center text-red-600 hover:bg-red-50 hover:border-red-300"
                                    >
                                      <XCircle size={16} className="mr-1" />
                                      Rechazar todas las sugerencias
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
