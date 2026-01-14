import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Calculator,
  RotateCcw
} from 'lucide-react'
import api from '../services/api'
import ToastContainer from '../components/ToastContainer'

export default function RevisionPrecios() {
  const navigate = useNavigate()

  // Estados principales
  const [vista, setVista] = useState('lista')
  const [facturas, setFacturas] = useState([])
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)
  const [productos, setProductos] = useState([])
  const [productosAlegra, setProductosAlegra] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Pestaña activa y filtros
  const [tabActiva, setTabActiva] = useState('LISTAS_REVISION') // PENDIENTE_RELACIONAR, LISTAS_REVISION, ENVIADAS

  // Precios ajustados por el usuario
  const [preciosAjustados, setPreciosAjustados] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [devolviendo, setDevolviendo] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)

  // Toast notifications
  const [toasts, setToasts] = useState([])

  const showToast = (message, type = 'info', duration = 5000) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type, duration }])
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  useEffect(() => {
    if (vista === 'lista') {
      loadFacturas()
    }
  }, [vista, tabActiva])

  const loadFacturas = async () => {
    try {
      setLoading(true)
      setError(null)

      let response

      if (tabActiva === 'PENDIENTE_RELACIONAR') {
        // Facturas procesadas pero sin relacionar completamente
        response = await api.get('/revision-precios/facturas?estado=PROCESADA')
      } else if (tabActiva === 'LISTAS_REVISION') {
        // Facturas 100% relacionadas listas para revisión
        response = await api.get('/revision-precios/facturas-relacionadas')
      } else if (tabActiva === 'ENVIADAS') {
        // Facturas ya enviadas a Alegra
        response = await api.get('/revision-precios/facturas?estado=ENVIADA')
      }

      if (response && response.data.success) {
        setFacturas(response.data.facturas || [])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const sincronizarProductos = async () => {
    try {
      setSincronizando(true)
      showToast('Sincronizando productos desde Alegra...', 'info')

      const response = await api.post('/alegra/sincronizar/cache-productos')

      if (response.data.success) {
        showToast(
          `Sincronización exitosa: ${response.data.total} productos actualizados`,
          'success'
        )
      }
    } catch (err) {
      console.error('Error sincronizando productos:', err)
      showToast(
        `Error al sincronizar: ${err.message}`,
        'error'
      )
    } finally {
      setSincronizando(false)
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

  const devolverFactura = async () => {
    if (!facturaSeleccionada) return

    const confirmacion = window.confirm(
      `¿Devolver factura ${facturaSeleccionada.numeroConsecutivo} a PROCESADA?\n\n` +
      `Esta acción permitirá revisar y corregir las relaciones de productos.`
    )

    if (!confirmacion) return

    try {
      setDevolviendo(true)
      const response = await api.post('/revision-precios/devolver-factura', {
        facturaId: facturaSeleccionada.id
      })

      if (response.data.success) {
        alert('✅ Factura devuelta a estado PROCESADA correctamente')
        volverALista()
      }
    } catch (err) {
      alert('❌ Error: ' + err.message)
    } finally {
      setDevolviendo(false)
    }
  }

  // Función para redondear precio terminado en 5 o 0
  const redondearPrecio = (precio) => {
    // Redondear a la decena más cercana terminada en 5 o 0
    const precioRedondeado = Math.round(precio / 5) * 5
    return precioRedondeado
  }

  const ajustarPrecio = (productoId, nuevoPrecio) => {
    setPreciosAjustados({
      ...preciosAjustados,
      [productoId]: parseFloat(nuevoPrecio) || 0
    })
  }

  const aplicarPrecioSugerido = (productoId, precioSugerido) => {
    const precioRedondeado = redondearPrecio(precioSugerido)
    ajustarPrecio(productoId, precioRedondeado)
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

    // Guardar info de la factura para el toast
    const facturaNumero = facturaSeleccionada.numeroConsecutivo
    const facturaId = facturaSeleccionada.id

    // Mostrar toast de "enviando" y volver a la lista inmediatamente
    showToast(`📤 Enviando factura ${facturaNumero} a Alegra...`, 'loading', null)
    volverALista()

    // Enviar en segundo plano
    try {
      const response = await api.post('/revision-precios/enviar-alegra', {
        facturaId: facturaId,
        preciosAjustados: preciosAjustados
      })

      if (response.data.success) {
        const resultado = response.data.resultado
        const facturaCreada = response.data.facturaCreada

        // Remover toast de "enviando"
        setToasts(prev => prev.filter(t => t.type !== 'loading'))

        // Mostrar resultado apropiado
        if (facturaCreada) {
          showToast(
            `✅ Factura ${facturaNumero} enviada exitosamente\n` +
            `📄 ID Alegra: ${resultado.alegraFacturaId}\n` +
            `💰 Costos actualizados: ${resultado.costosActualizados}/${resultado.totalProductos}\n` +
            `🔄 Precios ajustados: ${resultado.preciosActualizados || 0}`,
            'success',
            8000
          )
        } else {
          showToast(
            `⚠️ Factura ${facturaNumero} procesada parcialmente\n` +
            `✅ Costos actualizados: ${resultado.costosActualizados}/${resultado.totalProductos}\n` +
            `✅ Precios ajustados: ${resultado.preciosActualizados || 0}\n` +
            `❌ Factura NO creada en Alegra (sin permisos)\n` +
            `💡 Contacta soporte de Alegra para habilitar facturas de compra`,
            'warning',
            12000
          )
        }

        // Recargar la lista para actualizar estados
        loadFacturas()
      }
    } catch (err) {
      // Remover toast de "enviando"
      setToasts(prev => prev.filter(t => t.type !== 'loading'))

      // Mostrar error
      showToast(
        `❌ Error enviando factura ${facturaNumero}\n${err.message}`,
        'error',
        10000
      )
    }
  }

  // Análisis de producto
  const analizarProducto = (producto) => {
    const alegraData = productosAlegra[producto.alegraItemId] || {}

    // Usar el porcentaje de IVA real del producto (viene del backend)
    const IVA_PORCENTAJE = alegraData.taxPercentage || 13  // Default 13% si no viene

    // Costo Anterior: último costo en Alegra (antes de esta factura)
    const costoAnterior = alegraData.cost || 0

    // 🆕 Aplicar factor de conversión a la cantidad
    // SIEMPRE aplicar el factor para convertir cantidad del proveedor a tu sistema
    // Ejemplo: Proveedor 1 → Yo 100 → Factor 100 → 1 × 100 = 100 ✓
    // Ejemplo: Proveedor 50 → Yo 1 → Factor 0.02 → 50 × 0.02 = 1 ✓
    const factorConversion = producto.mapeo?.factorConversion || 1
    const cantidadReal = producto.cantidad * factorConversion

    // Costo Nuevo: precio REAL considerando descuentos Y factor de conversión
    // totalLinea ya incluye descuentos e impuestos aplicados
    const costoNuevoConIva = cantidadReal > 0
      ? (producto.totalLinea / cantidadReal)
      : producto.precioUnitario || 0
    const costoNuevoSinIva = costoNuevoConIva / (1 + IVA_PORCENTAJE / 100)

    // Precio de venta ACTUAL (CON IVA desde el backend)
    const precioVentaConIva = alegraData.price || 0
    const precioVentaSinIva = precioVentaConIva / (1 + IVA_PORCENTAJE / 100)

    // Precio AJUSTADO por el usuario (si existe)
    const precioAjustadoInput = preciosAjustados[producto.id]
    const precioAjustadoSinIva = precioAjustadoInput || precioVentaSinIva
    const precioAjustadoConIva = precioAjustadoSinIva * (1 + IVA_PORCENTAJE / 100)

    // MARGEN sobre precio SIN IVA (como debe ser)
    // Margen = (Precio - Costo) / Precio * 100
    const margenActual = precioVentaSinIva > 0
      ? ((precioVentaSinIva - costoNuevoSinIva) / precioVentaSinIva) * 100
      : 0

    const margenNuevo = precioAjustadoSinIva > 0
      ? ((precioAjustadoSinIva - costoNuevoSinIva) / precioAjustadoSinIva) * 100
      : 0

    // Cambio de costo: cuánto aumentó/disminuyó respecto al anterior
    const cambioCosto = costoAnterior > 0
      ? ((costoNuevoConIva - costoAnterior) / costoAnterior) * 100
      : 0

    // Precio sugerido (margen 20% sobre precio SIN IVA)
    const precioSugeridoSinIva = costoNuevoSinIva > 0 ? costoNuevoSinIva / 0.80 : 0
    const precioSugeridoConIva = precioSugeridoSinIva * (1 + IVA_PORCENTAJE / 100)

    const alertas = []
    if (cambioCosto > 30) {
      alertas.push({
        tipo: 'warning',
        mensaje: `Costo aumentó ${Math.round(cambioCosto)}%`
      })
    }
    if (margenNuevo < 15 && margenNuevo > 0) {
      alertas.push({
        tipo: 'danger',
        mensaje: `Margen muy bajo: ${Math.round(margenNuevo)}% (sugerido 20%: ₡${Math.round(precioSugeridoSinIva)} sin IVA)`
      })
    } else if (margenNuevo >= 15 && margenNuevo < 20 && margenNuevo > 0) {
      alertas.push({
        tipo: 'warning',
        mensaje: `Margen ajustado: ${Math.round(margenNuevo)}% (recomendado 20%: ₡${Math.round(precioSugeridoSinIva)} sin IVA)`
      })
    }

    return {
      // Cantidades
      cantidadReal,
      factorConversion,

      // Costos
      costoAnterior,
      costoNuevoConIva,
      costoNuevoSinIva,

      // Precios actuales
      precioVentaSinIva,
      precioVentaConIva,

      // Precios ajustados
      precioAjustadoSinIva,
      precioAjustadoConIva,

      // Precio sugerido
      precioSugeridoSinIva,
      precioSugeridoConIva,

      // Márgenes y cambios
      margenActual,
      margenNuevo,
      cambioCosto,

      // Otros
      alertas,
      nombre: alegraData.name || producto.descripcion,
      precioModificado: preciosAjustados[producto.id] !== undefined,
      ivaPorcentaje: IVA_PORCENTAJE
    }
  }

  // VISTA DE LISTA
  if (vista === 'lista') {
    return (
      <>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
        <div className="max-w-7xl mx-auto">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <DollarSign className="mr-3" size={32} />
                Revisión de Precios
              </h1>
              <p className="text-gray-600 mt-1">
                Analiza costos, ajusta precios y envía facturas a Alegra
              </p>
            </div>
            <button
              onClick={sincronizarProductos}
              disabled={sincronizando}
              className="btn btn-secondary flex items-center gap-2"
              title="Sincronizar productos desde Alegra"
            >
              <RotateCcw className={sincronizando ? 'animate-spin' : ''} size={18} />
              {sincronizando ? 'Sincronizando...' : 'Sincronizar Productos'}
            </button>
          </div>

          {/* Pestañas de filtrado */}
          <div className="card mb-6">
            <div className="flex gap-2">
              <button
                onClick={() => setTabActiva('PENDIENTE_RELACIONAR')}
                className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all ${tabActiva === 'PENDIENTE_RELACIONAR'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                Pendientes de Relacionar
              </button>
              <button
                onClick={() => setTabActiva('LISTAS_REVISION')}
                className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all ${tabActiva === 'LISTAS_REVISION'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                Listas para Revisión (100%)
              </button>
              <button
                onClick={() => setTabActiva('ENVIADAS')}
                className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all ${tabActiva === 'ENVIADAS'
                    ? 'bg-green-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                Enviadas a Alegra
              </button>
            </div>
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
                {tabActiva === 'PENDIENTE_RELACIONAR' && 'No hay facturas pendientes de relacionar'}
                {tabActiva === 'LISTAS_REVISION' && 'No hay facturas listas para revisión'}
                {tabActiva === 'ENVIADAS' && 'No hay facturas enviadas'}
              </h3>
              <p className="text-gray-600">
                {tabActiva === 'PENDIENTE_RELACIONAR' && 'Las facturas pendientes aparecerán aquí'}
                {tabActiva === 'LISTAS_REVISION' && 'Las facturas aparecerán aquí cuando estén 100% relacionadas'}
                {tabActiva === 'ENVIADAS' && 'Las facturas enviadas a Alegra aparecerán aquí'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {facturas.map(factura => {
                const totalProductos = factura.productos?.length || 0
                const relacionados = factura.productos?.filter(p => p.estadoRelacionado === 'RELACIONADO').length || 0
                const porcentajeRelacionado = totalProductos > 0 ? Math.round((relacionados / totalProductos) * 100) : 0
                const es100Relacionada = porcentajeRelacionado === 100

                return (
                  <div
                    key={factura.id}
                    className="card hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => {
                      if (tabActiva === 'LISTAS_REVISION' && es100Relacionada) {
                        abrirRevision(factura)
                      } else if (tabActiva === 'PENDIENTE_RELACIONAR') {
                        navigate(`/relacionar-productos/${factura.id}`)
                      } else if (tabActiva === 'ENVIADAS') {
                        abrirRevision(factura)
                      }
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            Factura #{factura.numeroConsecutivo}
                          </h3>
                          {tabActiva === 'PENDIENTE_RELACIONAR' && (
                            <span className={`badge ${porcentajeRelacionado === 0 ? 'bg-red-500' :
                                porcentajeRelacionado < 100 ? 'bg-orange-500' :
                                  'bg-green-500'
                              } text-white`}>
                              {porcentajeRelacionado}% Relacionada
                            </span>
                          )}
                          {tabActiva === 'LISTAS_REVISION' && (
                            <span className="badge badge-success">100% Relacionada</span>
                          )}
                          {tabActiva === 'ENVIADAS' && (
                            <span className="badge bg-green-600 text-white">Enviada a Alegra</span>
                          )}
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
                            <p className="font-medium text-gray-900">
                              {totalProductos}
                              {tabActiva === 'PENDIENTE_RELACIONAR' && (
                                <span className="text-xs text-gray-500 ml-1">
                                  ({relacionados} relacionados)
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>

                      <button className="btn btn-primary ml-4">
                        {tabActiva === 'PENDIENTE_RELACIONAR' && 'Relacionar →'}
                        {tabActiva === 'LISTAS_REVISION' && 'Revisar →'}
                        {tabActiva === 'ENVIADAS' && 'Ver →'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </>
    )
  }

  // VISTA DE REVISIÓN
  const preciosModificados = Object.keys(preciosAjustados).filter(
    id => preciosAjustados[id] > 0
  ).length

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={volverALista}
              className="btn btn-outline flex items-center"
            >
              <ArrowLeft size={16} className="mr-2" />
              Volver a la lista
            </button>

            <button
              onClick={devolverFactura}
              className="btn bg-yellow-500 hover:bg-yellow-600 text-white flex items-center"
              disabled={devolviendo}
            >
              {devolviendo ? (
                <>
                  <Loader size={16} className="mr-2 animate-spin" />
                  Devolviendo...
                </>
              ) : (
                <>
                  <RotateCcw size={16} className="mr-2" />
                  Devolver a Relacionar
                </>
              )}
            </button>
          </div>

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
        <div className="space-y-6 mb-6">
          {productos.map((producto, index) => {
            const analisis = analizarProducto(producto)

            return (
              <div
                key={producto.id}
                className={`relative rounded-xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden ${analisis.precioModificado
                    ? 'bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-400'
                    : 'bg-white border-2 border-gray-200'
                  }`}
              >
                {/* Número de producto */}
                <div className="absolute top-0 left-0 bg-blue-600 text-white px-4 py-2 rounded-br-xl font-bold text-sm">
                  #{index + 1}
                </div>

                <div className="p-6 pt-12">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center">
                        <Package className="mr-2 text-blue-600" size={24} />
                        {analisis.nombre}
                      </h3>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <span className="inline-flex items-center px-3 py-1 bg-gray-100 rounded-full font-medium text-gray-700">
                          Código: <strong className="ml-1">{producto.codigoProveedor}</strong>
                        </span>
                        <span className="inline-flex items-center px-3 py-1 bg-blue-100 rounded-full font-medium text-blue-700">
                          Cantidad: <strong className="ml-1">
                            {(() => {
                              const factorConversion = producto.mapeo?.factorConversion || 1

                              // SIEMPRE aplicar el factor
                              const cantidadReal = producto.cantidad * factorConversion

                              // Mostrar indicador solo cuando hay conversión (factor != 1)
                              const hayConversion = factorConversion !== 1

                              // Formatear cantidad real según precisión
                              const cantidadRealFormateada = Number.isInteger(cantidadReal)
                                ? cantidadReal
                                : cantidadReal.toFixed(2)

                              // Crear tooltip descriptivo
                              let tooltipText = `Proveedor factura: ${producto.cantidad}\n`
                              if (factorConversion >= 1) {
                                tooltipText += `Factor: ×${factorConversion.toFixed(2)} (${factorConversion.toFixed(2)} tuyos por cada 1 del proveedor)`
                              } else {
                                tooltipText += `Factor: ×${factorConversion.toFixed(4)} (${producto.cantidad} del proveedor = ${cantidadReal} tuyo)`
                              }
                              tooltipText += `\nTú registras: ${cantidadRealFormateada}`

                              return (
                                <>
                                  {cantidadRealFormateada} {producto.unidadMedida}
                                  {hayConversion && (
                                    <span
                                      className="text-xs text-blue-600 ml-2 cursor-help"
                                      title={tooltipText}
                                    >
                                      🔄 {factorConversion >= 1 ? `×${factorConversion}` : `(${producto.cantidad}→${cantidadRealFormateada})`}
                                    </span>
                                  )}
                                </>
                              )
                            })()}
                          </strong>
                        </span>
                        <span className="inline-flex items-center px-3 py-1 bg-purple-100 rounded-full font-medium text-purple-700">
                          Subtotal: <strong className="ml-1">₡{((producto.precioUnitario || 0) * (producto.cantidad || 0)).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</strong>
                        </span>
                      </div>
                    </div>
                    {analisis.precioModificado && (
                      <span className="badge bg-orange-500 text-white text-base px-4 py-2 flex items-center shadow-lg">
                        <Edit3 size={18} className="mr-2" />
                        Precio Ajustado
                      </span>
                    )}
                  </div>

                  {/* Alertas */}
                  {analisis.alertas.length > 0 && (
                    <div className="mb-5 space-y-2">
                      {analisis.alertas.map((alerta, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center text-sm px-4 py-3 rounded-lg font-medium shadow-sm border-l-4 ${alerta.tipo === 'warning'
                              ? 'bg-yellow-50 text-yellow-900 border-yellow-500'
                              : 'bg-red-50 text-red-900 border-red-500'
                            }`}
                        >
                          <AlertCircle size={20} className="mr-3 flex-shrink-0" />
                          <span>{alerta.mensaje}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tabla Simple con Marco */}
                  <div className="bg-white rounded-lg border-2 border-gray-300 overflow-hidden mb-4">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b-2 border-gray-300 bg-gray-50">
                          <th className="text-left p-4 text-sm font-bold text-gray-700">Concepto</th>
                          <th className="text-right p-4 text-sm font-bold text-gray-700">Anterior</th>
                          <th className="text-right p-4 text-sm font-bold text-gray-700">Actual/Nuevo</th>
                          <th className="text-center p-4 text-sm font-bold text-gray-700">Cambio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Fila Costo */}
                        <tr className="border-b border-gray-200">
                          <td className="p-4 text-sm font-bold text-gray-900">
                            Costo (con IVA)
                          </td>
                          <td className="p-4 text-right text-gray-600 font-semibold text-base">
                            ₡{(analisis.costoAnterior || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-4 text-right text-gray-900 font-bold text-xl">
                            ₡{(analisis.costoNuevoConIva || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-4 text-center">
                            {analisis.cambioCosto !== 0 ? (
                              <span className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-semibold ${analisis.cambioCosto > 0
                                  ? 'text-red-600'
                                  : 'text-green-600'
                                }`}>
                                {analisis.cambioCosto > 0 ? (
                                  <TrendingUp size={16} className="mr-1" />
                                ) : (
                                  <TrendingDown size={16} className="mr-1" />
                                )}
                                {analisis.cambioCosto > 0 ? '+' : ''}{analisis.cambioCosto.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-gray-400 text-sm">Sin cambio</span>
                            )}
                          </td>
                        </tr>

                        {/* Fila Precio Venta Actual */}
                        <tr className="border-b border-gray-200 bg-blue-50">
                          <td className="p-4 text-sm font-bold text-gray-900">
                            Precio Venta Actual
                          </td>
                          <td colSpan="2" className="p-4">
                            <div className="text-right">
                              <div className="text-gray-900 font-bold text-2xl">
                                ₡{(analisis.precioVentaSinIva || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                                <span className="text-sm font-normal text-gray-600 ml-2">sin IVA</span>
                              </div>
                              <div className="text-gray-600 text-sm mt-1">
                                ₡{(analisis.precioVentaConIva || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })} con IVA ({analisis.ivaPorcentaje || 13}%)
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-block px-4 py-2 rounded-lg font-bold text-base shadow-sm ${analisis.margenActual < 15 ? 'bg-red-500 text-white' :
                                analisis.margenActual < 20 ? 'bg-yellow-400 text-gray-900' :
                                  'bg-green-500 text-white'
                              }`}>
                              {analisis.margenActual.toFixed(1)}%
                            </span>
                            <div className="text-xs text-gray-500 mt-1">sobre precio sin IVA</div>
                          </td>
                        </tr>

                        {/* Fila Ajustar Precio */}
                        <tr className="border-t-2 border-gray-300">
                          <td className="p-4 text-sm font-bold text-gray-900">
                            <div className="flex items-center">
                              <Calculator size={18} className="mr-2 text-blue-600" />
                              <span className="text-base">Ajustar Precio Venta</span>
                            </div>
                          </td>
                          <td colSpan="2" className="p-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                <div className="relative flex-1">
                                  <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-600 font-bold text-lg">
                                    ₡
                                  </span>
                                  <input
                                    type="number"
                                    value={preciosAjustados[producto.id] || analisis.precioVentaSinIva}
                                    onChange={(e) => ajustarPrecio(producto.id, e.target.value)}
                                    step="100"
                                    min="0"
                                    className="w-full pl-10 pr-20 py-3 text-right font-bold text-xl border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                                    placeholder="Precio sin IVA"
                                  />
                                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 font-medium">
                                    sin IVA
                                  </div>
                                </div>
                                <div className="text-sm text-gray-600 min-w-[150px]">
                                  Con IVA: ₡{(analisis.precioAjustadoConIva || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                                </div>
                              </div>
                              {analisis.margenNuevo < 20 && (
                                <button
                                  onClick={() => aplicarPrecioSugerido(producto.id, analisis.precioSugeridoSinIva)}
                                  className="btn bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg shadow-md hover:shadow-lg transition-all whitespace-nowrap flex items-center w-full justify-center"
                                  title="Aplicar precio con margen del 20% (redondeado a 5 o 0)"
                                >
                                  <TrendingUp size={16} className="mr-2" />
                                  Aplicar Sugerido 20%: ₡{redondearPrecio(analisis.precioSugeridoSinIva).toLocaleString('es-CR')}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            {analisis.precioModificado ? (
                              <span className={`inline-block px-4 py-2 rounded-lg font-bold text-lg shadow-sm ${analisis.margenNuevo < 15 ? 'bg-red-500 text-white' :
                                  analisis.margenNuevo < 20 ? 'bg-yellow-400 text-gray-900' :
                                    'bg-green-500 text-white'
                                }`}>
                                {analisis.margenNuevo.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-gray-400 font-medium">Sin cambios</span>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
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
    </>
  )
}
