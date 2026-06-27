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
  RotateCcw,
  Settings,
  XCircle
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
  const [tabActiva, setTabActiva] = useState('PENDIENTE_RELACIONAR') // PENDIENTE_RELACIONAR, LISTAS_REVISION, ENVIADAS

  // Precios ajustados por el usuario
  const [preciosAjustados, setPreciosAjustados] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [devolviendo, setDevolviendo] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)

  // Factor de conversión inline
  const [modalFactor, setModalFactor] = useState(false)
  const [productoSeleccionadoFactor, setProductoSeleccionadoFactor] = useState(null)
  const [cantidadProveedor, setCantidadProveedor] = useState(1)
  const [cantidadMia, setCantidadMia] = useState(1)
  const [guardandoFactor, setGuardandoFactor] = useState(false)

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

  const abrirFactor = (producto) => {
    setProductoSeleccionadoFactor(producto)
    
    if (producto.mapeo?.factorConversion && producto.mapeo.factorConversion !== 1) {
      const factor = producto.mapeo.factorConversion
      if (factor < 1) {
        setCantidadProveedor(Math.round(1 / factor))
        setCantidadMia(1)
      } else {
        setCantidadProveedor(1)
        setCantidadMia(Math.round(factor))
      }
    } else {
      setCantidadProveedor(1)
      setCantidadMia(1)
    }
    
    setModalFactor(true)
  }

  const guardarFactor = async () => {
    if (!productoSeleccionadoFactor?.mapeo) return

    const cantProv = parseFloat(cantidadProveedor)
    const cantMia = parseFloat(cantidadMia)

    if (cantProv <= 0 || cantMia <= 0) {
      alert('Las cantidades deben ser mayores a 0')
      return
    }

    const factor = cantMia / cantProv

    try {
      setGuardandoFactor(true)
      const response = await api.post('/productos-revision/factor-conversion', {
        mapeoId: productoSeleccionadoFactor.mapeo.id,
        factorConversion: factor
      })

      if (response.data.success) {
        setProductos(prev => prev.map(p => {
          if (p.id === productoSeleccionadoFactor.id) {
            return {
              ...p,
              mapeo: {
                ...p.mapeo,
                factorConversion: factor
              }
            }
          }
          return p
        }))

        showToast('Factor de conversión guardado correctamente', 'success')
        setModalFactor(false)
      }
    } catch (err) {
      showToast('Error guardando factor: ' + err.message, 'error')
    } finally {
      setGuardandoFactor(false)
    }
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

          {/* Paso Activo Indicador */}
          {tabActiva === 'PENDIENTE_RELACIONAR' && (
            <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-6 mb-6">
              <h2 className="text-2xl font-bold text-orange-950 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white text-lg font-bold">1</span>
                Paso 1: Relacionar Productos (Facturas Pendientes)
              </h2>
              <p className="text-base text-orange-850 mt-1">
                Asocia los productos de la factura con tu catálogo de Alegra para poder revisar sus costos.
              </p>
            </div>
          )}

          {tabActiva === 'LISTAS_REVISION' && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 mb-6">
              <h2 className="text-2xl font-bold text-blue-950 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-lg font-bold">2</span>
                Paso 2: Revisar Precios de Venta (Listas al 100%)
              </h2>
              <p className="text-base text-blue-850 mt-1">
                Verifica los nuevos costos de los productos y ajusta los precios de venta antes de enviar a Alegra.
              </p>
            </div>
          )}

          {tabActiva === 'ENVIADAS' && (
            <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6 mb-6">
              <h2 className="text-2xl font-bold text-green-950 flex items-center gap-2">
                Historial de Facturas Enviadas a Alegra
              </h2>
              <p className="text-base text-green-850 mt-1">
                Facturas que ya fueron procesadas y cargadas en Alegra. Puedes ver sus detalles.
              </p>
            </div>
          )}

          {error && (
            <div className="card bg-red-50 border-red-200 mb-6 p-6 rounded-2xl">
              <div className="flex items-center text-red-850 text-lg font-semibold">
                <AlertCircle className="mr-3" size={24} />
                {error}
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16">
              <div className="spinner mx-auto mb-4"></div>
              <p className="text-gray-600 text-lg">Cargando facturas...</p>
            </div>
          ) : facturas.length === 0 ? (
            <div className="card text-center py-16 rounded-2xl border-2 border-dashed border-gray-300">
              <Package className="mx-auto text-gray-400 mb-4 opacity-70" size={64} />
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {tabActiva === 'PENDIENTE_RELACIONAR' && 'No hay facturas pendientes de relacionar'}
                {tabActiva === 'LISTAS_REVISION' && 'No hay facturas listas para revisión'}
                {tabActiva === 'ENVIADAS' && 'No hay facturas enviadas'}
              </h3>
              <p className="text-gray-650 text-base">
                {tabActiva === 'PENDIENTE_RELACIONAR' && '¡Excelente! Todas las facturas están relacionadas.'}
                {tabActiva === 'LISTAS_REVISION' && 'Las facturas aparecerán aquí cuando estén 100% relacionadas.'}
                {tabActiva === 'ENVIADAS' && 'Las facturas que envíes a Alegra se listarán en este historial.'}
              </p>
              {tabActiva === 'PENDIENTE_RELACIONAR' && (
                <button
                  onClick={() => setTabActiva('LISTAS_REVISION')}
                  className="mt-6 btn btn-primary text-lg px-8 py-3.5 rounded-xl shadow-md inline-flex items-center gap-2"
                >
                  Continuar al Paso 2: Revisar Precios →
                </button>
              )}
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
                    className="card hover:shadow-xl hover:border-blue-400 border-2 border-gray-200 transition-all cursor-pointer p-6 rounded-2xl bg-white mb-4"
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
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-2xl font-black text-gray-900">
                            Factura #{factura.numeroConsecutivo}
                          </h3>
                          {tabActiva === 'PENDIENTE_RELACIONAR' && (
                            <span className={`text-sm px-4 py-1.5 rounded-full font-bold text-white shadow-sm ${porcentajeRelacionado === 0 ? 'bg-red-500' :
                                porcentajeRelacionado < 100 ? 'bg-orange-500' :
                                  'bg-green-500'
                              }`}>
                              {porcentajeRelacionado}% Relacionada
                            </span>
                          )}
                          {tabActiva === 'LISTAS_REVISION' && (
                            <span className="text-sm px-4 py-1.5 bg-green-100 text-green-800 rounded-full font-bold shadow-sm">
                              Listo para Revisión
                            </span>
                          )}
                          {tabActiva === 'ENVIADAS' && (
                            <span className="text-sm px-4 py-1.5 bg-gray-100 text-gray-700 rounded-full font-bold shadow-sm">
                              Enviada a Alegra
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-base">
                          <div>
                            <p className="text-gray-500 font-semibold text-sm">Proveedor</p>
                            <p className="font-bold text-gray-900 text-lg leading-tight mt-0.5">{factura.proveedorNombre}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 font-semibold text-sm">Fecha</p>
                            <p className="font-semibold text-gray-900 text-lg mt-0.5">
                              {new Date(factura.fechaEmision).toLocaleDateString('es-CR')}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 font-semibold text-sm">Total Factura</p>
                            <p className="font-extrabold text-green-600 text-xl mt-0.5">
                              ₡{factura.totalFactura?.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 font-semibold text-sm">Productos</p>
                            <p className="font-bold text-gray-900 text-lg mt-0.5">
                              {totalProductos} {totalProductos === 1 ? 'producto' : 'productos'}
                              {tabActiva === 'PENDIENTE_RELACIONAR' && (
                                <span className="text-xs text-gray-500 block font-normal mt-0.5">
                                  ({relacionados} relacionados)
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex-shrink-0 mt-2 md:mt-0">
                        <button className="btn btn-primary w-full md:w-auto text-lg px-8 py-4 rounded-xl font-bold shadow-md">
                          {tabActiva === 'PENDIENTE_RELACIONAR' && 'Relacionar →'}
                          {tabActiva === 'LISTAS_REVISION' && 'Revisar →'}
                          {tabActiva === 'ENVIADAS' && 'Ver →'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Botones de Navegación Secuencial al Final de la Lista */}
          {!loading && (
            <div className="mt-8 pt-6 border-t-2 border-gray-200">
              {tabActiva === 'PENDIENTE_RELACIONAR' && facturas.length > 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setTabActiva('LISTAS_REVISION')}
                    className="btn btn-primary text-xl px-10 py-5 rounded-2xl shadow-xl flex items-center gap-3 transition-transform hover:scale-102"
                  >
                    Continuar al Paso 2: Revisar Precios →
                  </button>
                </div>
              )}

              {tabActiva === 'LISTAS_REVISION' && (
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                  <button
                    onClick={() => setTabActiva('PENDIENTE_RELACIONAR')}
                    className="btn btn-outline text-lg px-8 py-4 rounded-xl flex items-center gap-2"
                  >
                    ← Volver al Paso 1: Relacionar Productos
                  </button>
                  
                  <button
                    onClick={() => setTabActiva('ENVIADAS')}
                    className="text-blue-600 hover:text-blue-800 font-bold text-lg flex items-center gap-2 py-3 px-6 hover:bg-blue-50 rounded-xl transition-all"
                  >
                    📄 Ver Historial de Facturas Enviadas
                  </button>
                </div>
              )}

              {tabActiva === 'ENVIADAS' && (
                <div className="flex justify-start">
                  <button
                    onClick={() => setTabActiva('LISTAS_REVISION')}
                    className="btn btn-outline text-lg px-8 py-4 rounded-xl flex items-center gap-2"
                  >
                    ← Volver al Paso 2: Revisar Precios
                  </button>
                </div>
              )}
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
                        {producto.mapeo && (
                          <button
                            onClick={() => abrirFactor(producto)}
                            className="inline-flex items-center px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full font-bold text-xs border border-blue-250 transition active:scale-95 cursor-pointer"
                          >
                            <Settings size={12} className="mr-1" />
                            Factor
                          </button>
                        )}
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

                  {/* Comparativa de Costo, Venta y Ajuste */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-4 mt-6">
                    
                    {/* Tarjeta 1: Costo del Producto */}
                    <div className="bg-gray-50 border-2 border-gray-300 rounded-2xl p-5 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Costo por Unidad (con IVA)</span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-black text-gray-900">
                            ₡{(analisis.costoNuevoConIva || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        {analisis.costoAnterior > 0 && (
                          <div className="text-sm text-gray-600 mt-2">
                            Costo anterior: <strong>₡{(analisis.costoAnterior || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</strong>
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-4 pt-4 border-t-2 border-gray-200">
                        {analisis.cambioCosto !== 0 ? (
                          <span className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-base font-extrabold ${analisis.cambioCosto > 0
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-green-50 text-green-700 border border-green-200'
                            }`}>
                            {analisis.cambioCosto > 0 ? (
                              <>
                                <TrendingUp size={18} /> Costo subió +{analisis.cambioCosto.toFixed(1)}%
                              </>
                            ) : (
                              <>
                                <TrendingDown size={18} /> Costo bajó {analisis.cambioCosto.toFixed(1)}%
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-base font-bold">Costo sin cambios</span>
                        )}
                      </div>
                    </div>

                    {/* Tarjeta 2: Precio de Venta Actual */}
                    <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-bold text-blue-700 uppercase tracking-wider block mb-2">Precio de Venta Actual</span>
                        <div className="text-3xl font-black text-blue-900">
                          ₡{(analisis.precioVentaConIva || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-base text-blue-700 mt-1 font-bold">
                          ₡{(analisis.precioVentaSinIva || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })} (sin IVA)
                        </div>
                      </div>
                      
                      <div className="mt-4 pt-4 border-t-2 border-blue-200 flex items-center justify-between">
                        <span className="text-base font-bold text-blue-800">Margen Actual:</span>
                        <span className={`px-4 py-1.5 rounded-xl font-bold text-lg shadow-sm text-white ${analisis.margenActual < 15 ? 'bg-red-500' :
                            analisis.margenActual < 20 ? 'bg-yellow-500 text-gray-900' :
                              'bg-green-500'
                          }`}>
                          {analisis.margenActual.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Tarjeta 3: Ajuste de Precio */}
                    <div className={`${analisis.precioModificado ? 'bg-orange-50 border-orange-300' : 'bg-gray-50 border-gray-300'} border-2 rounded-2xl p-5 flex flex-col justify-between`}>
                      <div>
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">Nuevo Precio de Venta (sin IVA)</span>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-bold text-2xl">₡</span>
                          <input
                            type="number"
                            value={preciosAjustados[producto.id] !== undefined ? preciosAjustados[producto.id] : (analisis.precioVentaSinIva || 0)}
                            onChange={(e) => ajustarPrecio(producto.id, e.target.value)}
                            step="5"
                            min="0"
                            className="w-full pl-10 pr-20 py-3 text-right font-black text-2xl border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all bg-white"
                            placeholder="Precio sin IVA"
                            style={{ height: '56px' }}
                          />
                          <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-xs text-gray-400 font-extrabold uppercase">Sin IVA</span>
                        </div>
                        <div className="text-base text-gray-600 mt-2.5 font-bold flex justify-between">
                          <span>Con IVA:</span>
                          <span>₡{(analisis.precioAjustadoConIva || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t-2 border-gray-200 flex items-center justify-between">
                        <span className="text-base font-bold text-gray-700">Margen Nuevo:</span>
                        {analisis.precioModificado ? (
                          <span className={`px-4 py-1.5 rounded-xl font-bold text-lg shadow-sm text-white ${analisis.margenNuevo < 15 ? 'bg-red-500' :
                              analisis.margenNuevo < 20 ? 'bg-yellow-500 text-gray-900' :
                                'bg-green-500'
                            }`}>
                            {analisis.margenNuevo.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-400 font-extrabold">Sin cambios</span>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Fila de acción de precio sugerido si el margen nuevo/actual es menor al 20% */}
                  {analisis.margenNuevo < 20 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
                      <div className="text-base text-blue-900 font-bold">
                        💡 Precio Recomendado (Margen 20%): ₡{redondearPrecio(analisis.precioSugeridoSinIva).toLocaleString('es-CR')} sin IVA (₡{redondearPrecio(analisis.precioSugeridoConIva).toLocaleString('es-CR')} con IVA)
                      </div>
                      <button
                        onClick={() => aplicarPrecioSugerido(producto.id, analisis.precioSugeridoSinIva)}
                        className="btn bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-8 py-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-lg self-stretch sm:self-auto"
                      >
                        <TrendingUp size={20} />
                        Aplicar Precio Sugerido
                      </button>
                    </div>
                  )}
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

        {/* Modal Factor de Conversión */}
        {modalFactor && productoSeleccionadoFactor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-xl border border-gray-100 flex flex-col max-h-[85vh]">
              <div className="p-6 border-b border-gray-50 flex-shrink-0 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Factor de Conversión</h3>
                <button
                  onClick={() => setModalFactor(false)}
                  className="text-gray-400 hover:text-gray-600 transition cursor-pointer"
                >
                  <XCircle size={22} />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto flex-grow">
                {/* Info del producto */}
                <div className="bg-gray-50/70 p-5 rounded-2xl border border-gray-100">
                  <p className="text-xxs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Producto del proveedor</p>
                  <p className="font-semibold text-gray-900 text-sm leading-snug">{productoSeleccionadoFactor.descripcion}</p>
                  <p className="text-xs text-gray-500 mt-1">Relacionado con: <span className="font-medium text-gray-700">{productoSeleccionadoFactor.mapeo?.alegraName || productoSeleccionadoFactor.alegraName}</span></p>
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
                  disabled={guardandoFactor}
                  className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-sm active:scale-[0.98] transition flex-1 disabled:opacity-50 cursor-pointer"
                >
                  {guardandoFactor ? 'Guardando...' : 'Guardar Factor'}
                </button>
                <button
                  onClick={() => setModalFactor(false)}
                  className="px-5 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-sm transition flex-1 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
