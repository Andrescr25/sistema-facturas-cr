import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Package,
  Search,
  Check,
  X,
  Link2,
  Plus,
  AlertCircle,
  Loader,
  XCircle,
  Eye,
  Building2,
  FileText,
  Trash2
} from 'lucide-react'
import api from '../services/api'

export default function RelacionarProductos() {
  const { facturaId } = useParams()
  const navigate = useNavigate()

  const [factura, setFactura] = useState(null)
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  
  // Modal de búsqueda
  const [modalBusqueda, setModalBusqueda] = useState(false)
  const [productoSeleccionado, setProductoSeleccionado] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [resultadosBusqueda, setResultadosBusqueda] = useState([])
  const [buscando, setBuscando] = useState(false)
  
  // Modal crear producto
  const [modalCrear, setModalCrear] = useState(false)
  const [categorias, setCategorias] = useState([])
  const [imagenPreview, setImagenPreview] = useState(null)

  useEffect(() => {
    if (facturaId) {
      loadFactura()
    }
  }, [facturaId])

  const loadFactura = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await api.get(`/alegra/facturas/detalle/${facturaId}`)
      
      if (response.data.success) {
        setFactura(response.data.data)
        setProductos(response.data.data.productos || [])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const buscarProductos = async (query) => {
    if (!query || query.length < 2) {
      setResultadosBusqueda([])
      return
    }

    try {
      setBuscando(true)
      const response = await api.get(`/productos-revision/buscar?q=${encodeURIComponent(query)}`)
      
      if (response.data.success) {
        setResultadosBusqueda(response.data.productos || [])
      }
    } catch (err) {
      console.error('Error buscando productos:', err)
    } finally {
      setBuscando(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      buscarProductos(busqueda)
    }, 300)

    return () => clearTimeout(timer)
  }, [busqueda])

  const abrirModalBusqueda = (producto) => {
    setProductoSeleccionado(producto)
    setModalBusqueda(true)
    setBusqueda('')
    setResultadosBusqueda([])
  }

  const cerrarModalBusqueda = () => {
    setModalBusqueda(false)
    setProductoSeleccionado(null)
    setBusqueda('')
    setResultadosBusqueda([])
  }

  const relacionarProducto = async (alegraProducto) => {
    if (!productoSeleccionado) return

    try {
      const response = await api.post('/productos-revision/relacion', {
        productoProveedorId: productoSeleccionado.id,
        alegraItemId: alegraProducto.id,
        facturaId: facturaId
      })

      if (response.data.success) {
        // Actualizar producto en la lista
        setProductos(prev => prev.map(p => 
          p.id === productoSeleccionado.id 
            ? { ...p, estadoRelacionado: 'RELACIONADO', alegraItemId: alegraProducto.id }
            : p
        ))
        cerrarModalBusqueda()
      }
    } catch (err) {
      alert('Error relacionando producto: ' + err.message)
    }
  }

  const ignorarProducto = async (producto) => {
    const confirmar = window.confirm(`¿Ignorar "${producto.descripcion}"?`)
    if (!confirmar) return

    // Implementar lógica de ignorar
    alert('Funcionalidad de ignorar producto - por implementar')
  }

  // Funciones para crear producto
  const abrirModalCrear = (producto) => {
    setProductoSeleccionado(producto)
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
      alert('⚠️ La imagen debe ser menor a 2MB')
      e.target.value = ''
      setImagenPreview(null)
      return
    }

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      alert('⚠️ Solo se permiten archivos de imagen')
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
        removerImagen()
        // Recargar factura
        loadFactura()
      }
    } catch (err) {
      alert('⚠️ Error: ' + err.message)
    }
  }

  const productosFiltrados = productos.filter(p => {
    if (filtro === 'pendientes') return p.estadoRelacionado === 'PENDIENTE'
    if (filtro === 'relacionados') return p.estadoRelacionado === 'RELACIONADO'
    if (filtro === 'ignorados') return p.estadoRelacionado === 'IGNORADO'
    return true
  })

  const stats = {
    total: productos.length,
    relacionados: productos.filter(p => p.estadoRelacionado === 'RELACIONADO').length,
    pendientes: productos.filter(p => p.estadoRelacionado === 'PENDIENTE').length,
    ignorados: productos.filter(p => p.estadoRelacionado === 'IGNORADO').length
  }

  const progreso = stats.total > 0 ? Math.round((stats.relacionados / stats.total) * 100) : 0

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <Loader className="mx-auto animate-spin mb-4" size={48} />
        <p className="text-gray-600">Cargando factura...</p>
      </div>
    )
  }

  if (error || !factura) {
    return (
      <div className="max-w-7xl mx-auto py-12">
        <div className="card bg-red-50 border-red-200">
          <div className="flex items-center text-red-800">
            <AlertCircle className="mr-2" size={20} />
            {error || 'Factura no encontrada'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/revision-precios')}
          className="btn btn-outline flex items-center mb-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          Volver
        </button>

        <h1 className="text-3xl font-bold text-gray-900">
          Relacionar Productos
        </h1>
        <p className="text-gray-600 mt-1">
          Factura #{factura.numeroConsecutivo} - {factura.proveedorNombre}
        </p>
      </div>

      {/* Progreso */}
      <div className="card mb-6">
        <h3 className="font-bold text-gray-900 mb-3">Progreso de Relacionado</h3>
        <div className="bg-gray-200 rounded-full h-4 mb-3">
          <div
            className="bg-green-600 h-4 rounded-full transition-all duration-300"
            style={{ width: `${progreso}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-sm">
          <span className="font-bold text-gray-900">{progreso}% completado</span>
          <div className="flex gap-4">
            <span className="text-green-600">✓ {stats.relacionados}</span>
            <span className="text-orange-600">⏳ {stats.pendientes}</span>
            <span className="text-gray-600">Total: {stats.total}</span>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setFiltro('todos')}
            className={`px-4 py-2 rounded-lg font-medium text-sm ${
              filtro === 'todos'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Todos ({stats.total})
          </button>
          <button
            onClick={() => setFiltro('pendientes')}
            className={`px-4 py-2 rounded-lg font-medium text-sm ${
              filtro === 'pendientes'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Pendientes ({stats.pendientes})
          </button>
          <button
            onClick={() => setFiltro('relacionados')}
            className={`px-4 py-2 rounded-lg font-medium text-sm ${
              filtro === 'relacionados'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Relacionados ({stats.relacionados})
          </button>
        </div>
      </div>

      {/* Lista de productos */}
      <div className="space-y-4">
        {productosFiltrados.map(producto => (
          <div
            key={producto.id}
            className={`card border-l-4 ${
              producto.estadoRelacionado === 'RELACIONADO' ? 'border-l-green-500' :
              producto.estadoRelacionado === 'IGNORADO' ? 'border-l-red-500' :
              'border-l-orange-500'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">
                  {producto.descripcion}
                </h3>
                <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                  <span>Código: {producto.codigoProveedor}</span>
                  <span>Cantidad: {producto.cantidad} {producto.unidadMedida}</span>
                  <span>Precio: ₡{producto.precioUnitario?.toLocaleString('es-CR')}</span>
                </div>
                {producto.estadoRelacionado === 'RELACIONADO' && (
                  <div className="mt-2 text-sm text-green-700 flex items-center">
                    <Check size={16} className="mr-1" />
                    Relacionado con producto Alegra ID: {producto.alegraItemId}
                  </div>
                )}
              </div>

              <div className="flex gap-2 ml-4">
                {producto.estadoRelacionado === 'PENDIENTE' && (
                  <>
                    <button
                      onClick={() => abrirModalBusqueda(producto)}
                      className="btn btn-primary flex items-center"
                    >
                      <Link2 size={16} className="mr-1" />
                      Relacionar
                    </button>
                  </>
                )}
                {producto.estadoRelacionado === 'RELACIONADO' && (
                  <span className="badge badge-success flex items-center">
                    <Check size={14} className="mr-1" />
                    Relacionado
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de búsqueda */}
      {modalBusqueda && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">
                  Buscar Producto en Alegra
                </h3>
                <button
                  onClick={cerrarModalBusqueda}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  Producto del proveedor: <strong>{productoSeleccionado?.descripcion}</strong>
                </p>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar en productos de Alegra..."
                  className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {buscando ? (
                <div className="text-center py-8">
                  <Loader className="mx-auto animate-spin mb-4" size={32} />
                  <p className="text-gray-600">Buscando...</p>
                </div>
              ) : resultadosBusqueda.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="mx-auto text-gray-400 mb-4" size={48} />
                  <p className="text-gray-600">
                    {busqueda ? 'No se encontraron productos' : 'Escribe para buscar productos'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {resultadosBusqueda.map(prod => (
                    <div
                      key={prod.id}
                      className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => relacionarProducto(prod)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900">{prod.name}</h4>
                          <p className="text-sm text-gray-600">
                            Referencia: {prod.reference || 'N/A'} | Precio: ₡{prod.price?.toLocaleString('es-CR')}
                          </p>
                        </div>
                        <button className="btn btn-sm btn-primary ml-4">
                          Seleccionar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t bg-gray-50">
              <button
                onClick={() => {
                  cerrarModalBusqueda()
                  abrirModalCrear(productoSeleccionado)
                }}
                className="btn btn-success w-full flex items-center justify-center"
              >
                <Plus size={20} className="mr-2" />
                Crear Nuevo Producto en Alegra
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Crear Producto - COMPLETO */}
      {modalCrear && productoSeleccionado && (
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
                    <p className="text-blue-900 font-semibold">{productoSeleccionado.descripcion}</p>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Código:</span>
                    <p className="text-blue-900 font-mono">{productoSeleccionado.codigoProveedor}</p>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Precio:</span>
                    <p className="text-blue-900 font-bold">₡{productoSeleccionado.precioUnitario?.toLocaleString('es-CR')}</p>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Cantidad:</span>
                    <p className="text-blue-900">{productoSeleccionado.cantidad} {productoSeleccionado.unidadMedida}</p>
                  </div>
                </div>
              </div>

              {/* Campo oculto con ID del producto */}
              <input type="hidden" name="productoId" value={productoSeleccionado.id} />

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
                      defaultValue={productoSeleccionado.descripcion}
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
                      defaultValue={productoSeleccionado.descripcion}
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
                        defaultValue={productoSeleccionado.codigoProveedor}
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
                          defaultValue={productoSeleccionado.precioUnitario}
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
                          defaultValue={productoSeleccionado.precioUnitario}
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
                      defaultValue={productoSeleccionado.cantidad || 0}
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

