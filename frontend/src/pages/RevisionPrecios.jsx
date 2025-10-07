import { useState, useEffect } from 'react'
import { 
  DollarSign, 
  Package,
  ArrowLeft,
  AlertCircle, 
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Eye,
  Building2,
  Calendar,
  FileText,
  Plus,
  Link2Off,
  RotateCcw,
  Trash2
} from 'lucide-react'
import api from '../services/api'

export default function RevisionPrecios() {
  // Estados principales
  const [vista, setVista] = useState('lista') // 'lista' o 'detalle'
  const [facturas, setFacturas] = useState([])
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('PROCESADA')
  const [filtroProductos, setFiltroProductos] = useState('todos')
  
  // Modales
  const [modalBusqueda, setModalBusqueda] = useState(false)
  const [modalCrear, setModalCrear] = useState(false)
  const [productoActual, setProductoActual] = useState(null)
  
  // Búsqueda
  const [terminoBusqueda, setTerminoBusqueda] = useState('')
  const [resultadosBusqueda, setResultadosBusqueda] = useState([])
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
      loadFacturas()
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

  const abrirFactura = (factura) => {
    setFacturaSeleccionada(factura)
    setProductos(factura.productos || [])
    setVista('detalle')
  }

  const volverALista = () => {
    setVista('lista')
    setFacturaSeleccionada(null)
    setProductos([])
    setFiltroProductos('todos')
    loadFacturas()
  }

  // Búsqueda de productos
  const abrirBusqueda = (producto) => {
    setProductoActual(producto)
    setModalBusqueda(true)
    setTerminoBusqueda('')
    setResultadosBusqueda([])
  }

  const buscarProductos = async (termino) => {
    if (!termino || termino.length < 2) {
      setResultadosBusqueda([])
      return
    }

    try {
      setBuscando(true)
      const response = await api.get(`/productos-revision/buscar?q=${encodeURIComponent(termino)}`)
      const result = response.data

      if (result.success) {
        setResultadosBusqueda(result.productos || [])
      }
    } catch (err) {
      console.error('Error buscando:', err)
    } finally {
      setBuscando(false)
    }
  }

  // Debounce para búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      if (terminoBusqueda) {
        buscarProductos(terminoBusqueda)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [terminoBusqueda])

  const relacionarProducto = async (alegraId, nombre) => {
    try {
      const response = await api.post('/revision-precios/confirmar-producto', {
        productoId: productoActual.id,
        alegraItemId: alegraId,
        confianza: 100
      })

      if (response.data.success) {
        alert(`✅ Producto relacionado: ${nombre}`)
        setModalBusqueda(false)
        // Recargar factura
        const facturaResponse = await api.get(`/revision-precios/facturas?estado=${filtroEstado}`)
        const facturaActualizada = facturaResponse.data.facturas.find(f => f.id === facturaSeleccionada.id)
        if (facturaActualizada) {
          setFacturaSeleccionada(facturaActualizada)
          setProductos(facturaActualizada.productos || [])
        }
      }
    } catch (err) {
      alert('❌ Error: ' + err.message)
    }
  }

  // Crear producto
  const [categorias, setCategorias] = useState([])
  const [imagenPreview, setImagenPreview] = useState(null)

  const abrirCrear = (producto) => {
    setProductoActual(producto)
    setModalCrear(true)
    setImagenPreview(null)
    loadCategorias()
  }

  const loadCategorias = async () => {
    try {
      const response = await api.get('/alegra/categorias')
      if (response.data.success) {
        setCategorias(response.data.categorias || [])
      }
    } catch (err) {
      console.error('Error cargando categorías:', err)
      // Fallback con categorías básicas
      setCategorias([
        { id: 1, name: 'Inventario' },
        { id: 2, name: 'Consumo' }
      ])
    }
  }

  const handleImagenChange = (e) => {
    const file = e.target.files[0]
    if (!file) {
      setImagenPreview(null)
      return
    }

    // Validar tamaño (2MB máximo)
    if (file.size > 2 * 1024 * 1024) {
      alert('❌ La imagen debe ser menor a 2MB')
      e.target.value = ''
      setImagenPreview(null)
      return
    }

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      alert('❌ Solo se permiten archivos de imagen')
      e.target.value = ''
      setImagenPreview(null)
      return
    }

    // Preview
    const reader = new FileReader()
    reader.onload = (event) => {
      setImagenPreview(event.target.result)
    }
    reader.readAsDataURL(file)
  }

  const removerImagen = () => {
    setImagenPreview(null)
    const input = document.getElementById('imagenProducto')
    if (input) input.value = ''
  }

  const crearProducto = async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)

    try {
      const response = await api.post('/productos-revision/crear', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      if (response.data.success) {
        alert('✅ Producto creado y relacionado exitosamente')
        setModalCrear(false)
        // Recargar
        const facturaResponse = await api.get(`/revision-precios/facturas?estado=${filtroEstado}`)
        const facturaActualizada = facturaResponse.data.facturas.find(f => f.id === facturaSeleccionada.id)
        if (facturaActualizada) {
          setFacturaSeleccionada(facturaActualizada)
          setProductos(facturaActualizada.productos || [])
        }
      }
    } catch (err) {
      alert('❌ Error: ' + err.message)
    }
  }

  // Acciones de productos
  const ignorarProducto = async (productoId) => {
    try {
      await api.post('/revision-precios/rechazar-producto', { productoId })
      alert('✅ Producto ignorado')
      const facturaResponse = await api.get(`/revision-precios/facturas?estado=${filtroEstado}`)
      const facturaActualizada = facturaResponse.data.facturas.find(f => f.id === facturaSeleccionada.id)
      if (facturaActualizada) {
        setFacturaSeleccionada(facturaActualizada)
        setProductos(facturaActualizada.productos || [])
      }
    } catch (err) {
      alert('❌ Error: ' + err.message)
    }
  }

  // Filtrar productos
  const productosFiltrados = productos.filter(p => {
    if (filtroProductos === 'pendientes') return p.estadoRelacionado === 'PENDIENTE'
    if (filtroProductos === 'relacionados') return p.estadoRelacionado === 'RELACIONADO'
    if (filtroProductos === 'ignorados') return p.estadoRelacionado === 'IGNORADO' || p.estadoRelacionado === 'RECHAZADO'
    return true
  })

  const stats = {
    total: productos.length,
    pendientes: productos.filter(p => p.estadoRelacionado === 'PENDIENTE').length,
    relacionados: productos.filter(p => p.estadoRelacionado === 'RELACIONADO').length,
    ignorados: productos.filter(p => p.estadoRelacionado === 'IGNORADO' || p.estadoRelacionado === 'RECHAZADO').length
  }

  const progreso = stats.total > 0 ? Math.round((stats.relacionados / stats.total) * 100) : 0

  // ====================================
  // VISTA DE LISTA
  // ====================================
  if (vista === 'lista') {
    const facturasFiltradas = facturas.filter(f =>
      f.proveedorNombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.numeroConsecutivo?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="max-w-7xl mx-auto">
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
              onClick={loadFacturas}
              disabled={loading}
              className="btn btn-outline flex items-center"
            >
              <RefreshCw className={`mr-2 ${loading ? 'animate-spin' : ''}`} size={18} />
              Actualizar
            </button>
          </div>
      </div>

      {error && (
          <div className="card bg-red-50 border-red-200 mb-6">
          <div className="flex items-center">
            <AlertCircle className="text-red-500 mr-2" size={20} />
            <p className="text-red-700">Error: {error}</p>
          </div>
        </div>
      )}

        <div className="card mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {loading ? (
          <div className="text-center py-12">
            <div className="spinner mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando facturas...</p>
          </div>
        ) : facturasFiltradas.length === 0 ? (
            <div className="card text-center py-12">
              <Package className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No se encontraron facturas
              </h3>
            </div>
          ) : (
          <div className="space-y-3">
            {facturasFiltradas.map((factura) => {
              const pendientes = factura.productos?.filter(p => p.estadoRelacionado === 'PENDIENTE').length || 0
              const relacionados = factura.productos?.filter(p => p.estadoRelacionado === 'RELACIONADO').length || 0
              
              return (
                <div
                  key={factura.id}
                  onClick={() => abrirFactura(factura)}
                  className="card hover:shadow-lg transition-all cursor-pointer border-l-4"
                  style={{ borderLeftColor: pendientes > 0 ? '#f59e0b' : '#10b981' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <FileText className="text-blue-600" size={20} />
                        <h3 className="text-lg font-bold text-gray-900">
                        {factura.numeroConsecutivo}
                      </h3>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          factura.estado === 'RELACIONADA' ? 'bg-green-100 text-green-800' :
                          factura.estado === 'PROCESADA' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {factura.estado}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <span className="flex items-center">
                          <Building2 className="mr-1" size={14} />
                          {factura.proveedorNombre}
                        </span>
                        <span className="flex items-center">
                          <Calendar className="mr-1" size={14} />
                          {new Date(factura.fechaEmision).toLocaleDateString('es-CR')}
                        </span>
                        <span className="flex items-center">
                          <Package className="mr-1" size={14} />
                          {factura.totalProductos} productos
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm text-gray-500 mb-1">Total</p>
                      <p className="text-xl font-bold text-gray-900">
                        ₡{factura.totalFactura?.toLocaleString('es-CR')}
                      </p>
                      <div className="flex gap-2 mt-2 text-xs">
                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded">
                          {relacionados} ✓
                        </span>
                        <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                          {pendientes} ⏳
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ====================================
  // VISTA DE DETALLE
  // ====================================
  return (
    <div className="max-w-7xl mx-auto">
      {/* Header con botón volver */}
      <div className="mb-6">
        <button
          onClick={volverALista}
          className="btn btn-outline flex items-center mb-4"
        >
          <ArrowLeft className="mr-2" size={18} />
          Volver a la lista
        </button>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {facturaSeleccionada?.numeroConsecutivo}
              </h2>
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span className="flex items-center">
                  <Building2 className="mr-1" size={16} />
                  {facturaSeleccionada?.proveedorNombre}
                </span>
                <span className="flex items-center">
                  <Calendar className="mr-1" size={16} />
                  {new Date(facturaSeleccionada?.fechaEmision).toLocaleDateString('es-CR')}
                </span>
              </div>
                    </div>
                    <div className="text-right">
              <p className="text-sm text-gray-500">Total Factura</p>
              <p className="text-2xl font-bold text-gray-900">
                ₡{facturaSeleccionada?.totalFactura?.toLocaleString('es-CR')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Progreso */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Progreso de Revisión</h3>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600">{progreso}% completado</span>
            {progreso === 100 && facturaSeleccionada?.estado !== 'PENDIENTE' && (
              <button
                onClick={async () => {
                  if (confirm('¿Deseas devolver esta factura para hacer correcciones? Volverá al estado PROCESADA.')) {
                    try {
                      await api.post(`/revision-precios/devolver-factura`, { 
                        facturaId: facturaSeleccionada.id 
                      })
                      alert('✅ Factura devuelta al estado PROCESADA')
                      volverALista()
                    } catch (err) {
                      alert('❌ Error: ' + err.message)
                    }
                  }
                }}
                className="btn btn-outline text-sm text-orange-600 hover:bg-orange-50 border-orange-300 flex items-center"
              >
                <RotateCcw size={16} className="mr-1" />
                Devolver Factura
              </button>
            )}
          </div>
        </div>
        <div className="bg-gray-200 rounded-full h-3 mb-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${progreso}%` }}
          ></div>
        </div>
        <div className="grid grid-cols-4 gap-4 text-center text-sm">
          <div>
            <p className="text-gray-600">Total</p>
            <p className="text-xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div>
            <p className="text-green-600">Relacionados</p>
            <p className="text-xl font-bold text-green-600">{stats.relacionados}</p>
          </div>
          <div>
            <p className="text-yellow-600">Pendientes</p>
            <p className="text-xl font-bold text-yellow-600">{stats.pendientes}</p>
          </div>
          <div>
            <p className="text-red-600">Ignorados</p>
            <p className="text-xl font-bold text-red-600">{stats.ignorados}</p>
          </div>
        </div>
      </div>

      {/* Filtros de productos */}
      <div className="card mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setFiltroProductos('todos')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              filtroProductos === 'todos'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Todos ({stats.total})
          </button>
          <button
            onClick={() => setFiltroProductos('pendientes')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              filtroProductos === 'pendientes'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Pendientes ({stats.pendientes})
          </button>
          <button
            onClick={() => setFiltroProductos('relacionados')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              filtroProductos === 'relacionados'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Relacionados ({stats.relacionados})
          </button>
          <button
            onClick={() => setFiltroProductos('ignorados')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              filtroProductos === 'ignorados'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Ignorados ({stats.ignorados})
          </button>
        </div>
      </div>

      {/* Lista de productos */}
      <div className="space-y-4">
        {productosFiltrados.map((producto) => {
          const estado = producto.estadoRelacionado
          const colores = {
            PENDIENTE: 'border-yellow-300 bg-yellow-50',
            RELACIONADO: 'border-green-300 bg-green-50',
            IGNORADO: 'border-red-300 bg-red-50',
            RECHAZADO: 'border-red-300 bg-red-50'
          }

          return (
            <div key={producto.id} className={`card border-l-4 ${colores[estado] || 'border-gray-300'}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold text-gray-900">{producto.descripcion}</h4>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      estado === 'RELACIONADO' ? 'bg-green-100 text-green-800' :
                      estado === 'PENDIENTE' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {estado === 'RELACIONADO' ? '✓ Relacionado' :
                       estado === 'PENDIENTE' ? '⏳ Pendiente' : '❌ Ignorado'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">
                    Código: <span className="font-mono bg-white px-2 py-0.5 rounded">{producto.codigoProveedor}</span>
                  </p>
                  {producto.mapeo && (
                    <p className="text-sm text-green-700 bg-green-100 inline-block px-2 py-1 rounded">
                      ✓ Relacionado con: {producto.mapeo.alegraProductName}
                    </p>
                  )}
                </div>

                <div className="text-right bg-white rounded-lg px-4 py-2 border">
                  <p className="text-lg font-bold text-gray-900">
                    ₡{producto.precioUnitario?.toLocaleString('es-CR')}
                  </p>
                  <p className="text-sm text-gray-600">x {producto.cantidad} uds</p>
                  <p className="text-xs text-gray-500 mt-1 pt-1 border-t">
                    Total: ₡{(producto.precioUnitario * producto.cantidad).toLocaleString('es-CR')}
                  </p>
                </div>
              </div>

              {/* Acciones */}
              {estado === 'PENDIENTE' && (
                <div className="flex gap-2 pt-3 border-t">
                  <button
                    onClick={() => abrirBusqueda(producto)}
                    className="btn btn-primary flex items-center text-sm"
                  >
                    <Search size={16} className="mr-1" />
                    Buscar Producto
                  </button>
                  <button
                    onClick={() => abrirCrear(producto)}
                    className="btn btn-success flex items-center text-sm"
                  >
                    <Plus size={16} className="mr-1" />
                    Crear Nuevo
                  </button>
                  <button
                    onClick={() => ignorarProducto(producto.id)}
                    className="btn btn-outline flex items-center text-sm text-red-600 hover:bg-red-50"
                  >
                    <XCircle size={16} className="mr-1" />
                    Ignorar
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal de Búsqueda */}
      {modalBusqueda && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6 border-b sticky top-0 bg-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">Buscar Producto en Alegra</h3>
                <button
                  onClick={() => setModalBusqueda(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle size={24} />
                </button>
              </div>

              {productoActual && (
                <div className="bg-blue-50 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-blue-900 mb-2">{productoActual.descripcion}</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm text-blue-800">
                    <span>Código: {productoActual.codigoProveedor}</span>
                    <span>Cantidad: {productoActual.cantidad}</span>
                    <span>Precio: ₡{productoActual.precioUnitario?.toLocaleString('es-CR')}</span>
                  </div>
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Buscar por nombre o referencia..."
                  value={terminoBusqueda}
                  onChange={(e) => setTerminoBusqueda(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
            </div>

            <div className="p-6">
              {buscando ? (
                <div className="text-center py-8">
                  <div className="spinner mx-auto mb-4"></div>
                  <p className="text-gray-600">Buscando...</p>
                </div>
              ) : resultadosBusqueda.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {terminoBusqueda.length < 2 
                    ? 'Escribe al menos 2 caracteres para buscar'
                    : 'No se encontraron productos'}
                </div>
              ) : (
                <div className="space-y-2">
                  {resultadosBusqueda.map((resultado) => (
                    <div
                      key={resultado.id}
                      className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between"
                      onClick={() => relacionarProducto(resultado.id, resultado.name)}
                    >
                      <div>
                        <h4 className="font-semibold text-gray-900">{resultado.name}</h4>
                        <div className="flex gap-4 text-sm text-gray-600 mt-1">
                          <span>Ref: {resultado.reference || 'N/A'}</span>
                          <span>₡{resultado.price?.toLocaleString('es-CR')}</span>
                        </div>
                      </div>
                      <button className="btn btn-primary text-sm">
                        Seleccionar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Crear Producto - COMPLETO */}
      {modalCrear && productoActual && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6 border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900 flex items-center">
                  <Plus className="mr-2 text-green-600" size={24} />
                  Crear Producto Nuevo en Alegra
                </h3>
                <button
                  onClick={() => { setModalCrear(false); removerImagen(); }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle size={24} />
                </button>
              </div>
            </div>

            <form onSubmit={crearProducto} className="p-6">
              {/* Info del producto proveedor */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 mb-6 border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-3 flex items-center">
                  <Building2 className="mr-2" size={18} />
                  Datos del Proveedor (referencia)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-blue-600 font-medium">Descripción:</span>
                    <p className="text-blue-900 font-semibold">{productoActual.descripcion}</p>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Código:</span>
                    <p className="text-blue-900 font-mono">{productoActual.codigoProveedor}</p>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Precio:</span>
                    <p className="text-blue-900 font-bold">₡{productoActual.precioUnitario?.toLocaleString('es-CR')}</p>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Cantidad:</span>
                    <p className="text-blue-900">{productoActual.cantidad} {productoActual.unidadMedida}</p>
                  </div>
                </div>
              </div>

              {/* Campo oculto con ID del producto */}
              <input type="hidden" name="productoId" value={productoActual.id} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Columna izquierda */}
                <div className="space-y-4">
                  {/* Nombre */}
                  <div>
                    <label className="label flex items-center">
                      <Package className="mr-1" size={16} />
                      Nombre del producto *
                    </label>
                    <input
                      type="text"
                      name="nombre"
                      defaultValue={productoActual.descripcion}
                      required
                      maxLength="150"
                      className="input"
                      placeholder="Nombre que aparecerá en Alegra"
                    />
                    <p className="text-xs text-gray-500 mt-1">Máximo 150 caracteres</p>
                  </div>

                  {/* Descripción */}
                  <div>
                    <label className="label flex items-center">
                      <FileText className="mr-1" size={16} />
                      Descripción
                    </label>
                    <textarea
                      name="descripcion"
                      defaultValue={productoActual.descripcion}
                      rows="3"
                      maxLength="500"
                      className="input resize-none"
                      placeholder="Descripción detallada del producto"
                    />
                    <p className="text-xs text-gray-500 mt-1">Máximo 500 caracteres</p>
                  </div>

                  {/* Referencia y Unidad */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Código/Referencia</label>
                      <input
                        type="text"
                        name="referencia"
                        defaultValue={productoActual.codigoProveedor}
                        className="input"
                        placeholder="Código interno"
                      />
                    </div>

                    <div>
                      <label className="label">Unidad</label>
                      <select name="unidad" className="input" defaultValue="unit">
                        <option value="unit">Unidad</option>
                        <option value="meter">Metro</option>
                        <option value="kilogram">Kilogramo</option>
                        <option value="gram">Gramo</option>
                        <option value="liter">Litro</option>
                        <option value="hour">Hora</option>
                        <option value="day">Día</option>
                        <option value="service">Servicio</option>
                      </select>
                    </div>
                  </div>

                  {/* Categoría */}
                  <div>
                    <label className="label">Categoría *</label>
                    <select name="categoria" className="input" defaultValue="2" required>
                      {categorias.length === 0 ? (
                        <>
                          <option value="2">Consumo</option>
                          <option value="1">Inventario</option>
                        </>
                      ) : (
                        categorias.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))
                      )}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Categoría del producto en Alegra</p>
                  </div>
                </div>

                {/* Columna derecha */}
                <div className="space-y-4">
                  {/* Precios */}
                  <div className="grid grid-cols-2 gap-3">
                      <div>
                      <label className="label">Precio de Venta *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₡</span>
                        <input
                          type="number"
                          name="precio"
                          defaultValue={productoActual.precioUnitario}
                          step="0.01"
                          min="0"
                          required
                          className="input pl-8"
                          placeholder="0.00"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Precio sin IVA</p>
                    </div>

                      <div>
                      <label className="label">Costo Unitario *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₡</span>
                        <input
                          type="number"
                          name="costo"
                          defaultValue={productoActual.precioUnitario}
                          step="0.01"
                          min="0"
                          required
                          className="input pl-8"
                          placeholder="0.00"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Costo de compra</p>
                    </div>
                  </div>

                  {/* Cantidad inicial */}
                  <div>
                    <label className="label">Cantidad Inicial (opcional)</label>
                    <input
                      type="number"
                      name="cantidadInicial"
                      defaultValue={productoActual.cantidad || 0}
                      step="0.01"
                      min="0"
                      className="input"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">Inventario inicial en Alegra</p>
                  </div>

                  {/* Imagen del producto */}
                      <div>
                    <label className="label flex items-center">
                      <Eye className="mr-1" size={16} />
                      Imagen del Producto (opcional)
                    </label>
                    <input
                      type="file"
                      id="imagenProducto"
                      name="imagen"
                      accept="image/jpeg,image/png,image/gif"
                      onChange={handleImagenChange}
                      className="input file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <p className="text-xs text-gray-500 mt-1">JPG, PNG o GIF - Máximo 2MB</p>
                  </div>

                  {/* Preview de imagen */}
                  {imagenPreview && (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">Preview:</p>
                      <div className="flex items-center justify-between">
                        <img
                          src={imagenPreview}
                          alt="Preview"
                          className="max-w-[150px] max-h-[150px] rounded-lg border border-gray-200 object-contain"
                        />
                        <button
                          type="button"
                          onClick={removerImagen}
                          className="btn btn-outline text-red-600 hover:bg-red-50 text-sm"
                        >
                          <Trash2 size={16} className="mr-1" />
                          Remover
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Info de ayuda */}
              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertCircle className="text-blue-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">💡 Tip:</p>
                    <p>Los datos se han pre-cargado desde el producto del proveedor. Puedes editarlos antes de crear el producto en Alegra. El producto se creará y se relacionará automáticamente con esta factura.</p>
                  </div>
                </div>
              </div>

              {/* Botones */}
              <div className="flex gap-3 mt-6 pt-6 border-t">
                <button type="submit" className="btn btn-primary flex-1 flex items-center justify-center">
                  <Plus size={20} className="mr-2" />
                  Crear Producto en Alegra
                </button>
                <button
                  type="button"
                  onClick={() => { setModalCrear(false); removerImagen(); }}
                  className="btn btn-outline flex-1"
                >
                  Cancelar
                </button>
              </div>
            </form>
            </div>
        </div>
      )}
    </div>
  )
}
