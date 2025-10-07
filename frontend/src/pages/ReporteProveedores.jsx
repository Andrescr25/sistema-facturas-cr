import { useState, useEffect } from 'react'
import { Users, Package, ShoppingCart, AlertCircle, RefreshCw, FileText, Edit3, Download, Trash2, Brain } from 'lucide-react'
import { alegraService } from '../services/alegraService'

export default function ReporteProveedores() {
  const [proveedores, setProveedores] = useState([])
  const [resumen, setResumen] = useState(null)
  const [encargosEspeciales, setEncargosEspeciales] = useState([]) // ✅ AGREGADO
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('faltantes') // 'faltantes' | 'modificar' | 'cantidad-sugerida'
  const [cantidadesModificadas, setCantidadesModificadas] = useState(new Map())
  const [cantidadesGuardadas, setCantidadesGuardadas] = useState(new Map())
  const [cantidadSugerida, setCantidadSugerida] = useState([]) // Datos de cantidad sugerida
  const [resumenSugerida, setResumenSugerida] = useState(null) // Resumen de cantidad sugerida
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState('') // Proveedor seleccionado para filtro

  useEffect(() => {
    loadReporte()
    if (activeTab === 'modificar') {
      loadCantidadesGuardadas()
    } else if (activeTab === 'cantidad-sugerida' && proveedorSeleccionado && proveedorSeleccionado !== '') {
      loadCantidadSugerida(proveedorSeleccionado)
    }
  }, [activeTab, proveedorSeleccionado])

  const loadReporte = async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await alegraService.getReporteFaltantesProveedor()

      if (result.success) {
        setProveedores(result.data)
        setResumen(result.resumen)

        // ✅ AGREGADO: Cargar encargos especiales
        loadEncargosEspeciales()
      } else {
        setError(result.message || 'Error cargando reporte')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ✅ AGREGADO: Función para cargar encargos especiales
  const loadEncargosEspeciales = async () => {
    try {
      const result = await alegraService.getEncargosEspeciales()


      if (result.success) {
        setEncargosEspeciales(result.data)
      }
    } catch (err) {
      console.warn('Error cargando encargos especiales:', err)
    }
  }

  const loadCantidadesGuardadas = async () => {
    try {
      const result = await alegraService.getCantidadesModificadas()

      if (result.success) {
        const cantidadesMap = new Map()
        result.data.forEach(item => {
          const key = `${item.proveedor_nombre}-${item.producto_codigo}`
          cantidadesMap.set(key, {
            cantidad_original: item.cantidad_original,
            cantidad_modificada: item.cantidad_modificada
          })
        })
        setCantidadesGuardadas(cantidadesMap)
      }
    } catch (err) {
      console.warn('Error cargando cantidades guardadas:', err)
    }
  }

  const loadCantidadSugerida = async (proveedor_id) => {
    if (!proveedor_id) {
      setCantidadSugerida([])
      setResumenSugerida(null)
      return
    }

    try {
      setLoading(true)
      setError(null)

      console.log('🧠 Frontend: Cargando cantidad sugerida para proveedor:', proveedor_id)
      const result = await alegraService.getCantidadSugerida(proveedor_id)

      if (result.success) {
        setCantidadSugerida(result.data)
        setResumenSugerida(result.resumen)
        console.log('✅ Frontend: Cantidad sugerida cargada:', result.data.length, 'productos')
      } else {
        setError(result.message || 'Error cargando cantidad sugerida')
        setCantidadSugerida([])
        setResumenSugerida(null)
      }
    } catch (err) {
      console.error('❌ Frontend: Error cargando cantidad sugerida:', err)
      setError(err.message)
      setCantidadSugerida([])
      setResumenSugerida(null)
    } finally {
      setLoading(false)
    }
  }

  const handleCantidadChange = (proveedorNombre, productoCodigo, nuevaCantidad) => {
    const key = `${proveedorNombre}-${productoCodigo}`
    const cantidadNum = parseInt(nuevaCantidad) || 0

    const nuevasCantidades = new Map(cantidadesModificadas)
    nuevasCantidades.set(key, cantidadNum)
    setCantidadesModificadas(nuevasCantidades)
  }

  const handleGuardarCantidades = async () => {
    if (cantidadesModificadas.size === 0) {
      alert('ℹ️ No hay cantidades modificadas para guardar.')
      return
    }

    try {
      setLoading(true)

      // Preparar datos para enviar
      const cantidadesParaGuardar = []

      proveedores.forEach(proveedor => {
        proveedor.productos_faltantes.forEach(producto => {
          const key = `${proveedor.nombre}-${producto.codigo}`
          const cantidadModificada = cantidadesModificadas.get(key)

          if (cantidadModificada !== undefined) {
            cantidadesParaGuardar.push({
              proveedor_nombre: proveedor.nombre,
              producto_codigo: producto.codigo,
              producto_nombre: producto.nombre,
              cantidad_original: producto.cantidad_faltante,
              cantidad_modificada: cantidadModificada
            })
          }
        })
      })

      const result = await alegraService.guardarCantidadesModificadas(cantidadesParaGuardar)

      if (result.success) {
        // Actualizar cantidades guardadas
        await loadCantidadesGuardadas()
        // Limpiar cantidades temporales
        setCantidadesModificadas(new Map())

        alert(`✅ Cantidades guardadas correctamente\n\n• ${result.cantidades_guardadas} productos actualizados`)
      } else {
        alert(`❌ Error guardando cantidades: ${result.message}`)
      }

    } catch (error) {
      alert(`❌ Error guardando cantidades: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleLimpiarCantidadesGuardadas = async () => {
    if (cantidadesGuardadas.size === 0) {
      alert('ℹ️ No hay cantidades guardadas para limpiar.')
      return
    }

    const resumen = `🗑️ Limpiar cantidades modificadas:

- Se eliminarán ${cantidadesGuardadas.size} productos con cantidades modificadas
- Las cantidades volverán a los valores originales de faltantes
- Esta acción es irreversible

¿Continuar?`

    if (!window.confirm(resumen)) {
      return
    }

    try {
      setLoading(true)

      const response = await fetch('/api/alegra/orden-compra/cantidades', {
        method: 'DELETE'
      })

      const result = await alegraService.limpiarCantidadesModificadas()

      if (result.success) {
        setCantidadesGuardadas(new Map())
        setCantidadesModificadas(new Map())

        alert(`✅ Cantidades limpiadas correctamente\n\n• ${result.registros_eliminados} registros eliminados`)
      } else {
        alert(`❌ Error limpiando cantidades: ${result.message}`)
      }

    } catch (error) {
      alert(`❌ Error limpiando cantidades: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerarPDF = async (proveedor) => {
    try {
      setLoading(true)

      // Preparar datos del proveedor con cantidades finales
      const productosParaPDF = proveedor.productos_faltantes.map(producto => {
        const key = `${proveedor.nombre}-${producto.codigo}`
        const cantidadModificada = cantidadesModificadas.get(key)
        const cantidadGuardada = cantidadesGuardadas.get(key)

        // Prioridad: modificada > guardada > original
        const cantidadFinal = cantidadModificada !== undefined ?
          cantidadModificada :
          (cantidadGuardada ? cantidadGuardada.cantidad_modificada : producto.cantidad_faltante)

        return {
          codigo: producto.codigo,
          nombre: producto.nombre,
          cantidad: cantidadFinal
        }
      })

      // ✅ OBTENER BLOB DIRECTAMENTE
      const blob = await alegraService.generarPDFOrdenCompra(proveedor.nombre, productosParaPDF)

      // ✅ CREAR URL Y DESCARGAR
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `orden-compra-${proveedor.nombre.replace(/\s+/g, '-')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      alert(`✅ PDF generado para ${proveedor.nombre}`)

    } catch (error) {
      alert(`❌ Error generando PDF: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleLimpiarVista = async () => {
    if (proveedores.length === 0) {
      alert('ℹ️ No hay datos para limpiar.')
      return
    }

    const resumenLimpieza = `🗑️ ELIMINAR DEFINITIVAMENTE de la base de datos LOCAL:

- ${proveedores.length} proveedores con faltantes
- ${resumen?.total_productos_faltantes || 0} productos faltantes  
- ${resumen?.total_cantidad_faltante || 0} unidades faltantes

⚠️ ATENCIÓN: Esta acción elimina los datos permanentemente SOLO del sistema local.
NO afecta la base de datos externa de facturas.

¿Proceder con la eliminación?`

    if (!window.confirm(resumenLimpieza)) {
      return
    }

    try {
      setLoading(true)

      const resultado = await alegraService.limpiarFaltantesProveedor()

      // Limpiar estados locales
      setProveedores([])
      setResumen(null)
      setEncargosEspeciales([]) // ✅ AGREGADO: Limpiar también encargos especiales

      alert(`✅ Datos eliminados exitosamente de la base de datos LOCAL\n\n• ${resultado.datos_borrados} registros borrados\n• Los faltantes han sido eliminados permanentemente`)

    } catch (error) {
      alert(`❌ Error eliminando datos: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const getCantidadFinal = (proveedorNombre, productoCodigo, cantidadOriginal) => {
    const key = `${proveedorNombre}-${productoCodigo}`
    const cantidadModificada = cantidadesModificadas.get(key)
    const cantidadGuardada = cantidadesGuardadas.get(key)

    // Prioridad: modificada > guardada > original
    return cantidadModificada !== undefined ?
      cantidadModificada :
      (cantidadGuardada ? cantidadGuardada.cantidad_modificada : cantidadOriginal)
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-8">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600">
            {activeTab === 'faltantes' ? 'Generando reporte de faltantes por proveedor...' : 'Cargando cantidades modificadas...'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reporte de Faltantes por Proveedor</h1>
          <p className="text-gray-600 mt-1">Lista de productos faltantes organizados por proveedor para facilitar las compras</p>
        </div>
        <div className="flex items-center space-x-2">
          {activeTab === 'modificar' && cantidadesGuardadas.size > 0 && (
            <button
              onClick={handleLimpiarCantidadesGuardadas}
              className="btn btn-outline text-red-600 border-red-600 hover:bg-red-50"
            >
              <Trash2 size={16} className="mr-2" />
              Limpiar Cantidades ({cantidadesGuardadas.size})
            </button>
          )}
          {proveedores.length > 0 && activeTab === 'faltantes' && (
            <button
              onClick={handleLimpiarVista}
              className="btn btn-outline text-red-600 border-red-600 hover:bg-red-50"
            >
              <Package size={16} className="mr-2" />
              Limpiar BD Local
            </button>
          )}
          <button
            onClick={loadReporte}
            className="btn btn-outline"
          >
            <RefreshCw size={16} className="mr-2" />
            Actualizar
          </button>
        </div>
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
            onClick={() => setActiveTab('faltantes')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'faltantes'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            <FileText className="inline mr-2" size={16} />
            Faltantes Registrados
            {resumen && (
              <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {proveedores.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('modificar')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'modificar'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            <Edit3 className="inline mr-2" size={16} />
            Modificar Cantidades
            {cantidadesGuardadas.size > 0 && (
              <span className="ml-2 bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {cantidadesGuardadas.size}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('cantidad-sugerida')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'cantidad-sugerida'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            🧠 Cantidad Sugerida
            {resumenSugerida && (
              <span className="ml-2 bg-purple-100 text-purple-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {cantidadSugerida.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Resumen */}
      {resumen && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="text-blue-600" size={24} />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Proveedores con Faltantes</p>
                <p className="text-2xl font-semibold text-gray-900">{proveedores.length}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Package className="text-orange-600" size={24} />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Productos Faltantes</p>
                <p className="text-2xl font-semibold text-gray-900">{resumen.total_productos_faltantes}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <ShoppingCart className="text-red-600" size={24} />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Unidades Faltantes</p>
                <p className="text-2xl font-semibold text-gray-900">{resumen.total_cantidad_faltante}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Faltantes Registrados */}
      {activeTab === 'faltantes' && (
        <div>
          {proveedores.length === 0 ? (
            <div className="card text-center py-12">
              <Package className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay faltantes registrados</h3>
              <p className="text-gray-600">Cuando registres faltantes en las facturas, aparecerán aquí organizados por proveedor.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {proveedores.map((proveedor) => (
                <div key={proveedor.id} className="card">
                  {/* Header del proveedor */}
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
                    <div className="flex items-center">
                      <div className="p-2 bg-blue-100 rounded-lg mr-4">
                        <Users className="text-blue-600" size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900">{proveedor.nombre}</h3>
                        <p className="text-gray-600">{proveedor.contacto}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Total productos</p>
                      <p className="text-2xl font-bold text-blue-600">{proveedor.total_productos}</p>
                      <p className="text-sm text-gray-600">{proveedor.total_cantidad} unidades</p>
                    </div>
                  </div>

                  {/* Lista de productos faltantes */}
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900 flex items-center">
                      <FileText size={16} className="mr-2" />
                      Productos para comprar:
                    </h4>

                    {proveedor.productos_faltantes.map((producto, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h5 className="font-medium text-gray-900">{producto.nombre}</h5>
                            <p className="text-sm text-gray-600">Código: {producto.codigo}</p>
                            <p className="text-sm text-gray-600">
                              Clientes afectados: {producto.clientes_afectados}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${producto.tipo_faltante === 'total'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                              }`}>
                              {producto.tipo_faltante === 'total' ? 'Falta Completo' : 'Falta Parcial'}
                            </div>
                            <p className="text-lg font-bold text-gray-900 mt-1">
                              {producto.cantidad_faltante} unidades
                            </p>
                            <p className="text-xs text-gray-500">
                              En {producto.facturas_afectadas} factura{producto.facturas_afectadas > 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Modificar Cantidades */}
      {activeTab === 'modificar' && (
        <div>
          {proveedores.length === 0 ? (
            <div className="card text-center py-12">
              <Edit3 className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay productos para modificar</h3>
              <p className="text-gray-600">Primero registra algunos faltantes para poder modificar las cantidades.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header con botones de acción */}
              <div className="card bg-blue-50 border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-blue-900">
                      Modificación de Cantidades
                    </h3>
                    <p className="text-blue-700">
                      Ajusta las cantidades según necesites para la orden de compra
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    {cantidadesModificadas.size > 0 && (
                      <button
                        onClick={handleGuardarCantidades}
                        className="btn btn-primary"
                      >
                        <Package size={16} className="mr-2" />
                        Guardar Cambios ({cantidadesModificadas.size})
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {proveedores.map((proveedor) => (
                <div key={proveedor.id} className="card">
                  {/* Header del proveedor */}
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
                    <div className="flex items-center">
                      <div className="p-2 bg-green-100 rounded-lg mr-4">
                        <Users className="text-green-600" size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900">{proveedor.nombre}</h3>
                        <p className="text-gray-600">Orden de Compra</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleGenerarPDF(proveedor)}
                      className="btn bg-green-600 text-white border-green-600 hover:bg-green-700"
                    >
                      <Download size={16} className="mr-2" />
                      Generar PDF
                    </button>
                  </div>

                  {/* Lista de productos editables */}
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900 flex items-center">
                      <Edit3 size={16} className="mr-2" />
                      Productos para ordenar:
                    </h4>

                    {proveedor.productos_faltantes.map((producto, index) => {
                      const cantidadFinal = getCantidadFinal(proveedor.nombre, producto.codigo, producto.cantidad_faltante)
                      const key = `${proveedor.nombre}-${producto.codigo}`
                      const tieneModificacion = cantidadesModificadas.has(key) || cantidadesGuardadas.has(key)

                      return (
                        <div key={index} className={`rounded-lg p-4 border ${tieneModificacion ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                            {/* Info del producto */}
                            <div className="lg:col-span-6">
                              <h5 className="font-medium text-gray-900">{producto.nombre}</h5>
                              <p className="text-sm text-gray-600">Código: {producto.codigo}</p>
                              <p className="text-xs text-gray-500">
                                Clientes afectados: {producto.clientes_afectados} •
                                Facturas: {producto.facturas_afectadas}
                              </p>
                            </div>

                            {/* Cantidad original */}
                            <div className="lg:col-span-2">
                              <label className="label">Original:</label>
                              <div className="text-lg font-medium text-gray-700">
                                {producto.cantidad_faltante}
                              </div>
                              <p className="text-xs text-gray-500">De faltantes</p>
                            </div>

                            {/* Cantidad a ordenar */}
                            <div className="lg:col-span-2">
                              <label className="label">Cantidad a ordenar:</label>
                              <input
                                type="number"
                                min="0"
                                value={cantidadFinal}
                                onChange={(e) => handleCantidadChange(proveedor.nombre, producto.codigo, e.target.value)}
                                className="input"
                                placeholder="0"
                              />
                            </div>

                            {/* Estado */}
                            <div className="lg:col-span-2">
                              <label className="label">Estado:</label>
                              <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${cantidadFinal !== producto.cantidad_faltante
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                                }`}>
                                {cantidadFinal !== producto.cantidad_faltante ? '✏️ Modificado' : '📋 Original'}
                              </div>
                              {cantidadFinal !== producto.cantidad_faltante && (
                                <p className="text-xs text-yellow-600 mt-1">
                                  Diferencia: {cantidadFinal - producto.cantidad_faltante > 0 ? '+' : ''}{cantidadFinal - producto.cantidad_faltante}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Cantidad Sugerida */}
      {activeTab === 'cantidad-sugerida' && (
        <div>
          {/* Filtro de proveedor */}
          <div className="card bg-purple-50 border-purple-200 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-purple-900">
                  🧠 Análisis Inteligente de Compras
                </h3>
                <p className="text-purple-700">
                  Cantidades sugeridas basadas en 90 días de histórico de faltantes
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <div>
                  <label className="label text-purple-800">Seleccionar Proveedor:</label>
                  <select
                    value={proveedorSeleccionado}
                    onChange={(e) => setProveedorSeleccionado(e.target.value)}
                    className="input min-w-48"
                  >
                    <option value="">-- Seleccione un proveedor --</option>
                    {proveedores.map((proveedor) => (
                      <option key={proveedor.id} value={proveedor.id}>
                        {proveedor.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {!proveedorSeleccionado ? (
            /* Sin proveedor seleccionado */
            <div className="card text-center py-12">
              <Brain className="mx-auto text-purple-400 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Selecciona un proveedor</h3>
              <p className="text-gray-600">Elige un proveedor del filtro superior para ver las cantidades sugeridas inteligentes.</p>
            </div>
          ) : cantidadSugerida.length === 0 ? (
            /* Sin datos para el proveedor */
            <div className="card text-center py-12">
              <Package className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Sin datos históricos</h3>
              <p className="text-gray-600">No hay suficientes datos históricos para este proveedor en los últimos 90 días.</p>
            </div>
          ) : (
            /* Mostrar datos */
            <div className="space-y-6">
              {/* Resumen de estadísticas */}
              {resumenSugerida && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="card">
                    <div className="flex items-center">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Package className="text-purple-600" size={24} />
                      </div>
                      <div className="ml-4">
                        <p className="text-sm text-gray-600">Total Productos</p>
                        <p className="text-2xl font-semibold text-gray-900">{resumenSugerida.total_productos}</p>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="flex items-center">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Users className="text-green-600" size={24} />
                      </div>
                      <div className="ml-4">
                        <p className="text-sm text-gray-600">Alta Rotación</p>
                        <p className="text-2xl font-semibold text-green-900">{resumenSugerida.productos_alta_rotacion}</p>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="flex items-center">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <ShoppingCart className="text-blue-600" size={24} />
                      </div>
                      <div className="ml-4">
                        <p className="text-sm text-gray-600">Baja Rotación</p>
                        <p className="text-2xl font-semibold text-blue-900">{resumenSugerida.productos_baja_rotacion}</p>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="flex items-center">
                      <div className="p-2 bg-orange-100 rounded-lg">
                        <Package className="text-orange-600" size={24} />
                      </div>
                      <div className="ml-4">
                        <p className="text-sm text-gray-600">Total Sugerido</p>
                        <p className="text-2xl font-semibold text-orange-900">{resumenSugerida.cantidad_total_sugerida}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabla de productos */}
              <div className="card">
                <div className="mb-4 pb-4 border-b border-gray-200">
                  <h3 className="text-xl font-semibold text-gray-900">Productos con Cantidad Sugerida</h3>
                  <p className="text-gray-600">Análisis inteligente basado en histórico de 90 días</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Producto</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-900">Faltante Actual</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-900">Clasificación</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-900">Promedio/Semana</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-900">Frecuencia</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-900">Cantidad Sugerida</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-900">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {cantidadSugerida.map((producto, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900">{producto.producto_nombre}</p>
                              <p className="text-sm text-gray-600">Código: {producto.producto_codigo}</p>
                              <p className="text-xs text-gray-500" title={producto.razonamiento_calculo}>
                                💡 {producto.razonamiento_calculo}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                              {producto.cantidad_faltante_actual}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-sm font-medium ${producto.clasificacion_rotacion === 'alta'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-blue-100 text-blue-800'
                              }`}>
                              {producto.clasificacion_rotacion === 'alta' ? '🔥 Alta' : '📊 Baja'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-medium text-gray-900">
                              {producto.promedio_semanal.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="text-center">
                              <span className="text-sm font-medium text-gray-900">
                                {producto.frecuencia_porcentaje}%
                              </span>
                              <p className="text-xs text-gray-500">
                                {producto.semanas_activas}/{producto.total_semanas} semanas
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-lg font-bold bg-purple-100 text-purple-800">
                              {producto.cantidad_sugerida}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-medium ${producto.diferencia_sugerida > 0
                                ? 'text-orange-600'
                                : producto.diferencia_sugerida < 0
                                  ? 'text-green-600'
                                  : 'text-gray-600'
                              }`}>
                              {producto.diferencia_sugerida > 0 ? '+' : ''}{producto.diferencia_sugerida}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Info adicional */}
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    💡 <strong>Explicación:</strong> Las cantidades sugeridas consideran el patrón histórico de cada producto.
                    Los productos de alta rotación incluyen buffer adicional, mientras que los de baja rotación se ajustan según frecuencia.
                  </p>
                  {resumenSugerida && (
                    <p className="text-xs text-gray-500 mt-2">
                      Basado en {resumenSugerida.registros_historicos_total} registros históricos de los últimos 90 días.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ✅ AGREGADO: Sección de Encargos Especiales */}
      {activeTab === 'faltantes' && encargosEspeciales && encargosEspeciales.length > 0 && (
        <div className="card mt-8">
          <div className="mb-4 pb-4 border-b border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg mr-4">
                <FileText className="text-orange-600" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Encargos Especiales</h3>
                <p className="text-gray-600">Productos adicionales solicitados que no están en el sistema</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {encargosEspeciales.map((encargo, index) => (
              <div key={index} className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-orange-900">
                      Factura #{encargo.numero_factura}
                    </p>
                    <p className="text-sm text-orange-800 mt-1">
                      {encargo.observaciones_adicionales}
                    </p>
                    <p className="text-xs text-orange-600 mt-2">
                      Cliente: {encargo.cliente_nombre} • Fecha: {new Date(encargo.fecha_emision).toLocaleDateString('es-CR')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}