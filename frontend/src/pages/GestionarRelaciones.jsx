import { useState, useEffect } from 'react'
import { 
  Link2, 
  Search,
  RefreshCw,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Package,
  Filter,
  Settings
} from 'lucide-react'
import api from '../services/api'

export default function GestionarRelaciones() {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Filtros
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [proveedores, setProveedores] = useState([])
  
  // Modales
  const [modalEditar, setModalEditar] = useState(false)
  const [modalEliminar, setModalEliminar] = useState(false)
  const [modalFactor, setModalFactor] = useState(false)
  const [modalRelaciones, setModalRelaciones] = useState(false)
  const [productoSeleccionado, setProductoSeleccionado] = useState(null)
  const [relacionesProducto, setRelacionesProducto] = useState(null)
  const [cargandoRelaciones, setCargandoRelaciones] = useState(false)
  
  // Factor de conversión
  const [cantidadProveedor, setCantidadProveedor] = useState(1)
  const [cantidadMia, setCantidadMia] = useState(1)
  
  // Búsqueda de nuevo producto
  const [terminoBusqueda, setTerminoBusqueda] = useState('')
  const [resultadosBusqueda, setResultadosBusqueda] = useState([])
  const [buscando, setBuscando] = useState(false)
  
  // Paginación
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    loadProductos()
    loadProveedores()
  }, [page])

  const loadProductos = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams({
        page: page,
        limit: 20,
        estado: 'RELACIONADO',
        proveedor: filtroProveedor,
        busqueda: busqueda
      })

      const response = await api.get(`/productos-revision/relacionados?${params}`)
      const result = response.data

      if (result.success) {
        setProductos(result.productos)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadProveedores = async () => {
    try {
      const response = await api.get('/proveedores')
      if (response.data.success) {
        setProveedores(response.data.proveedores)
      }
    } catch (err) {
      console.error('Error cargando proveedores:', err)
    }
  }

  const aplicarFiltros = () => {
    setPage(1)
    loadProductos()
  }

  const limpiarFiltros = () => {
    setFiltroProveedor('')
    setBusqueda('')
    setPage(1)
    setTimeout(loadProductos, 100)
  }

  // Editar relación
  const abrirEditar = (producto) => {
    setProductoSeleccionado(producto)
    setModalEditar(true)
    setTerminoBusqueda('')
    setResultadosBusqueda([])
  }

  const abrirFactor = (producto) => {
    setProductoSeleccionado(producto)
    
    // Si ya tiene un factor, calcularlo en reversa
    if (producto.mapeo?.factorConversion && producto.mapeo.factorConversion !== 1) {
      // El factor guardado es cantidadMia / cantidadProveedor
      // Intentar inferir valores razonables
      const factor = producto.mapeo.factorConversion
      if (factor < 1) {
        // Ejemplo: 0.5 significa 1 del proveedor = 0.5 mío (2:1)
        setCantidadProveedor(Math.round(1 / factor))
        setCantidadMia(1)
      } else {
        // Ejemplo: 2 significa 1 del proveedor = 2 míos (1:2)
        setCantidadProveedor(1)
        setCantidadMia(Math.round(factor))
      }
    } else {
      setCantidadProveedor(1)
      setCantidadMia(1)
    }
    
    setModalFactor(true)
  }

  // Ver todas las relaciones de un producto
  const abrirRelaciones = async (producto) => {
    if (!producto.alegraItemId) {
      alert('⚠️ Este producto no tiene un ID de Alegra asociado')
      return
    }

    setProductoSeleccionado(producto)
    setModalRelaciones(true)
    setCargandoRelaciones(true)
    setRelacionesProducto(null)

    try {
      const response = await api.get(`/productos-revision/producto/${producto.alegraItemId}/relaciones`)
      if (response.data.success) {
        setRelacionesProducto(response.data)
      } else {
        throw new Error(response.data.error || 'Error cargando relaciones')
      }
    } catch (err) {
      alert('❌ Error cargando relaciones: ' + err.message)
      setModalRelaciones(false)
    } finally {
      setCargandoRelaciones(false)
    }
  }

  const guardarFactor = async () => {
    if (!productoSeleccionado?.mapeo) return

    const cantProv = parseFloat(cantidadProveedor)
    const cantMia = parseFloat(cantidadMia)

    if (cantProv <= 0 || cantMia <= 0) {
      alert('⚠️ Las cantidades deben ser mayores a 0')
      return
    }

    const factor = cantMia / cantProv

    try {
      await api.post('/productos-revision/factor-conversion', {
        mapeoId: productoSeleccionado.mapeo.id,
        factorConversion: factor
      })

      alert(`✅ Factor guardado: ${cantProv} del proveedor = ${cantMia} en tu sistema`)
      setModalFactor(false)
      loadProductos()
    } catch (err) {
      alert('Error guardando factor: ' + err.message)
    }
  }

  const buscarNuevoProducto = async (termino) => {
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

  useEffect(() => {
    const timer = setTimeout(() => {
      if (terminoBusqueda) {
        buscarNuevoProducto(terminoBusqueda)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [terminoBusqueda])

  const cambiarRelacion = async (nuevoAlegraId, nuevoNombre) => {
    try {
      const response = await api.put(`/productos-revision/${productoSeleccionado.id}/editar-relacion`, {
        nuevoAlegraItemId: nuevoAlegraId
      })

      if (response.data.success) {
        alert(`✅ Relación actualizada: ${nuevoNombre}`)
        setModalEditar(false)
        loadProductos()
      }
    } catch (err) {
      alert('❌ Error: ' + err.message)
    }
  }

  // Eliminar relación
  const abrirEliminar = (producto) => {
    setProductoSeleccionado(producto)
    setModalEliminar(true)
  }

  const confirmarEliminacion = async () => {
    try {
      const response = await api.delete(`/productos-revision/${productoSeleccionado.id}/relacion`)

      if (response.data.success) {
        alert('✅ Relación eliminada. El producto volvió a estado PENDIENTE')
        setModalEliminar(false)
        loadProductos()
      }
    } catch (err) {
      alert('❌ Error: ' + err.message)
    }
  }

  // No filter by confidence or state needed as all loaded items are manually related (100% confidence)
  const productosFiltrados = productos;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <Link2 className="text-purple-600" size={28} />
            Gestionar Relaciones
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Consulta, edita o elimina las relaciones establecidas entre productos de proveedores y tu catálogo de Alegra.
          </p>
        </div>
        <button
          onClick={loadProductos}
          disabled={loading}
          className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-xl transition flex items-center gap-1.5"
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} size={16} />
          Actualizar
        </button>
      </div>

      {/* Estadísticas Simplificadas */}
      <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-3xl max-w-sm shadow-xxs">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Total Relaciones Establecidas</p>
        <p className="text-3xl font-black text-blue-900">{total}</p>
      </div>

      {/* Filtros Simplificados */}
      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
          <Filter className="text-gray-500" size={18} />
          <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Filtros</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Proveedor</label>
            <select
              value={filtroProveedor}
              onChange={(e) => setFiltroProveedor(e.target.value)}
              className="input w-full rounded-xl border-gray-200 text-sm"
            >
              <option value="">Todos los proveedores</option>
              {proveedores.map(p => (
                <option key={p.cedula} value={p.nombre}>{p.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Buscar por descripción o código</label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Escribe descripción o código..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="input pl-10 w-full rounded-xl border-gray-200 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={aplicarFiltros} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-sm active:scale-[0.98] transition">
            Buscar
          </button>
          <button onClick={limpiarFiltros} className="px-5 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-sm transition">
            Limpiar
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

      {/* Lista de productos */}
      {loading ? (
        <div className="text-center py-12">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando productos...</p>
        </div>
      ) : productosFiltrados.length === 0 ? (
        <div className="card text-center py-12">
          <Package className="mx-auto text-gray-400 mb-4" size={48} />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No se encontraron productos
          </h3>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {productosFiltrados.map((producto) => {
              return (
                <div key={producto.id} className="card hover:shadow-lg transition-shadow">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Info del producto proveedor */}
                    <div className="lg:col-span-5">
                      <h4 className="font-semibold text-gray-900 mb-2">{producto.descripcion}</h4>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>Código: <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{producto.codigo}</span></p>
                        <p>Proveedor: <span className="font-medium text-gray-800">{producto.proveedor?.nombre}</span></p>
                        <p className="text-xs text-gray-400">
                          ID Mapeo: <span className="font-mono">{producto.id}</span>
                        </p>
                      </div>
                    </div>

                    {/* Info producto Alegra */}
                    <div className="lg:col-span-5">
                      {producto.mapeo ? (
                        <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100">
                          <p className="text-xxs font-bold uppercase tracking-wider text-emerald-600 mb-1.5">Relacionado con Alegra</p>
                          <h5 className="font-semibold text-emerald-950 mb-1 text-sm">{producto.mapeo.alegraName}</h5>
                          <div className="text-xs text-emerald-800 space-y-1 font-mono">
                            <p>Ref: {producto.mapeo.alegraReference || 'N/A'}</p>
                            {producto.factorConversion && producto.factorConversion !== 1 && (
                              <p className="text-blue-600 font-bold mt-1 text-xs">
                                🔄 Factor: {producto.factorConversion}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                          <p className="text-gray-600 text-sm font-medium">Sin relación</p>
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="lg:col-span-2 flex flex-col gap-1.5 justify-center">
                      {producto.estadoRelacionado === 'RELACIONADO' && (
                        <>
                          <button
                            onClick={() => abrirRelaciones(producto)}
                            className="w-full px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold rounded-xl text-xs flex items-center justify-center transition"
                            title="Ver todas las relaciones de este producto con diferentes proveedores"
                          >
                            <Package size={14} className="mr-1" />
                            Ver Relaciones
                          </button>
                          <button
                            onClick={() => abrirEditar(producto)}
                            className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center transition"
                          >
                            <Edit size={14} className="mr-1" />
                            Editar
                          </button>
                          <button
                            onClick={() => abrirFactor(producto)}
                            className="w-full px-3 py-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 font-semibold rounded-xl text-xs flex items-center justify-center transition"
                          >
                            <Settings size={14} className="mr-1" />
                            Factor
                            {producto.mapeo?.factorConversion && producto.mapeo.factorConversion !== 1 && (
                              <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded-full">✓</span>
                            )}
                          </button>
                          <button
                            onClick={() => abrirEliminar(producto)}
                            className="w-full px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 font-semibold rounded-xl text-xs flex items-center justify-center transition"
                          >
                            <Trash2 size={14} className="mr-1" />
                            Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="btn btn-outline text-sm"
              >
                Primera
              </button>
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="btn btn-outline text-sm"
              >
                Anterior
              </button>
              <span className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg font-medium">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === totalPages}
                className="btn btn-outline text-sm"
              >
                Siguiente
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="btn btn-outline text-sm"
              >
                Última
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal Editar */}
      {modalEditar && productoSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6 border-b sticky top-0 bg-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">Editar Relación</h3>
                <button
                  onClick={() => setModalEditar(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle size={24} />
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">Producto Actual:</h4>
                <p className="text-sm text-gray-700 mb-1">{productoSeleccionado.descripcion}</p>
                <p className="text-sm text-gray-600">Código: {productoSeleccionado.codigoProveedor}</p>
                {productoSeleccionado.mapeo && (
                  <p className="text-sm text-green-700 mt-2">
                    Actualmente relacionado con: <strong>{productoSeleccionado.mapeo.alegraName}</strong>
                  </p>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Buscar nuevo producto en Alegra..."
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
                      onClick={() => cambiarRelacion(resultado.id, resultado.name)}
                    >
                      <div>
                        <h4 className="font-semibold text-gray-900">{resultado.name}</h4>
                        <div className="flex gap-4 text-sm text-gray-600 mt-1">
                          <span>Ref: {resultado.reference || 'N/A'}</span>
                          <span>₡{resultado.price?.toLocaleString('es-CR')}</span>
                        </div>
                      </div>
                      <button className="btn btn-primary text-sm">
                        Cambiar a este
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Factor de Conversión */}
      {modalFactor && productoSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-xl border border-gray-100 flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-gray-50 flex-shrink-0 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Factor de Conversión</h3>
              <button
                onClick={() => setModalFactor(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <XCircle size={22} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-grow">
              {/* Info del producto */}
              <div className="bg-gray-50/70 p-5 rounded-2xl border border-gray-100">
                <p className="text-xxs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Producto del proveedor</p>
                <p className="font-semibold text-gray-900 text-sm leading-snug">{productoSeleccionado.descripcion}</p>
                <p className="text-xs text-gray-500 mt-1">Relacionado con: <span className="font-medium text-gray-700">{productoSeleccionado.mapeo?.alegraName}</span></p>
              </div>

              <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100/70">
                <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-4">
                  Define la equivalencia entre las cantidades
                </p>
                
                <div className="grid grid-cols-5 gap-3 items-center">
                  {/* Cantidad Proveedor */}
                  <div className="col-span-2 space-y-1">
                    <label className="block text-xxs font-bold text-gray-500 uppercase">Cantidad Proveedor</label>
                    <input
                      type="number"
                      value={cantidadProveedor}
                      onChange={(e) => setCantidadProveedor(e.target.value)}
                      step="1"
                      min="1"
                      className="input w-full rounded-xl border-gray-200 text-sm py-2"
                      placeholder="Ej: 24"
                    />
                    <p className="text-[10px] text-gray-400 font-medium">Unidades que factura</p>
                  </div>

                  {/* Icono = */}
                  <div className="col-span-1 text-center pt-3">
                    <span className="text-xl text-blue-600 font-black">=</span>
                  </div>

                  {/* Cantidad Mía */}
                  <div className="col-span-2 space-y-1">
                    <label className="block text-xxs font-bold text-gray-500 uppercase">Cantidad en Tu Sistema</label>
                    <input
                      type="number"
                      value={cantidadMia}
                      onChange={(e) => setCantidadMia(e.target.value)}
                      step="1"
                      min="1"
                      className="input w-full rounded-xl border-gray-200 text-sm py-2"
                      placeholder="Ej: 12"
                    />
                    <p className="text-[10px] text-gray-400 font-medium">Unidades que registras</p>
                  </div>
                </div>
              </div>

              {/* Vista Previa */}
              <div className="bg-gray-50/70 p-5 rounded-2xl border border-gray-100 space-y-2">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Vista Previa</p>
                {(() => {
                  const cantProv = parseFloat(cantidadProveedor) || 1
                  const cantMia = parseFloat(cantidadMia) || 1
                  const factor = cantMia / cantProv
                  const ejemploProveedor = 10
                  const ejemploResultado = (ejemploProveedor * factor).toFixed(2)

                  return (
                    <div className="text-sm text-gray-600 space-y-1 leading-relaxed">
                      <p>
                        <strong>Configuración:</strong> {cantProv} del proveedor = {cantMia} en tu sistema
                      </p>
                      <p className="text-blue-700 font-medium bg-blue-50/40 p-2 rounded-lg border border-blue-50/60 mt-1.5 text-xs">
                        <strong>Ejemplo:</strong> Si el proveedor factura <strong>{ejemploProveedor}</strong>, 
                        en tu sistema se registrarán <strong>{ejemploResultado}</strong>
                      </p>
                    </div>
                  )
                })()}
              </div>
            </div>

            <div className="p-6 border-t border-gray-50 bg-gray-50/50 flex gap-3 flex-shrink-0">
              <button
                onClick={guardarFactor}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-sm active:scale-[0.98] transition flex-1"
              >
                Guardar Factor
              </button>
              <button
                onClick={() => setModalFactor(false)}
                className="px-5 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-sm transition flex-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Eliminar */}
      {modalEliminar && productoSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">Confirmar Eliminación</h3>
                <button
                  onClick={() => setModalEliminar(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle size={24} />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <div className="flex items-start">
                  <AlertCircle className="text-yellow-600 mr-3 flex-shrink-0" size={24} />
                  <div>
                    <p className="font-semibold text-yellow-900 mb-1">¿Estás seguro?</p>
                    <p className="text-sm text-yellow-800">
                      El producto volverá al estado <strong>PENDIENTE</strong> y tendrás que relacionarlo nuevamente.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">Producto:</h4>
                <p className="text-sm text-gray-700">{productoSeleccionado.descripcion}</p>
                {productoSeleccionado.mapeo && (
                  <p className="text-sm text-gray-600 mt-2">
                    Relacionado con: <strong>{productoSeleccionado.mapeo.alegraName}</strong>
                  </p>
                )}
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50 flex gap-3">
              <button
                onClick={confirmarEliminacion}
                className="btn btn-danger flex-1"
              >
                Eliminar Relación
              </button>
              <button
                onClick={() => setModalEliminar(false)}
                className="btn btn-outline flex-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ver Relaciones - MEJORADO */}
      {modalRelaciones && productoSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6 border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">📦 Relaciones del Producto</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Todas las relaciones de este producto con diferentes proveedores
                  </p>
                </div>
                <button
                  onClick={() => setModalRelaciones(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle size={24} />
                </button>
              </div>

              {/* Info del producto de Alegra */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-2">Producto en Alegra:</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-600 font-medium">Nombre:</span>
                    <p className="text-blue-900">{productoSeleccionado.mapeo?.alegraName || productoSeleccionado.alegraName || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Referencia:</span>
                    <p className="text-blue-900 font-mono">{productoSeleccionado.mapeo?.alegraReference || productoSeleccionado.alegraReference || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">ID Alegra:</span>
                    <p className="text-blue-900 font-mono text-xs">{productoSeleccionado.alegraItemId}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6">
              {cargandoRelaciones ? (
                <div className="text-center py-12">
                  <div className="spinner mx-auto mb-4"></div>
                  <p className="text-gray-600">Cargando relaciones...</p>
                </div>
              ) : relacionesProducto && relacionesProducto.relaciones ? (
                relacionesProducto.relaciones.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="mx-auto text-gray-400 mb-4" size={48} />
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">
                      No hay relaciones con proveedores
                    </h4>
                    <p className="text-gray-600">
                      Este producto aún no tiene relaciones con proveedores.
                    </p>
                  </div>
                ) : (
                  <div>
                    {/* Título de sección */}
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-gray-700 mb-2">
                        Este producto está relacionado con:
                      </h3>
                    </div>

                    {/* Lista simple de proveedores */}
                    <div className="space-y-3">
                      {relacionesProducto.relaciones.map((relacion, index) => (
                        <div 
                          key={relacion.mapeoId} 
                          className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-1">
                                <span className="font-semibold text-gray-900">
                                  {relacion.proveedor.nombre}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <span>
                                  <span className="font-medium">Código:</span>{' '}
                                  <span className="font-mono text-gray-900">{relacion.codigoProveedor || 'N/A'}</span>
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold text-green-600">
                                {relacion.precio ? (
                                  <>₡{relacion.precio.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</>
                                ) : (
                                  <span className="text-gray-400 text-sm">Sin precio</span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">Precio de costo</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              ) : (
                <div className="text-center py-12 text-gray-500">
                  No se pudieron cargar las relaciones
                </div>
              )}
            </div>

            <div className="p-6 border-t bg-gray-50">
              <button
                onClick={() => setModalRelaciones(false)}
                className="btn btn-primary w-full"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

