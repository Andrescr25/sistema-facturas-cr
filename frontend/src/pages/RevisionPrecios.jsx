import { useState, useEffect } from 'react'
import { 
  DollarSign, 
  Package,
  ArrowLeft,
  AlertCircle, 
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Send,
  Loader
} from 'lucide-react'
import api from '../services/api'

export default function RevisionPrecios() {
  // Estados principales
  const [vista, setVista] = useState('lista') // 'lista' o 'revision'
  const [facturas, setFacturas] = useState([])
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)
  const [productos, setProductos] = useState([])
  const [productosAlegra, setProductosAlegra] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Estados de revisión
  const [productosAprobados, setProductosAprobados] = useState([])
  const [productosRechazados, setProductosRechazados] = useState([])
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (vista === 'lista') {
      loadFacturas()
    }
  }, [vista])

  const loadFacturas = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await api.get('/revision-precios/facturas-relacionadas')
      if (response.data.success) {
        setFacturas(response.data.facturas)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const abrirRevision = async (factura) => {
    try {
      setLoading(true)
      setFacturaSeleccionada(factura)
      setProductos(factura.productos)
      setProductosAprobados([])
      setProductosRechazados([])
      
      // Obtener datos de Alegra para comparación
      const alegraIds = factura.productos
        .map(p => p.alegraItemId)
        .filter(Boolean)
      
      if (alegraIds.length > 0) {
        const response = await api.post('/revision-precios/productos-batch', {
          alegraIds
        })
        
        if (response.data.success) {
          setProductosAlegra(response.data.productos)
        }
      }
      
      setVista('revision')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const volverALista = () => {
    setVista('lista')
    setFacturaSeleccionada(null)
    setProductos([])
    setProductosAlegra({})
    setProductosAprobados([])
    setProductosRechazados([])
  }

  const aprobarProducto = (productoId) => {
    setProductosAprobados([...productosAprobados, productoId])
    setProductosRechazados(productosRechazados.filter(id => id !== productoId))
  }

  const rechazarProducto = (productoId) => {
    setProductosRechazados([...productosRechazados, productoId])
    setProductosAprobados(productosAprobados.filter(id => id !== productoId))
  }

  const aprobarTodos = () => {
    const todosIds = productos.map(p => p.id)
    setProductosAprobados(todosIds)
    setProductosRechazados([])
  }

  const enviarAlegra = async () => {
    if (!facturaSeleccionada) return

    const confirmacion = window.confirm(
      `¿Estás seguro de enviar la factura ${facturaSeleccionada.numeroConsecutivo} a Alegra?\n\n` +
      `Esto realizará:\n` +
      `✅ Actualizar costos de ${productosAprobados.length} productos\n` +
      `📄 Crear factura de proveedor en Alegra\n` +
      `🔄 Marcar factura como ENVIADA`
    )

    if (!confirmacion) return

    try {
      setEnviando(true)
      const response = await api.post('/revision-precios/enviar-alegra', {
        facturaId: facturaSeleccionada.id,
        productosAprobados: productosAprobados
      })

      if (response.data.success) {
        alert(
          `✅ Factura enviada exitosamente!\n\n` +
          `ID en Alegra: ${response.data.resultado.alegraFacturaId}\n` +
          `Costos actualizados: ${response.data.resultado.costosActualizados}/${response.data.resultado.totalProductos}`
        )
        volverALista()
      }
    } catch (err) {
      alert('❌ Error enviando a Alegra: ' + err.message)
    } finally {
      setEnviando(false)
    }
  }

  // Cálculos de análisis de producto
  const analizarProducto = (producto) => {
    const alegraData = productosAlegra[producto.alegraItemId] || {}
    
    // Costo anterior (de Alegra)
    const costoAnterior = alegraData.cost || 0
    
    // Costo nuevo (de factura con IVA)
    const impuestoPorcentaje = producto.impuesto > 0 
      ? (producto.impuesto / producto.subtotal) * 100 
      : 13
    const costoNuevo = producto.precioUnitario * (1 + impuestoPorcentaje / 100)
    
    // Precio de venta actual
    const precioVenta = alegraData.price || 0
    
    // Margen: (precioVenta - costoNuevo) / precioVenta * 100
    const margen = precioVenta > 0 
      ? ((precioVenta - costoNuevo) / precioVenta) * 100 
      : 0
    
    // Cambio de costo
    const cambioCosto = costoAnterior > 0 
      ? ((costoNuevo - costoAnterior) / costoAnterior) * 100 
      : 0
    
    // Alertas
    const alertas = []
    if (cambioCosto > 30) {
      alertas.push({
        tipo: 'warning',
        mensaje: `Costo subió ${Math.round(cambioCosto)}%`
      })
    }
    if (margen < 20 && margen > 0) {
      alertas.push({
        tipo: 'danger',
        mensaje: `Margen bajo: ${Math.round(margen)}%`
      })
    }
    
    return {
      costoAnterior,
      costoNuevo,
      precioVenta,
      margen,
      cambioCosto,
      alertas,
      nombre: alegraData.name || producto.descripcion
    }
  }

  // VISTA DE LISTA
  if (vista === 'lista') {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <DollarSign className="mr-3" size={32} />
            Revisión de Precios
          </h1>
          <p className="text-gray-600 mt-1">
            Analiza costos y márgenes antes de enviar facturas a Alegra
          </p>
        </div>

        {error && (
          <div className="card bg-red-50 border-red-200 mb-6">
            <div className="flex items-center text-red-800">
              <AlertCircle className="mr-2" size={20} />
              {error}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="spinner mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando facturas...</p>
          </div>
        ) : facturas.length === 0 ? (
          <div className="card text-center py-12">
            <Package className="mx-auto text-gray-400 mb-4" size={48} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No hay facturas para revisar
            </h3>
            <p className="text-gray-600">
              Las facturas aparecerán aquí cuando estén 100% relacionadas
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {facturas.map(factura => {
              const total = factura.productos.length
              const totalFactura = factura.totalFactura || 0

              return (
                <div 
                  key={factura.id}
                  className="card hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => abrirRevision(factura)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Factura #{factura.numeroConsecutivo}
                        </h3>
                        <span className="badge badge-success">100% Relacionada</span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Proveedor</p>
                          <p className="font-medium text-gray-900">{factura.proveedorNombre}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Fecha</p>
                          <p className="font-medium text-gray-900">
                            {new Date(factura.fechaEmision).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Total</p>
                          <p className="font-medium text-green-600">
                            ₡{totalFactura.toLocaleString('es-CR')}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Productos</p>
                          <p className="font-medium text-gray-900">{total}</p>
                        </div>
                      </div>
                    </div>

                    <button className="btn btn-primary ml-4">
                      Revisar Precios →
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // VISTA DE REVISIÓN INDIVIDUAL
  const stats = {
    total: productos.length,
    aprobados: productosAprobados.length,
    rechazados: productosRechazados.length,
    pendientes: productos.length - productosAprobados.length - productosRechazados.length
  }

  const progreso = stats.total > 0 
    ? Math.round(((stats.aprobados + stats.rechazados) / stats.total) * 100) 
    : 0

  const todoRevisado = stats.pendientes === 0
  const hayAprobados = stats.aprobados > 0

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={volverALista}
          className="btn btn-outline flex items-center mb-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          Volver a la lista
        </button>

        <h1 className="text-3xl font-bold text-gray-900">
          Factura #{facturaSeleccionada?.numeroConsecutivo}
        </h1>
        <p className="text-gray-600 mt-1">
          {facturaSeleccionada?.proveedorNombre}
        </p>
      </div>

      {/* Info de factura */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600">Fecha de Emisión</p>
            <p className="text-lg font-semibold text-gray-900">
              {new Date(facturaSeleccionada.fechaEmision).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Factura</p>
            <p className="text-2xl font-bold text-blue-600">
              ₡{facturaSeleccionada.totalFactura?.toLocaleString('es-CR')}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Productos</p>
            <p className="text-lg font-semibold text-gray-900">
              {stats.total} items
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Estado</p>
            <span className="badge badge-success">Listo para enviar</span>
          </div>
        </div>
      </div>

      {/* Progreso */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Progreso de Revisión</h3>
          <span className="text-sm font-medium text-gray-600">{progreso}% completado</span>
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
            <p className="text-green-600">Aprobados</p>
            <p className="text-xl font-bold text-green-600">{stats.aprobados}</p>
          </div>
          <div>
            <p className="text-red-600">Rechazados</p>
            <p className="text-xl font-bold text-red-600">{stats.rechazados}</p>
          </div>
          <div>
            <p className="text-yellow-600">Pendientes</p>
            <p className="text-xl font-bold text-yellow-600">{stats.pendientes}</p>
          </div>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <button
            onClick={aprobarTodos}
            className="btn btn-success flex items-center"
            disabled={stats.aprobados === stats.total}
          >
            <CheckCircle size={16} className="mr-2" />
            Aprobar Todos
          </button>

          {todoRevisado && hayAprobados && (
            <button
              onClick={enviarAlegra}
              className="btn btn-primary flex items-center text-lg px-6 py-3"
              disabled={enviando}
            >
              {enviando ? (
                <>
                  <Loader size={20} className="mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send size={20} className="mr-2" />
                  Enviar a Alegra ({stats.aprobados} productos)
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Lista de productos */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="spinner mx-auto mb-4"></div>
            <p className="text-gray-600">Analizando productos...</p>
          </div>
        ) : (
          productos.map(producto => {
            const analisis = analizarProducto(producto)
            const aprobado = productosAprobados.includes(producto.id)
            const rechazado = productosRechazados.includes(producto.id)
            const pendiente = !aprobado && !rechazado

            return (
              <div
                key={producto.id}
                className={`card ${
                  aprobado ? 'border-green-500 bg-green-50' :
                  rechazado ? 'border-red-500 bg-red-50' :
                  'border-gray-200'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {analisis.nombre}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Código: {producto.codigoProveedor} | 
                      Cantidad: {producto.cantidad} {producto.unidadMedida}
                    </p>
                  </div>
                  {aprobado && (
                    <span className="badge badge-success flex items-center">
                      <CheckCircle size={14} className="mr-1" />
                      Aprobado
                    </span>
                  )}
                  {rechazado && (
                    <span className="badge badge-danger flex items-center">
                      <XCircle size={14} className="mr-1" />
                      Rechazado
                    </span>
                  )}
                </div>

                {/* Alertas */}
                {analisis.alertas.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {analisis.alertas.map((alerta, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center text-sm px-3 py-2 rounded-lg ${
                          alerta.tipo === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}
                      >
                        <AlertCircle size={16} className="mr-2" />
                        {alerta.mensaje}
                      </div>
                    ))}
                  </div>
                )}

                {/* Tabla de comparación */}
                <div className="overflow-x-auto mb-4">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100 border-b-2 border-gray-300">
                        <th className="text-left p-3 text-sm font-semibold">Concepto</th>
                        <th className="text-right p-3 text-sm font-semibold">Anterior</th>
                        <th className="text-right p-3 text-sm font-semibold">Nuevo</th>
                        <th className="text-center p-3 text-sm font-semibold">Cambio</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="p-3 text-sm font-medium">Costo (con IVA)</td>
                        <td className="p-3 text-right text-red-600 font-semibold">
                          ₡{analisis.costoAnterior.toLocaleString('es-CR', {minimumFractionDigits: 2})}
                        </td>
                        <td className="p-3 text-right text-red-600 font-bold text-lg">
                          ₡{analisis.costoNuevo.toLocaleString('es-CR', {minimumFractionDigits: 2})}
                        </td>
                        <td className="p-3 text-center">
                          {analisis.cambioCosto !== 0 && (
                            <span className={`inline-flex items-center text-sm font-semibold ${
                              analisis.cambioCosto > 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {analisis.cambioCosto > 0 ? (
                                <TrendingUp size={16} className="mr-1" />
                              ) : (
                                <TrendingDown size={16} className="mr-1" />
                              )}
                              {Math.abs(analisis.cambioCosto).toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-3 text-sm font-medium">Precio Venta</td>
                        <td colSpan="2" className="p-3 text-right text-green-600 font-bold text-lg">
                          ₡{analisis.precioVenta.toLocaleString('es-CR', {minimumFractionDigits: 2})}
                        </td>
                        <td className="p-3 text-center text-gray-500 text-sm">Actual</td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="p-3 text-sm font-bold">Margen</td>
                        <td colSpan="2" className="p-3 text-right"></td>
                        <td className="p-3 text-center">
                          <span className={`inline-block text-xl font-bold px-3 py-1 rounded-lg ${
                            analisis.margen < 15 ? 'bg-red-100 text-red-700' :
                            analisis.margen < 25 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {analisis.margen.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Botones de acción */}
                {pendiente && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => aprobarProducto(producto.id)}
                      className="btn btn-success flex-1 flex items-center justify-center"
                    >
                      <CheckCircle size={16} className="mr-2" />
                      Aprobar
                    </button>
                    <button
                      onClick={() => rechazarProducto(producto.id)}
                      className="btn btn-danger flex-1 flex items-center justify-center"
                    >
                      <XCircle size={16} className="mr-2" />
                      Rechazar
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Mensaje final */}
      {todoRevisado && !hayAprobados && (
        <div className="card bg-yellow-50 border-yellow-200 mt-6 text-center">
          <AlertCircle className="mx-auto text-yellow-600 mb-3" size={48} />
          <h3 className="text-lg font-semibold text-yellow-900 mb-2">
            No hay productos aprobados
          </h3>
          <p className="text-yellow-800">
            Debes aprobar al menos un producto para enviar la factura a Alegra
          </p>
        </div>
      )}
    </div>
  )
}
