import { useState, useEffect } from 'react'
import { 
  DollarSign, 
  Package, 
  ArrowLeft,
  AlertCircle, 
  TrendingUp,
  TrendingDown,
  Send,
  Loader,
  Edit3,
  Calculator
} from 'lucide-react'
import api from '../services/api'

export default function RevisionPrecios() {
  // Estados principales
  const [vista, setVista] = useState('lista')
  const [facturas, setFacturas] = useState([])
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)
  const [productos, setProductos] = useState([])
  const [productosAlegra, setProductosAlegra] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Precios ajustados por el usuario
  const [preciosAjustados, setPreciosAjustados] = useState({})
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
      setPreciosAjustados({})
      
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
    setPreciosAjustados({})
  }

  const ajustarPrecio = (productoId, nuevoPrecio) => {
    setPreciosAjustados({
      ...preciosAjustados,
      [productoId]: parseFloat(nuevoPrecio) || 0
    })
  }

  const enviarAlegra = async () => {
    if (!facturaSeleccionada) return

    // Contar cuántos precios se van a actualizar
    const preciosQueActualizar = Object.keys(preciosAjustados).filter(
      id => preciosAjustados[id] > 0
    ).length

    const confirmacion = window.confirm(
      `¿Enviar factura ${facturaSeleccionada.numeroConsecutivo} a Alegra?\n\n` +
      `Se realizará:\n` +
      `✅ Actualizar ${productos.length} costos\n` +
      `💰 Actualizar ${preciosQueActualizar} precios de venta\n` +
      `📄 Crear factura de proveedor\n` +
      `🔄 Marcar como ENVIADA`
    )

    if (!confirmacion) return

    try {
      setEnviando(true)
      const response = await api.post('/revision-precios/enviar-alegra', {
        facturaId: facturaSeleccionada.id,
        preciosAjustados: preciosAjustados
      })

      if (response.data.success) {
        const resultado = response.data.resultado
        alert(
          `✅ Factura enviada exitosamente!\n\n` +
          `📄 ID Alegra: ${resultado.alegraFacturaId || 'N/A'}\n` +
          `💰 Costos actualizados: ${resultado.costosActualizados}/${resultado.totalProductos}\n` +
          `🔄 Precios actualizados: ${resultado.preciosActualizados || 0}`
        )
        volverALista()
      }
    } catch (err) {
      alert('❌ Error: ' + err.message)
    } finally {
      setEnviando(false)
    }
  }

  // Análisis de producto
  const analizarProducto = (producto) => {
    const alegraData = productosAlegra[producto.alegraItemId] || {}
    
    // Costo Anterior: último costo en Alegra (antes de esta factura)
    const costoAnterior = alegraData.cost || 0
    
    // Costo Nuevo: precio de la factura actual del proveedor (con IVA incluido)
    // producto.precioUnitario ya es el costo con IVA de la factura
    const costoNuevo = producto.precioUnitario || 0
    
    // Precio de venta: usar ajustado si existe, sino el de Alegra
    const precioVentaActual = alegraData.price || 0
    const precioVentaAjustado = preciosAjustados[producto.id] || precioVentaActual
    
    // Margen con precio actual: (precioVenta - costo) / precioVenta * 100
    const margenActual = precioVentaActual > 0 
      ? ((precioVentaActual - costoNuevo) / precioVentaActual) * 100 
      : 0
    
    // Margen con precio ajustado
    const margenNuevo = precioVentaAjustado > 0 
      ? ((precioVentaAjustado - costoNuevo) / precioVentaAjustado) * 100 
      : 0
    
    // Cambio de costo: cuánto aumentó/disminuyó respecto al anterior
    const cambioCosto = costoAnterior > 0 
      ? ((costoNuevo - costoAnterior) / costoAnterior) * 100 
      : 0
    
    // Precio sugerido (margen 25%)
    const precioSugerido = costoNuevo > 0 ? costoNuevo / 0.75 : 0
    
    const alertas = []
    if (cambioCosto > 30) {
      alertas.push({
        tipo: 'warning',
        mensaje: `⚠️ Costo aumentó ${Math.round(cambioCosto)}%`
      })
    }
    if (margenNuevo < 20 && margenNuevo > 0) {
      alertas.push({
        tipo: 'danger',
        mensaje: `🔴 Margen bajo: ${Math.round(margenNuevo)}% (sugerido: ₡${Math.round(precioSugerido)})`
      })
    }
    
    return {
      costoAnterior,
      costoNuevo,
      precioVentaActual,
      precioVentaAjustado,
      margenActual,
      margenNuevo,
      cambioCosto,
      precioSugerido,
      alertas,
      nombre: alegraData.name || producto.descripcion,
      precioModificado: preciosAjustados[producto.id] !== undefined
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
            Analiza costos, ajusta precios y envía facturas a Alegra
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
            {facturas.map(factura => (
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
                          ₡{factura.totalFactura?.toLocaleString('es-CR')}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Productos</p>
                        <p className="font-medium text-gray-900">{factura.productos.length}</p>
                      </div>
                    </div>
                  </div>

                  <button className="btn btn-primary ml-4">
                    Revisar →
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
        )}
                    </div>
    )
  }

  // VISTA DE REVISIÓN
  const preciosModificados = Object.keys(preciosAjustados).filter(
    id => preciosAjustados[id] > 0
  ).length

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
          {facturaSeleccionada?.proveedorNombre} • {new Date(facturaSeleccionada?.fechaEmision).toLocaleDateString()}
        </p>
      </div>

      {/* Info */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-gray-600 mb-1">Total Factura</p>
          <p className="text-2xl font-bold text-blue-600">
            ₡{facturaSeleccionada?.totalFactura?.toLocaleString('es-CR')}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 mb-1">Productos</p>
          <p className="text-2xl font-bold text-gray-900">{productos.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 mb-1">Precios Ajustados</p>
          <p className="text-2xl font-bold text-orange-600">{preciosModificados}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 mb-1">Estado</p>
          <span className="badge badge-success text-sm">Listo</span>
                  </div>
                </div>

      {loading && (
        <div className="card text-center py-8 mb-6">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600">Analizando productos...</p>
        </div>
      )}

      {/* Productos */}
      <div className="space-y-4 mb-6">
        {productos.map(producto => {
          const analisis = analizarProducto(producto)

          return (
            <div
              key={producto.id}
              className={`card ${
                analisis.precioModificado ? 'border-orange-500 bg-orange-50' : ''
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {analisis.nombre}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Código: {producto.codigoProveedor} • 
                    Cantidad: {producto.cantidad} {producto.unidadMedida}
                  </p>
                </div>
                {analisis.precioModificado && (
                  <span className="badge badge-warning flex items-center">
                    <Edit3 size={14} className="mr-1" />
                    Precio ajustado
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

              {/* Tabla */}
              <div className="overflow-x-auto mb-4">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b-2 border-gray-300">
                      <th className="text-left p-3 text-sm font-semibold">Concepto</th>
                      <th className="text-right p-3 text-sm font-semibold">Anterior</th>
                      <th className="text-right p-3 text-sm font-semibold">Actual/Nuevo</th>
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
                    <tr className="border-b bg-green-50">
                      <td className="p-3 text-sm font-medium">Precio Venta Actual</td>
                      <td colSpan="2" className="p-3 text-right text-green-700 font-bold text-lg">
                        ₡{analisis.precioVentaActual.toLocaleString('es-CR', {minimumFractionDigits: 2})}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-3 py-1 rounded-lg font-bold ${
                          analisis.margenActual < 15 ? 'bg-red-100 text-red-700' :
                          analisis.margenActual < 25 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {analisis.margenActual.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                    <tr className="bg-orange-50 border-b-2 border-orange-200">
                      <td className="p-3 text-sm font-bold">
                        <div className="flex items-center">
                          <Calculator size={16} className="mr-2 text-orange-600" />
                          Ajustar Precio Venta
                        </div>
                      </td>
                      <td colSpan="2" className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-semibold">
                              ₡
                            </span>
                            <input
                              type="number"
                              value={preciosAjustados[producto.id] || analisis.precioVentaActual}
                              onChange={(e) => ajustarPrecio(producto.id, e.target.value)}
                              step="100"
                              min="0"
                              className="input pl-8 text-right font-bold text-lg"
                              placeholder="Nuevo precio"
                            />
                          </div>
                          {analisis.margenNuevo < 25 && (
                            <button
                              onClick={() => ajustarPrecio(producto.id, analisis.precioSugerido)}
                              className="btn btn-outline text-sm whitespace-nowrap"
                            >
                              Sugerido: ₡{analisis.precioSugerido.toFixed(0)}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {analisis.precioModificado ? (
                          <span className={`inline-block px-3 py-1 rounded-lg font-bold text-lg ${
                            analisis.margenNuevo < 15 ? 'bg-red-100 text-red-700' :
                            analisis.margenNuevo < 25 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {analisis.margenNuevo.toFixed(1)}% ⭐
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">Sin cambios</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
          </div>

      {/* Botón Enviar */}
      <div className="card bg-gradient-to-r from-blue-50 to-green-50 border-2 border-blue-300">
        <div className="flex items-center justify-between">
                    <div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              ¿Listo para enviar a Alegra?
                      </h3>
                      <p className="text-sm text-gray-600">
              Se actualizarán {productos.length} costos{preciosModificados > 0 && `, ${preciosModificados} precios`} y se creará la factura de proveedor
                      </p>
                    </div>
          <button
            onClick={enviarAlegra}
            className="btn btn-primary text-lg px-8 py-4 flex items-center"
            disabled={enviando}
          >
            {enviando ? (
              <>
                <Loader size={24} className="mr-3 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send size={24} className="mr-3" />
                Enviar a Alegra
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
