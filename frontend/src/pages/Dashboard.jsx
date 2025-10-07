import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  Search, 
  FileText, 
  Users, 
  Package,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react'
import { alegraService } from '../services/alegraService'

export default function Dashboard() {
  const [stats, setStats] = useState({
    productos_alegra: "1400+",
    productos_locales: 0,
    proveedores_locales: 0,
    sincronizacion_pendiente: true
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      setLoading(true)
      const response = await alegraService.getEstadisticasSincronizacion()
      if (response.success) {
        setStats(response.data)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const currentDate = new Date()
  const currentWeek = Math.ceil(currentDate.getDate() / 7)
  const currentMonth = currentDate.getMonth() + 1
  const currentYear = currentDate.getFullYear()

  const quickActions = [
    {
      name: 'Buscar Factura',
      description: 'Buscar facturas por número o cliente',
      href: '/buscar-factura',
      icon: Search,
      color: 'bg-blue-500'
    },
    {
      name: 'Registrar Faltantes',
      description: 'Registrar productos faltantes',
      href: '/registrar-faltantes',
      icon: FileText,
      color: 'bg-green-500'
    },
    {
      name: 'Reporte Proveedores',
      description: 'Ver faltantes por proveedor',
      href: '/reportes/proveedores',
      icon: Users,
      color: 'bg-purple-500'
    },
    {
      name: 'Reporte Clientes',
      description: 'Ver faltantes por cliente',
      href: '/reportes/clientes',
      icon: TrendingUp,
      color: 'bg-orange-500'
    }
  ]

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Sistema de Gestión de Faltantes - Distribuidora Tachi</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Package className="text-blue-600" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">Productos Alegra</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.productos_alegra}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <Package className="text-green-600" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">Productos Locales</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.productos_locales}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="text-purple-600" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">Proveedores</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.proveedores_locales}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className={`p-2 rounded-lg ${stats.sincronizacion_pendiente ? 'bg-yellow-100' : 'bg-green-100'}`}>
              {stats.sincronizacion_pendiente ? (
                <Clock className="text-yellow-600" size={24} />
              ) : (
                <CheckCircle className="text-green-600" size={24} />
              )}
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">Sincronización</p>
              <p className="text-sm font-medium text-gray-900">
                {stats.sincronizacion_pendiente ? 'Pendiente' : 'Completa'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Current Period Info */}
      <div className="card mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Período Actual</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Semana</p>
            <p className="text-2xl font-bold text-blue-600">{currentWeek}</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Mes</p>
            <p className="text-2xl font-bold text-blue-600">{currentMonth}</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Año</p>
            <p className="text-2xl font-bold text-blue-600">{currentYear}</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Acciones Rápidas</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.name}
                to={action.href}
                className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="flex items-center mb-2">
                  <div className={`p-2 ${action.color} rounded-lg`}>
                    <Icon className="text-white" size={20} />
                  </div>
                  <h4 className="ml-3 font-medium text-gray-900">{action.name}</h4>
                </div>
                <p className="text-sm text-gray-600">{action.description}</p>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Status */}
      {error && (
        <div className="card bg-red-50 border-red-200 mb-8">
          <div className="flex items-center">
            <AlertCircle className="text-red-500 mr-2" size={20} />
            <p className="text-red-700">Error: {error}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center py-8">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando estadísticas...</p>
        </div>
      )}
    </div>
  )
}