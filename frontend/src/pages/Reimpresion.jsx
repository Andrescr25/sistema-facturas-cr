import { useState, useEffect } from 'react'
import { Printer, FileText, AlertCircle, Calendar, User, Package, Edit, Eye, Save, RotateCcw, CheckCircle } from 'lucide-react'
import { alegraService } from '../services/alegraService'

export default function Reimpresion() {
  const [activeTab, setActiveTab] = useState('pendientes')
  const [facturasPendientes, setFacturasPendientes] = useState([])
  const [facturasProcesadas, setFacturasProcesadas] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Estado para edición
  const [facturaEditando, setFacturaEditando] = useState(null)
  const [itemsEditados, setItemsEditados] = useState([])
  const [modoEdicion, setModoEdicion] = useState(false)
  const [procesando, setProcesando] = useState(false)

  useEffect(() => {
    if (activeTab === 'pendientes') {
      loadFacturasPendientes()
    } else if (activeTab === 'procesadas') {
      loadFacturasProcesadas()
    }
  }, [activeTab])

  const loadFacturasPendientes = async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await alegraService.getFacturasPendientesReimpresion()

      if (result.success) {
        setFacturasPendientes(result.data)
      } else {
        setError(result.message || 'Error cargando facturas pendientes')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadFacturasProcesadas = async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await alegraService.getFacturasProcesadasReimpresion()

      if (result.success) {
        setFacturasProcesadas(result.data)
      } else {
        setError(result.message || 'Error cargando facturas procesadas')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleVerPDF = async (factura) => {
    try {
      await alegraService.visualizarPDFFactura(factura.alegra_id)
    } catch (error) {
      alert(`❌ Error abriendo PDF: ${error.message}`)
    }
  }

  const handleIniciarEdicion = (factura) => {
    setFacturaEditando(factura)

    // Inicializar items editados con los valores actuales de Alegra
    // Necesitamos obtener la factura completa
    alegraService.getInvoiceById(factura.alegra_id).then(result => {
      if (result.success) {
        setItemsEditados(result.data.items.map(item => ({
          id: item.id,
          reference: item.reference,
          name: item.name,
          description: item.description || item.name || '',
          quantity: item.quantity,
          price: item.price,
          tax: item.tax || []
        })))
      }
    })

    setModoEdicion(true)
  }

  const handleCancelarEdicion = () => {
    setFacturaEditando(null)
    setItemsEditados([])
    setModoEdicion(false)
  }

  const handleAgregarItem = () => {
    setItemsEditados(prev => ([
      ...prev,
      {
        id: null,
        reference: '',
        name: '',
        description: '',
        quantity: 1,
        price: 0,
        tax: []
      }
    ]))
  }

  const handleGuardarFactura = async (imprimirDespues = false) => {
    if (!facturaEditando) return

    const confirmacion = window.confirm(
      `¿Confirmar ${imprimirDespues ? 'guardar e imprimir' : 'guardar'} factura ${facturaEditando.numero_factura}?\n\n` +
      `Se actualizarán los precios automáticamente.`
    )

    if (!confirmacion) return

    try {
      setProcesando(true)

      let itemsParaGuardar = null

      if (modoEdicion) {
        itemsParaGuardar = itemsEditados.map(item => {
          const descripcion = (item.description ?? item.name ?? '').trim()
          const referencia = (item.reference ?? '').toString().trim()

          const payload = {
            ...item,
            id: item.id ? item.id : undefined,
            reference: referencia,
            description: descripcion || referencia,
            quantity: Number(item.quantity) || 0,
            price: Number(item.price) || 0,
            tax: item.tax || []
          }

          delete payload.name
          if (!payload.id) {
            delete payload.id
          }

          return payload
        })

        const hayReferenciaVacia = itemsParaGuardar.some(item => !item.reference)
        if (hayReferenciaVacia) {
          alert('⚠️ Todos los productos deben tener una referencia antes de guardar.')
          setProcesando(false)
          return
        }

        const hayCantidadInvalida = itemsParaGuardar.some(item => item.quantity <= 0)
        if (hayCantidadInvalida) {
          alert('⚠️ Las cantidades deben ser mayores a cero.')
          setProcesando(false)
          return
        }
      }

      // Procesar factura (con items editados si hay, o ajustes automáticos)
      // 🔧 Marcar como procesada porque viene desde Reimpresión (reimprimiendo)
      const facturaConFlag = {
        ...facturaEditando,
        marcar_como_procesada: true
      }
      
      const result = await alegraService.procesarFacturaIndividual(
        facturaConFlag,
        modoEdicion ? itemsParaGuardar : null
      )

      if (result.success) {
        alert(`✅ Factura ${facturaEditando.numero_factura} procesada exitosamente`)

        // Si pidió imprimir, abrir PDF
        if (imprimirDespues) {
          await alegraService.visualizarPDFFactura(facturaEditando.alegra_id)
        }

        // Limpiar estado
        handleCancelarEdicion()

        // Recargar lista
        loadFacturasPendientes()
      } else {
        throw new Error(result.message || 'Error procesando factura')
      }
    } catch (error) {
      alert(`❌ Error: ${error.message}`)
    } finally {
      setProcesando(false)
    }
  }

  const handleRecuperarFactura = async (factura) => {
    const confirmacion = window.confirm(
      `¿Recuperar factura ${factura.numero_factura}?\n\n` +
      `La factura volverá a la lista de pendientes.`
    )

    if (!confirmacion) return

    try {
      setLoading(true)
      const result = await alegraService.recuperarFactura(factura.alegra_id)

      if (result.success) {
        alert(`✅ Factura ${factura.numero_factura} recuperada`)
        loadFacturasProcesadas()
      } else {
        throw new Error(result.message || 'Error recuperando factura')
      }
    } catch (error) {
      alert(`❌ Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleItemChange = (index, field, value) => {
    const newItems = [...itemsEditados]
    newItems[index] = {
      ...newItems[index],
      [field]: field === 'quantity' || field === 'price' ? parseFloat(value) || 0 : value
    }
    if (field === 'description') {
      newItems[index].name = value
    }
    setItemsEditados(newItems)
  }

  const handleEliminarItem = (index) => {
    const newItems = itemsEditados.filter((_, i) => i !== index)
    setItemsEditados(newItems)
  }

  // Renderizar vista de cambios automáticos (sin modo edición)
  const renderCambiosAutomaticos = (factura) => {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 mb-6 border border-blue-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-blue-900 mb-1">
              📋 Cambios por Ajustes Previos
            </h3>
            <p className="text-sm text-blue-700">
              Estos cambios se aplicarán automáticamente con precios actualizados
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleIniciarEdicion(factura)}
              className="btn btn-outline flex items-center gap-2 text-sm"
            >
              <Edit size={16} />
              Editar Factura
            </button>
            <button
              onClick={() => handleVerPDF(factura)}
              className="btn btn-outline flex items-center gap-2 text-sm"
            >
              <Eye size={16} />
              Ver PDF
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {factura.ajustes_realizados?.map((ajuste, index) => (
            <div key={index} className="bg-white rounded-lg p-4 border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{ajuste.producto_nombre}</p>
                  <p className="text-sm text-gray-600">Código: {ajuste.producto_codigo}</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  ajuste.estado === 'completo' ? 'bg-green-100 text-green-800' :
                  ajuste.estado === 'parcial' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {ajuste.estado === 'completo' ? '✅ Completo' :
                   ajuste.estado === 'parcial' ? '◐ Parcial' : '❌ No llegó'}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Faltante:</span>
                  <span className="ml-2 font-medium">{ajuste.cantidad_faltante}</span>
                </div>
                <div>
                  <span className="text-gray-600">Entregado:</span>
                  <span className="ml-2 font-medium">{ajuste.cantidad_entregada}</span>
                </div>
              </div>
              {ajuste.requiere_actualizacion && (
                <p className="mt-2 text-sm text-yellow-700 font-medium">
                  ⚠️ Se actualizará cantidad y precio en la factura
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={() => handleGuardarFactura(false)}
            disabled={procesando}
            className="btn btn-primary flex items-center gap-2"
          >
            <Save size={16} />
            {procesando ? 'Procesando...' : 'Guardar'}
          </button>
          <button
            onClick={() => handleGuardarFactura(true)}
            disabled={procesando}
            className="btn bg-green-600 text-white border-green-600 hover:bg-green-700 flex items-center gap-2"
          >
            <Printer size={16} />
            {procesando ? 'Procesando...' : 'Guardar e Imprimir'}
          </button>
        </div>
      </div>
    )
  }

  // Renderizar formulario de edición completo
  const renderFormularioEdicion = () => {
    if (!facturaEditando || !modoEdicion) return null

    return (
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900">
            ✏️ Editando Factura #{facturaEditando.numero_factura}
          </h3>
          <button
            onClick={handleCancelarEdicion}
            className="btn btn-outline text-sm"
          >
            Cancelar
          </button>
        </div>

        <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800">
            <strong>Cliente:</strong> {facturaEditando.cliente_nombre} |
            <strong className="ml-3">Fecha:</strong> {formatDate(facturaEditando.fecha_emision)} |
            <strong className="ml-3">Total Original:</strong> ₡{(facturaEditando.total || 0).toLocaleString('es-CR')}
          </p>
        </div>

        <div className="flex items-center justify-between mb-3">
          <h4 className="text-lg font-semibold text-gray-900">Productos en la factura</h4>
          <button
            onClick={handleAgregarItem}
            className="btn btn-outline btn-sm flex items-center gap-2"
            type="button"
          >
            <span className="text-lg leading-none">＋</span>
            Agregar producto
          </button>
        </div>

        <div className="space-y-4 max-h-96 overflow-y-auto">
          {itemsEditados.map((item, index) => (
            <div key={index} className="grid grid-cols-12 gap-3 p-4 bg-gray-50 rounded-lg border">
              <div className="col-span-3">
                <label className="text-xs text-gray-600">Referencia</label>
                <input
                  type="text"
                  value={item.reference || ''}
                  onChange={(e) => handleItemChange(index, 'reference', e.target.value)}
                  className="input input-sm w-full"
                  placeholder="Código o referencia"
                />
                {!item.id && (
                  <span className="inline-block mt-1 text-xs text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
                    Nuevo producto
                  </span>
                )}
              </div>
              <div className="col-span-4">
                <label className="text-xs text-gray-600">Descripción</label>
                <input
                  type="text"
                  value={item.description || ''}
                  onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                  className="input input-sm w-full"
                  placeholder="Descripción del producto"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Cantidad</label>
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                  className="input input-sm w-full"
                  min="0"
                  step="1"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Precio Unit.</label>
                <input
                  type="number"
                  value={item.price}
                  onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                  className="input input-sm w-full"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Subtotal</label>
                <div className="input input-sm w-full bg-gray-100 flex items-center">
                  ₡{(item.quantity * item.price).toLocaleString('es-CR')}
                </div>
              </div>
              <div className="col-span-2 flex items-end">
                <button
                  onClick={() => handleEliminarItem(index)}
                  className="btn btn-sm bg-red-500 text-white hover:bg-red-600 w-full"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-3 justify-end border-t pt-4">
          <button
            onClick={() => handleGuardarFactura(false)}
            disabled={procesando}
            className="btn btn-primary flex items-center gap-2"
          >
            <Save size={16} />
            {procesando ? 'Guardando...' : 'Guardar'}
          </button>
          <button
            onClick={() => handleGuardarFactura(true)}
            disabled={procesando}
            className="btn bg-green-600 text-white border-green-600 hover:bg-green-700 flex items-center gap-2"
          >
            <Printer size={16} />
            {procesando ? 'Guardando...' : 'Guardar e Imprimir'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Printer className="mr-3" size={32} />
            Sistema de Reimpresión Individual
          </h1>
          <p className="text-gray-600 mt-1">
            Procesa facturas una por una con actualización automática de precios
          </p>
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
            onClick={() => setActiveTab('pendientes')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'pendientes'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="inline mr-2" size={16} />
            Facturas Pendientes
            {facturasPendientes.length > 0 && (
              <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {facturasPendientes.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('procesadas')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'procesadas'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <CheckCircle className="inline mr-2" size={16} />
            Facturas Procesadas (7 días)
            {facturasProcesadas.length > 0 && (
              <span className="ml-2 bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {facturasProcesadas.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-8">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600">
            {activeTab === 'pendientes' ? 'Cargando facturas pendientes...' : 'Cargando facturas procesadas...'}
          </p>
        </div>
      )}

      {/* Tab Pendientes */}
      {activeTab === 'pendientes' && !loading && (
        <div>
          {facturaEditando ? (
            // Mostrar formulario de edición o vista de cambios
            modoEdicion ? renderFormularioEdicion() : renderCambiosAutomaticos(facturaEditando)
          ) : (
            // Lista de facturas pendientes
            facturasPendientes.length === 0 ? (
              <div className="card text-center py-12">
                <CheckCircle className="mx-auto text-green-400 mb-4" size={48} />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  ¡No hay facturas pendientes!
                </h3>
                <p className="text-gray-600">
                  Todas las facturas han sido procesadas correctamente.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {facturasPendientes.map((factura) => (
                  <div key={factura.reimpresion_id} className="card hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Factura #{factura.numero_factura}
                        </h3>
                        <p className="text-gray-600">
                          Cliente: {factura.cliente_nombre}
                        </p>
                        <p className="text-sm text-gray-500">
                          Fecha emisión: {formatDate(factura.fecha_emision)}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            factura.requiere_actualizacion
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {factura.requiere_actualizacion ? '⚠️ Requiere Cambios' : '✅ Solo Resuelto'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {factura.total_ajustes} ajuste{factura.total_ajustes !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-600">
                          ₡{(factura.total || 0).toLocaleString('es-CR')}
                        </p>
                        <button
                          onClick={() => {
                            setFacturaEditando(factura)
                            setModoEdicion(false)
                          }}
                          className="mt-3 btn btn-primary flex items-center gap-2"
                        >
                          <Printer size={16} />
                          Reimprimir
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Tab Procesadas */}
      {activeTab === 'procesadas' && !loading && (
        <div>
          {facturasProcesadas.length === 0 ? (
            <div className="card text-center py-12">
              <FileText className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No hay facturas procesadas
              </h3>
              <p className="text-gray-600">
                Las facturas procesadas aparecerán aquí por 7 días.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  💡 <strong>Recuperación:</strong> Puedes recuperar facturas procesadas en los últimos 7 días.
                  Para facturas más antiguas, edítalas desde la sección de Facturación.
                </p>
              </div>

              <div className="space-y-4">
                {facturasProcesadas.map((factura) => (
                  <div key={factura.reimpresion_id} className="card">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold text-gray-900">
                            Factura #{factura.numero_factura}
                          </h3>
                          <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                            ✅ Procesada
                          </span>
                        </div>
                        <p className="text-gray-600">
                          Cliente: {factura.cliente_nombre}
                        </p>
                        <div className="mt-2 text-sm text-gray-500">
                          <p>Procesada: {formatDate(factura.fecha_procesamiento)}</p>
                          <p className="text-xs mt-1">
                            {factura.puede_recuperar ? (
                              <span className="text-green-600">
                                ⏰ {factura.dias_restantes_recuperacion} días restantes para recuperar
                              </span>
                            ) : (
                              <span className="text-red-600">
                                ❌ Período de recuperación expirado
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-gray-700 mb-3">
                          ₡{(factura.total || 0).toLocaleString('es-CR')}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleVerPDF(factura)}
                            className="btn btn-outline btn-sm flex items-center gap-1"
                          >
                            <Eye size={14} />
                            Ver PDF
                          </button>
                          {factura.puede_recuperar && (
                            <button
                              onClick={() => handleRecuperarFactura(factura)}
                              className="btn btn-primary btn-sm flex items-center gap-1"
                            >
                              <RotateCcw size={14} />
                              Recuperar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
