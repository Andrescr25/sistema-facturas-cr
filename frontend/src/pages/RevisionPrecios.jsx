import { useState, useEffect } from 'react'
import { 
  DollarSign, 
  Package, 
  TrendingUp, 
  AlertCircle, 
  Search,
  Filter,
  RefreshCw,
  CheckCircle,
  XCircle
} from 'lucide-react'
import api from '../services/api'

export default function RevisionPrecios() {
  const [activeTab, setActiveTab] = useState('pendientes')
  const [facturas, setFacturas] = useState([])
  const [productosPendientes, setProductosPendientes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('PROCESADA')

  useEffect(() => {
    if (activeTab === 'pendientes') {
      loadProductosPendientes()
    } else {
      loadFacturas()
    }
  }, [activeTab, filtroEstado])

  const loadFacturas = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Llamar al API del backend
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
      setLoading(true)
      setError(null)

      const response = await api.get('/revision-precios/productos-pendientes')
      const result = response.data

      if (result.success) {
        setProductosPendientes(result.productos)
      } else {
        setError(result.error || 'Error cargando productos pendientes')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
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
      } else {
        alert(`❌ Error: ${result.error}`)
      }
    } catch (err) {
      alert(`❌ Error rechazando producto: ${err.message}`)
    }
  }

  const filteredFacturas = facturas.filter(factura =>
    factura.proveedorNombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    factura.numeroConsecutivo?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
          <DollarSign className="mr-3" size={32} />
          Revisión de Precios
        </h1>
        <p className="text-gray-600 mt-1">
          Gestión y análisis de precios de facturas electrónicas
        </p>
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
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'pendientes'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <AlertCircle className="inline mr-2" size={16} />
            Productos Pendientes
            {productosPendientes.length > 0 && (
              <span className="ml-2 bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {productosPendientes.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('facturas')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'facturas'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Package className="inline mr-2" size={16} />
            Facturas Procesadas
          </button>
        </nav>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-8">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando datos...</p>
        </div>
      )}

      {/* Tab Productos Pendientes */}
      {activeTab === 'pendientes' && !loading && (
        <div>
          {productosPendientes.length === 0 ? (
            <div className="card text-center py-12">
              <CheckCircle className="mx-auto text-green-400 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                ¡No hay productos pendientes!
              </h3>
              <p className="text-gray-600">
                Todos los productos han sido relacionados correctamente.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {productosPendientes.map((producto) => (
                <div key={producto.id} className="card">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {producto.descripcion}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Código: {producto.codigoProveedor}
                      </p>
                      <p className="text-sm text-gray-500">
                        Proveedor: {producto.factura.proveedorNombre}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">
                        ₡{producto.precioUnitario?.toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500">
                        Cantidad: {producto.cantidad}
                      </p>
                    </div>
                  </div>

                  {/* Sugerencias */}
                  {producto.sugerencias && producto.sugerencias.length > 0 && (
                    <div className="bg-blue-50 rounded-lg p-4 mb-4">
                      <h4 className="font-medium text-blue-900 mb-3">
                        Sugerencias de productos:
                      </h4>
                      <div className="space-y-2">
                        {producto.sugerencias.map((sugerencia, index) => (
                          <div
                            key={index}
                            className="bg-white rounded-lg p-3 flex items-center justify-between"
                          >
                            <div>
                              <p className="font-medium text-gray-900">
                                {sugerencia.name}
                              </p>
                              <p className="text-sm text-gray-600">
                                Ref: {sugerencia.reference} | Precio: ₡{sugerencia.price?.toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-medium text-blue-600">
                                {sugerencia.similarityScore}% match
                              </span>
                              <button
                                onClick={() => handleConfirmarProducto(producto.id, sugerencia.alegraId)}
                                className="btn btn-primary text-sm py-1 px-3"
                              >
                                Confirmar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Acciones */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleRechazarProducto(producto.id)}
                      className="btn btn-outline flex items-center"
                    >
                      <XCircle size={16} className="mr-2" />
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Facturas */}
      {activeTab === 'facturas' && !loading && (
        <div>
          {/* Filtros y búsqueda */}
          <div className="card mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Búsqueda */}
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder="Buscar por proveedor o número de factura..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Filtro de estado */}
              <div>
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="PROCESADA">Procesadas</option>
                  <option value="RELACIONADA">Relacionadas</option>
                  <option value="ENVIADA">Enviadas</option>
                  <option value="">Todas</option>
                </select>
              </div>
            </div>
          </div>

          {/* Lista de facturas */}
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
            <div className="space-y-4">
              {filteredFacturas.map((factura) => (
                <div key={factura.id} className="card hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {factura.numeroConsecutivo}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Proveedor: {factura.proveedorNombre}
                      </p>
                      <p className="text-sm text-gray-500">
                        Fecha: {new Date(factura.fechaEmision).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        factura.estado === 'RELACIONADA'
                          ? 'bg-green-100 text-green-800'
                          : factura.estado === 'PROCESADA'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {factura.estado}
                      </div>
                      <p className="text-lg font-bold text-gray-900 mt-2">
                        ₡{factura.totalFactura?.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Estadísticas de productos */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-gray-600">Total Productos</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {factura.totalProductos}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Relacionados</p>
                        <p className="text-2xl font-bold text-green-600">
                          {factura.productos?.filter(p => p.estadoRelacionado === 'RELACIONADO').length || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Pendientes</p>
                        <p className="text-2xl font-bold text-yellow-600">
                          {factura.productos?.filter(p => p.estadoRelacionado === 'PENDIENTE').length || 0}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
