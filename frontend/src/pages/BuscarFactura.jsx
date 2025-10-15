import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, FileText, User, Calendar, DollarSign } from 'lucide-react'
import { alegraService } from '../services/alegraService'

export default function BuscarFactura() {
  const [searchType, setSearchType] = useState('numero')
  const [searchTerm, setSearchTerm] = useState('')
  const [facturas, setFacturas] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = async (e) => {
    e.preventDefault()

    if (!searchTerm.trim()) {
      setError('Por favor ingresa un término de búsqueda')
      return
    }

    setLoading(true)
    setError(null)
    setHasSearched(true) // ← AGREGAR ESTA LÍNEA

    try {
      let response
      if (searchType === 'numero') {
        response = await alegraService.buscarFacturasPorNumero(searchTerm)
      } else {
        response = await alegraService.buscarFacturasPorCliente(searchTerm)
      }

      if (response.success) {
        setFacturas(response.data)
      } else {
        setError(response.message || 'Error en la búsqueda')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: 'CRC'
    }).format(amount)
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-CR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Buscar Facturas</h1>
        <p className="text-gray-600 mt-1">Busca facturas por número o nombre del cliente</p>
      </div>

      {/* Formulario de búsqueda */}
      <div className="card mb-8">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="label">Tipo de búsqueda</label>
              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
                className="input"
              >
                <option value="numero">Por número de factura</option>
                <option value="cliente">Por nombre del cliente</option>
              </select>
            </div>
            <div className="flex-2">
              <label className="label">
                {searchType === 'numero' ? 'Número de factura' : 'Nombre del cliente'}
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input"
                placeholder={searchType === 'numero' ? 'Ej: 0000' : 'Ej: xxxxx'}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? (
              <>
                <div className="spinner mr-2"></div>
                Buscando...
              </>
            ) : (
              <>
                <Search className="mr-2" size={16} />
                Buscar
              </>
            )}
          </button>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="card bg-red-50 border-red-200 mb-8">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Resultados */}
      {facturas.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Resultados de la búsqueda ({facturas.length} facturas de proveedores)
          </h3>

          <div className="space-y-4">
            {facturas.map((factura) => (
              <div key={factura.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center mb-2">
                      <FileText className="text-blue-600 mr-2" size={20} />
                      <h4 className="font-semibold text-gray-900">
                        Factura #{factura.numeroConsecutivo}
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center">
                        <User className="text-gray-400 mr-2" size={16} />
                        <span className="text-gray-600">Proveedor:</span>
                        <span className="ml-1 font-medium">{factura.proveedorNombre || factura.proveedor?.nombre}</span>
                      </div>

                      <div className="flex items-center">
                        <Calendar className="text-gray-400 mr-2" size={16} />
                        <span className="text-gray-600">Fecha:</span>
                        <span className="ml-1">{formatDate(factura.fechaEmision)}</span>
                      </div>

                      <div className="flex items-center">
                        <DollarSign className="text-gray-400 mr-2" size={16} />
                        <span className="text-gray-600">Total:</span>
                        <span className="ml-1 font-medium">{formatCurrency(factura.totalFactura)}</span>
                      </div>

                      <div className="flex items-center">
                        <span className="text-gray-600">Estado:</span>
                        <span className={`ml-1 px-2 py-1 rounded-full text-xs ${
                          factura.estado === 'ENVIADA' ? 'bg-green-100 text-green-800' :
                          factura.estado === 'PROCESADA' ? 'bg-blue-100 text-blue-800' :
                          factura.estado === 'PENDIENTE' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                          }`}>
                          {factura.estado}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-gray-600">
                      <span className="ml-0">{factura.productos?.length || factura.totalProductos || 0} productos</span>
                      {factura.estadoRelacionado && (
                        <span className="ml-4">Relacionado: {factura.porcentajeRelacionado}%</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 sm:mt-0 sm:ml-4 flex flex-col sm:flex-row gap-2">
                    <Link
                      to={`/revision/${factura.id}`}
                      className="btn btn-primary btn-sm"
                    >
                      Ver Productos
                    </Link>
                    {factura.estadoRelacionado === 'COMPLETO' && factura.estado !== 'ENVIADA' && (
                      <Link
                        to={`/revision/precios/${factura.id}`}
                        className="btn btn-outline btn-sm"
                      >
                        Revisar Precios
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sin resultados */}
      {!loading && facturas.length === 0 && searchTerm && hasSearched && (
        <div className="card text-center py-8">
          <p className="text-gray-600">No se encontraron facturas con el término "{searchTerm}"</p>
        </div>
      )}
    </div>
  )
}