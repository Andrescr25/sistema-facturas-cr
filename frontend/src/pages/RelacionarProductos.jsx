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
  
  // Modal ajuste de conversión
  const [modalConversion, setModalConversion] = useState(false)
  const [productoRelacionado, setProductoRelacionado] = useState(null)
  const [cantidadProveedor, setCantidadProveedor] = useState(1)
  const [cantidadMia, setCantidadMia] = useState(1)
  
  // Estado para producto Alegra completo (con más info)
  const [productoAlegraInfo, setProductoAlegraInfo] = useState({})
  
  // Estado para forma farmacéutica (solo productos farmacéuticos)
  const [formaFarmaceutica, setFormaFarmaceutica] = useState('')
  const [esFarmaceutico, setEsFarmaceutico] = useState(false)
  
  // Estado para CABYS editable
  const [codigoCabys, setCodigoCabys] = useState('')

  useEffect(() => {
    if (facturaId) {
      loadFactura()
    }
  }, [facturaId])

  const loadFactura = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await api.get(`/productos-revision/factura/${facturaId}`)
      
      if (response.data.success) {
        setFactura(response.data.data)
        const prods = response.data.data.productos || []
        setProductos(prods)
        
        // La info de productos Alegra ya viene en la respuesta del backend
        const infoAlegra = {}
        prods.forEach(prod => {
          if (prod.alegraProductInfo) {
            infoAlegra[prod.id] = {
              ...prod.alegraProductInfo,
              factorConversion: prod.mapeo?.factorConversion || 1
            }
          }
        })
        setProductoAlegraInfo(infoAlegra)
      }
    } catch (err) {
      setError(err.message || 'Error cargando factura')
      console.error('Error completo:', err)
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
        
        // Abrir modal de conversión
        setProductoRelacionado({
          ...productoSeleccionado,
          alegraProducto: alegraProducto,
          mapeoId: response.data.mapeo.id
        })
        setCantidadProveedor(1)
        setCantidadMia(1)
        setModalConversion(true)
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
    
    // Inicializar CABYS editable
    const cabysInicial = producto.codigoCabys || ''
    setCodigoCabys(cabysInicial)
    
    // Detectar automáticamente si es farmacéutico y su forma
    const deteccion = detectarFormaFarmaceutica(cabysInicial, producto.descripcion)
    setEsFarmaceutico(deteccion.esFarmaceutico)
    setFormaFarmaceutica(deteccion.forma)
  }
  
  // Función para actualizar CABYS y re-detectar si es farmacéutico
  const handleCabysChange = (e) => {
    const nuevoCabys = e.target.value
    setCodigoCabys(nuevoCabys)
    
    // Re-detectar si es farmacéutico con el nuevo CABYS
    const deteccion = detectarFormaFarmaceutica(nuevoCabys, productoSeleccionado?.descripcion || '')
    setEsFarmaceutico(deteccion.esFarmaceutico)
    setFormaFarmaceutica(deteccion.forma)
  }

  const loadCategorias = async () => {
    try {
      const response = await api.get('/alegra/categorias')
      if (response.data.success) {
        const cats = response.data.categorias || []
        setCategorias(cats)
        
        if (cats.length === 0) {
          console.warn('⚠️ No hay categorías de productos en Alegra. El usuario deberá crearlas primero.')
        }
      }
    } catch (err) {
      console.error('Error cargando categorías:', err)
      alert('⚠️ Error cargando categorías de Alegra. Verifica tu conexión e inténtalo de nuevo.')
      setCategorias([])
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

  // Detectar si es producto farmacéutico y su forma
  const detectarFormaFarmaceutica = (codigoCabys, descripcion) => {
    // Detectar si es farmacéutico por prefijo CABYS (30-35)
    const cabysPrefix = codigoCabys?.substring(0, 2)
    const esFarma = ['30', '31', '32', '33', '34', '35'].includes(cabysPrefix)
    
    if (!esFarma) return { esFarmaceutico: false, forma: '' }
    
    // Detectar forma desde descripción
    const desc = (descripcion || '').toLowerCase()
    
    // Sólidos (02)
    if (desc.match(/tableta|capsula|comprimido|pastilla|polvo|granulo/i)) {
      return { esFarmaceutico: true, forma: '02' }
    }
    
    // Semisólidos (03)
    if (desc.match(/crema|unguento|gel|pomada|pasta/i)) {
      return { esFarmaceutico: true, forma: '03' }
    }
    
    // Gases (04)
    if (desc.match(/gas|aerosol|spray|inhalador/i)) {
      return { esFarmaceutico: true, forma: '04' }
    }
    
    // Por defecto: Líquidos (01) - alcohol, jarabe, solución, suspensión, etc.
    return { esFarmaceutico: true, forma: '01' }
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
        setFormaFarmaceutica('')
        setEsFarmaceutico(false)
        setCodigoCabys('')
        // Recargar factura
        loadFactura()
      }
    } catch (err) {
      alert('⚠️ Error: ' + err.message)
    }
  }

  const guardarFactorConversion = async () => {
    if (!productoRelacionado) return

    const cantProv = parseFloat(cantidadProveedor)
    const cantMia = parseFloat(cantidadMia)

    if (cantProv <= 0 || cantMia <= 0) {
      alert('⚠️ Las cantidades deben ser mayores a 0')
      return
    }

    // Calcular factor con máxima precisión: cantidadMia / cantidadProveedor
    // Ejemplos:
    // - Proveedor: 24, Mío: 12 → factor = 12/24 = 0.5
    // - Proveedor: 1, Mío: 100 → factor = 100/1 = 100
    // - Proveedor: 50, Mío: 1 → factor = 1/50 = 0.02
    const factor = cantMia / cantProv
    
    console.log(`🔢 Factor calculado: ${cantProv} → ${cantMia} = ${factor}`)
    console.log(`   Tipo: ${typeof factor}, Valor exacto: ${factor.toFixed(10)}`)

    // Validar que el factor sea un número válido
    if (!isFinite(factor) || isNaN(factor)) {
      alert('⚠️ Error calculando el factor. Verifica las cantidades.')
      return
    }

    try {
      const response = await api.post('/productos-revision/factor-conversion', {
        mapeoId: productoRelacionado.mapeoId,
        factorConversion: factor
      })

      console.log('✅ Factor guardado en servidor:', response.data)
      
      // Determinar si el factor se aplicará o no
      const seAplicara = factor >= 1
      const mensajeAplicacion = seAplicara
        ? `✅ Se aplicará: Si proveedor factura ${cantProv * 2}, tú verás ${(cantProv * 2 * factor).toFixed(0)}`
        : `ℹ️ No se aplicará multiplicación: Solo es referencia de empaque (${cantProv} del proveedor = ${cantMia} caja tuya)\n   Si proveedor factura ${cantProv * 2}, tú verás ${cantProv * 2} (sin cambio)`
      
      alert(
        `✅ Factor guardado correctamente\n\n` +
        `Configuración:\n` +
        `• Proveedor factura: ${cantProv}\n` +
        `• Tu sistema registra: ${cantMia}\n` +
        `• Factor calculado: ${factor.toFixed(6)}\n\n` +
        mensajeAplicacion
      )
      
      setModalConversion(false)
      setProductoRelacionado(null)
      loadFactura()
    } catch (err) {
      console.error('❌ Error guardando factor:', err)
      alert('Error guardando factor: ' + err.message)
    }
  }

  const omitirConversion = () => {
    setModalConversion(false)
    setProductoRelacionado(null)
    loadFactura()
  }

  // Cambiar relación de un producto ya relacionado
  const cambiarRelacion = async (producto) => {
    const confirmar = window.confirm(`¿Cambiar la relación del producto "${producto.descripcion}"?\n\nEsto eliminará la relación actual y podrás seleccionar un nuevo producto de Alegra.`)
    if (!confirmar) return

    try {
      // Eliminar relación actual
      await api.delete(`/productos-revision/relacion/${producto.id}`)
      
      // Actualizar estado local
      setProductos(prev => prev.map(p => 
        p.id === producto.id 
          ? { ...p, estadoRelacionado: 'PENDIENTE', alegraItemId: null, mapeoId: null }
          : p
      ))
      
      // Abrir modal para nueva relación
      abrirModalBusqueda(producto)
    } catch (err) {
      alert('Error eliminando relación: ' + err.message)
    }
  }

  // Editar factor de conversión de un producto relacionado
  const editarFactor = async (producto) => {
    if (!producto.alegraItemId) return

    try {
      // Obtener mapeo actual
      const response = await api.get(`/productos-revision/mapeo/${producto.id}`)
      if (response.data.success) {
        const mapeo = response.data.mapeo
        const alegraInfo = productoAlegraInfo[producto.id]

        setProductoRelacionado({
          ...producto,
          alegraProducto: alegraInfo || { name: 'Producto Alegra', reference: producto.alegraItemId },
          mapeoId: mapeo.id
        })

        // Configurar valores actuales del factor
        if (mapeo.factorConversion && mapeo.factorConversion !== 1) {
          // Si existe factor, calcular cantidades originales
          // factor = cantMia / cantProv
          // Si factor = 0.5, significa 1 del proveedor = 0.5 mío
          setCantidadProveedor(1)
          setCantidadMia(mapeo.factorConversion)
        } else {
          setCantidadProveedor(1)
          setCantidadMia(1)
        }

        setModalConversion(true)
      }
    } catch (err) {
      alert('Error cargando información de mapeo: ' + err.message)
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
                  <span className="flex items-center">
                    Código: 
                    <span className={producto.codigoProveedor?.startsWith('DESC-') ? 'text-orange-600 font-mono ml-1' : 'ml-1'}>
                      {producto.codigoProveedor}
                    </span>
                    {producto.codigoProveedor?.startsWith('DESC-') && (
                      <span className="ml-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded" title="Código generado automáticamente porque el proveedor no envía código interno">
                        Auto-generado
                      </span>
                    )}
                  </span>
                  <span>Cantidad: {producto.cantidad} {producto.unidadMedida}</span>
                  <span className="font-semibold">Precio: ₡{producto.precioUnitario?.toLocaleString('es-CR')}</span>
                </div>
                
                {/* Info del producto relacionado */}
                {producto.estadoRelacionado === 'RELACIONADO' && productoAlegraInfo[producto.id] && (
                  <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center text-green-700 font-semibold mb-1">
                          <Check size={16} className="mr-1" />
                          Relacionado con:
                        </div>
                        <p className="font-semibold text-gray-900">{productoAlegraInfo[producto.id].name}</p>
                        <div className="flex flex-wrap gap-3 text-sm text-gray-600 mt-1">
                          <span>Ref: {productoAlegraInfo[producto.id].reference || 'N/A'}</span>
                          <span className="font-semibold text-green-700">
                            Precio Venta: ₡{productoAlegraInfo[producto.id].price?.toLocaleString('es-CR')}
                          </span>
                          {productoAlegraInfo[producto.id].factorConversion && productoAlegraInfo[producto.id].factorConversion !== 1 && (
                            <span className="text-blue-600 font-medium">
                              Factor: {productoAlegraInfo[producto.id].factorConversion}x
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {producto.estadoRelacionado === 'RELACIONADO' && !productoAlegraInfo[producto.id] && (
                  <div className="mt-2 text-sm text-green-700 flex items-center">
                    <Check size={16} className="mr-1" />
                    Relacionado (cargando información...)
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 ml-4">
                {producto.estadoRelacionado === 'PENDIENTE' && (
                  <>
                    <button
                      onClick={() => abrirModalBusqueda(producto)}
                      className="btn btn-primary flex items-center whitespace-nowrap"
                    >
                      <Link2 size={16} className="mr-1" />
                      Relacionar
                    </button>
                  </>
                )}
                {producto.estadoRelacionado === 'RELACIONADO' && (
                  <>
                    <button
                      onClick={() => cambiarRelacion(producto)}
                      className="btn btn-sm btn-outline flex items-center whitespace-nowrap text-orange-600 border-orange-300 hover:bg-orange-50"
                      title="Cambiar relación"
                    >
                      <Link2 size={14} className="mr-1" />
                      Cambiar
                    </button>
                    <button
                      onClick={() => editarFactor(producto)}
                      className="btn btn-sm btn-outline flex items-center whitespace-nowrap text-blue-600 border-blue-300 hover:bg-blue-50"
                      title="Editar factor de conversión"
                    >
                      ⚙️ Factor
                    </button>
                  </>
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
                <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                  <p className="text-xs font-medium text-orange-700 mb-2">PRODUCTO DEL PROVEEDOR</p>
                  <p className="font-bold text-gray-900 text-lg mb-2">{productoSeleccionado?.descripcion}</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-orange-600">Código:</span>
                      <p className="font-mono font-semibold text-gray-900">
                        {productoSeleccionado?.codigoProveedor}
                        {productoSeleccionado?.codigoProveedor?.startsWith('DESC-') && (
                          <span className="block text-xs text-orange-600 mt-1">⚠️ Auto-generado</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-orange-600">Cantidad:</span>
                      <p className="font-semibold text-gray-900">{productoSeleccionado?.cantidad} {productoSeleccionado?.unidadMedida}</p>
                    </div>
                    <div>
                      <span className="text-orange-600">Precio Proveedor:</span>
                      <p className="font-bold text-orange-700 text-lg">₡{productoSeleccionado?.precioUnitario?.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                  {productoSeleccionado?.codigoProveedor?.startsWith('DESC-') && (
                    <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs">
                      <p className="text-yellow-800 flex items-start">
                        <AlertCircle size={14} className="mr-2 flex-shrink-0 mt-0.5" />
                        <span>
                          <strong>Nota:</strong> Este proveedor no envía códigos internos en sus facturas, por lo que el sistema generó un código basado en la descripción. 
                          Cada descripción única tendrá su propio código generado.
                        </span>
                      </p>
                    </div>
                  )}
                </div>
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
                      className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-all"
                      onClick={() => relacionarProducto(prod)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 mb-2">{prod.name}</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-gray-500">Referencia:</span>
                              <span className="ml-1 font-mono font-medium text-gray-900">
                                {prod.reference || 'Sin ref.'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Precio Venta:</span>
                              <span className="ml-1 font-bold text-green-700">
                                ₡{prod.price?.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            {prod.cost && (
                              <div>
                                <span className="text-gray-500">Costo:</span>
                                <span className="ml-1 font-medium text-gray-700">
                                  ₡{prod.cost?.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            )}
                            {prod.category && (
                              <div>
                                <span className="text-gray-500">Categoría:</span>
                                <span className="ml-1 font-medium text-gray-700">
                                  {prod.category}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <button className="btn btn-sm btn-primary ml-4 flex-shrink-0">
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
                    {categorias.length === 0 ? (
                      <>
                        <select name="categoria" className="input border-red-300" disabled>
                          <option value="">Sin categorías disponibles</option>
                        </select>
                        <p className="text-xs text-red-600 mt-1 flex items-center">
                          <AlertCircle size={12} className="mr-1" />
                          No hay categorías. Ve a Alegra → Configuración → Categorías de Productos para crear una.
                        </p>
                      </>
                    ) : (
                      <>
                        <select name="categoria" className="input" required>
                          <option value="">Selecciona una categoría</option>
                          {categorias.map(cat => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name} {cat.description && `- ${cat.description}`}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Categoría del producto en Alegra</p>
                      </>
                    )}
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

                  {/* Código CABYS - Editable */}
                  <div className="bg-gradient-to-r from-purple-50 to-purple-100 border-2 border-purple-200 rounded-lg p-4">
                    <label className="label flex items-center text-purple-900">
                      <FileText className="mr-2 text-purple-600" size={18} />
                      Código CABYS *
                    </label>
                    <input
                      type="text"
                      name="codigoCabys"
                      value={codigoCabys}
                      onChange={handleCabysChange}
                      required
                      maxLength="13"
                      className="input border-purple-300 bg-white font-mono"
                      placeholder="Ej: 2413900000100"
                    />
                    <div className="mt-2 text-xs text-purple-700 space-y-1">
                      <p className="flex items-start">
                        <AlertCircle size={14} className="mr-1 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong>Código original:</strong> <span className="font-mono">{productoSeleccionado.codigoCabys}</span>
                        </span>
                      </p>
                      {esFarmaceutico && (
                        <p className="flex items-start text-yellow-700 bg-yellow-100 p-2 rounded">
                          <AlertCircle size={14} className="mr-1 mt-0.5 flex-shrink-0" />
                          <span>
                            <strong>⚠️ Producto Farmacéutico Detectado (CABYS {codigoCabys.substring(0, 2)})</strong><br/>
                            Si prefieres evitar validaciones farmacéuticas, cambia a un CABYS similar como:<br/>
                            <span className="font-mono bg-white px-2 py-1 rounded mt-1 inline-block">2413900000100</span> - Alcohol etílico sin desnaturalizar
                          </span>
                        </p>
                      )}
                      {!esFarmaceutico && codigoCabys && (
                        <p className="flex items-start text-green-700 bg-green-100 p-2 rounded">
                          <Check size={14} className="mr-1 mt-0.5 flex-shrink-0" />
                          <span>✅ Producto NO farmacéutico - No requiere validaciones especiales</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Forma Farmacéutica - Solo para productos farmacéuticos */}
                  {esFarmaceutico && (
                    <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                      <label className="label flex items-center text-yellow-800">
                        <AlertCircle className="mr-2 text-yellow-600" size={18} />
                        Forma Farmacéutica * (Producto Médico/Químico)
                      </label>
                      <select 
                        name="formaFarmaceutica" 
                        className="input border-yellow-300 bg-white"
                        value={formaFarmaceutica}
                        onChange={(e) => setFormaFarmaceutica(e.target.value)}
                        required
                      >
                        <option value="">Seleccione forma farmacéutica</option>
                        <option value="01">01 - Líquidos (alcohol, jarabe, solución, suspensión)</option>
                        <option value="02">02 - Sólidos (tabletas, cápsulas, polvos)</option>
                        <option value="03">03 - Semisólidos (cremas, ungüentos, geles)</option>
                        <option value="04">04 - Gases (aerosoles, inhaladores)</option>
                        <option value="05">05 - Otros</option>
                      </select>
                      <p className="text-xs text-yellow-700 mt-2 flex items-start">
                        <AlertCircle size={14} className="mr-1 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong>Detectado automáticamente.</strong> Verifica que sea correcto antes de crear el producto.
                          {productoSeleccionado.codigoCabys && (
                            <span className="block mt-1">CABYS: <span className="font-mono">{productoSeleccionado.codigoCabys}</span></span>
                          )}
                        </span>
                      </p>
                    </div>
                  )}

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
                <button 
                  type="submit" 
                  className="btn btn-primary flex-1 flex items-center justify-center"
                  disabled={categorias.length === 0}
                >
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
              {categorias.length === 0 && (
                <p className="text-center text-sm text-red-600 mt-3">
                  ⚠️ Debes tener al menos una categoría en Alegra para crear productos
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Modal de Conversión de Cantidad */}
      {modalConversion && productoRelacionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-900">⚙️ Configurar Conversión de Cantidad</h3>
              <p className="text-xs text-gray-600 mt-1">
                Define cómo convertir las cantidades entre el proveedor y tu sistema
              </p>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {/* Info de productos */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <p className="text-xs font-medium text-orange-700 mb-1">PROVEEDOR</p>
                  <p className="font-semibold text-gray-900">{productoRelacionado.descripcion}</p>
                  <p className="text-sm text-gray-600">
                    Cantidad: {productoRelacionado.cantidad} {productoRelacionado.unidadMedida}
                  </p>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-xs font-medium text-blue-700 mb-1">TU SISTEMA (ALEGRA)</p>
                  <p className="font-semibold text-gray-900">{productoRelacionado.alegraProducto.name}</p>
                  <p className="text-sm text-gray-600">
                    Ref: {productoRelacionado.alegraProducto.reference || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Opciones de conversión */}
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-sm font-semibold text-blue-900 mb-3">
                    💡 Define la equivalencia entre las cantidades:
                  </p>
                  
                  <div className="grid grid-cols-5 gap-3 items-center">
                    {/* Cantidad Proveedor */}
                    <div className="col-span-2">
                      <label className="label text-xs">Cantidad Proveedor</label>
                      <input
                        type="number"
                        value={cantidadProveedor}
                        onChange={(e) => setCantidadProveedor(e.target.value)}
                        step="1"
                        min="1"
                        className="input"
                        placeholder="Ej: 24"
                      />
                      <p className="text-xs text-gray-600 mt-1">Unidades que factura</p>
                    </div>

                    {/* Icono = */}
                    <div className="col-span-1 text-center">
                      <span className="text-2xl text-blue-600 font-bold">=</span>
                    </div>

                    {/* Cantidad Mía */}
                    <div className="col-span-2">
                      <label className="label text-xs">Cantidad en Tu Sistema</label>
                      <input
                        type="number"
                        value={cantidadMia}
                        onChange={(e) => setCantidadMia(e.target.value)}
                        step="1"
                        min="1"
                        className="input"
                        placeholder="Ej: 12"
                      />
                      <p className="text-xs text-gray-600 mt-1">Unidades que registras</p>
                    </div>
                  </div>
                </div>

                {/* Ejemplos dinámicos */}
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <p className="font-semibold text-gray-900 mb-2">📊 Vista Previa:</p>
                  {(() => {
                    const cantProv = parseFloat(cantidadProveedor) || 1
                    const cantMia = parseFloat(cantidadMia) || 1
                    const factor = cantMia / cantProv
                    const ejemploProveedor = 10
                    const ejemploResultado = (ejemploProveedor * factor).toFixed(2)

                    return (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-700">
                          <strong>Configuración:</strong> {cantProv} del proveedor = {cantMia} en tu sistema
                        </p>
                        <p className="text-xs text-gray-600 bg-gray-100 p-2 rounded font-mono">
                          Factor: {factor.toFixed(8)}
                        </p>
                        {factor >= 1 ? (
                          <>
                            <p className="text-xs text-green-700 bg-green-50 p-2 rounded">
                              ✅ Factor se aplicará: {factor.toFixed(2)} tuyos por cada 1 del proveedor
                            </p>
                            <p className="text-sm text-blue-700 font-medium">
                              <strong>Ejemplo:</strong> Si el proveedor factura <strong>{ejemploProveedor}</strong>, 
                              en tu sistema se registrarán <strong>{ejemploResultado}</strong>
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                              ℹ️ Factor NO se aplicará (solo referencia de empaque)
                            </p>
                            <p className="text-sm text-gray-600">
                              <strong>Ejemplo:</strong> Si el proveedor factura <strong>{ejemploProveedor}</strong>, 
                              en tu sistema verás <strong>{ejemploProveedor}</strong> (sin cambio)
                            </p>
                          </>
                        )}
                        
                        {/* Casos comunes */}
                        {cantProv === 24 && cantMia === 12 && (
                          <p className="text-xs text-green-700 bg-green-50 p-2 rounded mt-2">
                            ✅ Caso común: Proveedor vende 1x24, tú vendes 1x12
                          </p>
                        )}
                        {cantProv === 100 && cantMia === 1 && (
                          <p className="text-xs text-green-700 bg-green-50 p-2 rounded mt-2">
                            ✅ Caso común: Proveedor vende 100 unidades sueltas, tú vendes 1x100
                          </p>
                        )}
                        {cantProv === 1 && cantMia === 24 && (
                          <p className="text-xs text-green-700 bg-green-50 p-2 rounded mt-2">
                            ✅ Caso común: Proveedor vende 1 caja, tú vendes 24 unidades
                          </p>
                        )}
                        {cantProv === cantMia && (
                          <p className="text-xs text-gray-600 bg-gray-100 p-2 rounded mt-2">
                            ℹ️ Sin conversión: Las cantidades son iguales (1:1)
                          </p>
                        )}
                      </div>
                    )
                  })()}
                </div>

                {/* Advertencia */}
                {parseFloat(cantidadProveedor) !== parseFloat(cantidadMia) && (
                  <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 flex items-start">
                    <AlertCircle className="text-yellow-600 mr-2 flex-shrink-0 mt-0.5" size={16} />
                    <div className="text-xs text-yellow-800">
                      <p className="font-semibold">⚠️ Importante:</p>
                      <p>Se aplicará automáticamente en futuras facturas de este proveedor.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Botones */}
            <div className="p-4 border-t bg-gray-50 flex gap-3 flex-shrink-0">
              <button
                onClick={guardarFactorConversion}
                className="btn btn-primary flex-1"
              >
                ✅ Guardar Conversión
              </button>
              <button
                onClick={omitirConversion}
                className="btn btn-outline flex-1"
              >
                ⏭️ Omitir (1:1)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

