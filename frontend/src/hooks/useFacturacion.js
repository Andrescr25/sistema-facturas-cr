import { useState, useEffect, useRef } from 'react'
import facturacionService from '../services/facturacionService'
import { alegraService } from '../services/alegraService'
import {
  getReference,
  normalizarImpuestos,
  ordenarImpuestos,
  seleccionarImpuestoPrincipal,
  calcularSubtotal,
  calcularImpuestos,
  calcularDescuentoGlobal,
  calcularTotal,
  detectarEsMobile,
  scrollElementIntoView
} from '../utils/facturacionUtils'

const RECORDATORIO_ACTUALIZACION_KEY = 'facturacion.recordatorio_actualizacion_fecha'
const DESCRIPCION_MAX = 500

/**
 * Estado y lógica de negocio completa de facturación en vivo: catálogo con
 * soporte offline, búsqueda/entrada rápida de productos y clientes, carrito
 * de la factura en curso, edición de facturas existentes (online/local
 * pendiente), y sincronización de facturas/ediciones pendientes cuando
 * vuelve la conexión. Extraído de Facturacion.jsx.
 *
 * Nota: esta página no tenía window.confirm/alert — su propio sistema de
 * `mensaje` (uno solo a la vez, con auto-ocultar) se preservó exactamente
 * igual, sin migrar a useToast(), por ser la página más crítica del
 * negocio y no requerir cambio funcional.
 */
export function useFacturacion() {
  // Estados principales
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncingCache, setSyncingCache] = useState(false)
  const [tabActiva, setTabActiva] = useState('nueva') // 'nueva' o 'editar'
  const [modoEdicion, setModoEdicion] = useState(false)
  const [facturaEditando, setFacturaEditando] = useState(null)

  // Estados de datos
  const [productos, setProductos] = useState([])
  const [clientes, setClientes] = useState([])
  const [impuestos, setImpuestos] = useState([])
  const [impuestoPrincipal, setImpuestoPrincipal] = useState(null)
  const [metodosPago, setMetodosPago] = useState([])
  const [facturasPendientes, setFacturasPendientes] = useState([])

  // Estados de factura actual
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [items, setItems] = useState([])
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [metodoPago, setMetodoPago] = useState('cash')
  const [observaciones, setObservaciones] = useState('')
  const [descuentoGlobal, setDescuentoGlobal] = useState(0)
  const [esElectronica, setEsElectronica] = useState(false)

  // Estados de búsqueda y entrada rápida
  const [codigoProducto, setCodigoProducto] = useState('')
  const [cantidadProducto, setCantidadProducto] = useState('')
  const [modoEntradaRapida, setModoEntradaRapida] = useState(true) // true = código, false = búsqueda
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [productosEncontrados, setProductosEncontrados] = useState([])
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [clientesEncontrados, setClientesEncontrados] = useState([])

  // Estados de búsqueda de facturas para edición
  const [busquedaFactura, setBusquedaFactura] = useState('')
  const [facturasPrecargadas, setFacturasPrecargadas] = useState([]) // Facturas precargadas del cache
  const [facturasEncontradas, setFacturasEncontradas] = useState([])
  const [buscandoFacturas, setBuscandoFacturas] = useState(false)
  const [edicionesPendientes, setEdicionesPendientes] = useState([])

  // Estados UI
  const [itemEditando, setItemEditando] = useState(null)
  const [mostrarBusquedaCliente, setMostrarBusquedaCliente] = useState(false)
  const [mostrarBusquedaProducto, setMostrarBusquedaProducto] = useState(false)
  const [cacheStats, setCacheStats] = useState(null)
  const [mensaje, setMensaje] = useState(null)
  const [mostrarRecordatorioActualizacion, setMostrarRecordatorioActualizacion] = useState(false)

  const [modalCantidadProducto, setModalCantidadProducto] = useState(false)
  const [productoSeleccionadoCantidad, setProductoSeleccionadoCantidad] = useState(null)
  const [cantidadSeleccionada, setCantidadSeleccionada] = useState('')
  const [productoPreviewRapido, setProductoPreviewRapido] = useState(null)

  // Detalles colapsables por item en el carrito de compras (móvil)
  const [mostrarDetalles, setMostrarDetalles] = useState({})
  const toggleDetalles = (itemId) => {
    setMostrarDetalles(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }))
  }

  // Referencias
  const codigoInputRef = useRef(null)
  const cantidadInputRef = useRef(null)
  const busquedaProductoInputRef = useRef(null)
  const cantidadMovilInputRef = useRef(null)
  const clienteCardRef = useRef(null)
  const productoCardRef = useRef(null)

  const enfocarYMostrarBusquedaProducto = () => {
    setTimeout(() => {
      if (modoEntradaRapida && !isMobile) {
        codigoInputRef.current?.focus()
      } else {
        busquedaProductoInputRef.current?.focus()
      }
      scrollElementIntoView(productoCardRef, 'center')
    }, 150)
  }

  const prepararImpuestosIniciales = (lista = []) => {
    const normalizados = normalizarImpuestos(lista)
    const ordenados = ordenarImpuestos(normalizados)
    setImpuestos(ordenados)
    setImpuestoPrincipal(seleccionarImpuestoPrincipal(ordenados))
  }

  // Detectar tipo de dispositivo (mejorado con mejor detección)
  useEffect(() => {
    const checkDevice = () => {
      const mobile = detectarEsMobile()
      setIsMobile(mobile)

      // Agregar clase al body para estilos globales
      if (mobile) {
        document.body.classList.add('mobile-device')
        document.body.classList.remove('desktop-device')
        document.body.classList.add('touch-device')
      } else {
        document.body.classList.add('desktop-device')
        document.body.classList.remove('mobile-device')
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
          document.body.classList.add('touch-device')
        }
      }
    }

    checkDevice()
    window.addEventListener('resize', checkDevice)
    window.addEventListener('orientationchange', checkDevice)

    return () => {
      window.removeEventListener('resize', checkDevice)
      window.removeEventListener('orientationchange', checkDevice)
    }
  }, [])

  // Inicializar servicio y cargar datos
  useEffect(() => {
    const init = async () => {
      await inicializarServicio()
      // Cargar ediciones pendientes y facturas precargadas después de inicializar el servicio
      try {
        const [ediciones] = await Promise.all([
          facturacionService.getEdicionesPendientes(),
          cargarFacturasPrecargadas() // Cargar facturas precargadas al inicio
        ])
        setEdicionesPendientes(ediciones)
      } catch (error) {
        console.error('Error cargando datos iniciales:', error)
      }
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listeners de conexión
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      mostrarMensaje('Conexión restablecida. Sincronizando...', 'success')
      sincronizarFacturas()
    }

    const handleOffline = () => {
      setIsOnline(false)
      mostrarMensaje('Sin conexión. Modo offline activado.', 'warning')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-focus en código cuando cambia el modo (solo en desktop)
  useEffect(() => {
    if (modoEntradaRapida && codigoInputRef.current && !isMobile) {
      codigoInputRef.current.focus()
    }
  }, [modoEntradaRapida, isMobile])

  // Focus con delay en modal de cantidad (evita que el teclado tape el modal)
  useEffect(() => {
    if (modalCantidadProducto && cantidadMovilInputRef.current) {
      // Esperar a que termine la animación del modal (400ms)
      const timer = setTimeout(() => {
        if (cantidadMovilInputRef.current) {
          cantidadMovilInputRef.current.focus()
          cantidadMovilInputRef.current.select()
        }
      }, 400)

      return () => clearTimeout(timer)
    }
  }, [modalCantidadProducto])

  // Auto-focus y auto-scroll a productos cuando se selecciona un cliente
  useEffect(() => {
    if (clienteSeleccionado) {
      setTimeout(() => {
        if (modoEntradaRapida && codigoInputRef.current && !isMobile) {
          codigoInputRef.current.focus()
        } else if (busquedaProductoInputRef.current) {
          busquedaProductoInputRef.current.focus()
        }
        scrollElementIntoView(productoCardRef, 'center')
      }, 300)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteSeleccionado, modoEntradaRapida, isMobile])

  useEffect(() => {
    if (!impuestoPrincipal && impuestos.length > 0) {
      setImpuestoPrincipal(seleccionarImpuestoPrincipal(impuestos))
    }
  }, [impuestos, impuestoPrincipal])

  // Cambiar automáticamente a búsqueda en móvil
  useEffect(() => {
    if (isMobile && modoEntradaRapida) {
      setModoEntradaRapida(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile])

  useEffect(() => {
    const hoy = new Date()
    const dia = hoy.getDay() // 0 = domingo, 1 = lunes
    if (dia === 0 || dia === 1) {
      // Calcular el domingo más reciente de este ciclo de fin de semana
      const ultimoDomingo = new Date(hoy)
      ultimoDomingo.setDate(hoy.getDate() - dia) // Si es lunes (1), retrocede al domingo. Si es domingo (0), queda igual.
      ultimoDomingo.setHours(0, 0, 0, 0)

      const fechaUltimaActualizacionStr = localStorage.getItem(RECORDATORIO_ACTUALIZACION_KEY)
      if (fechaUltimaActualizacionStr) {
        const fechaUltimaActualizacion = new Date(fechaUltimaActualizacionStr)
        // Si la última actualización ocurrió antes del domingo de esta semana, mostrar recordatorio
        if (fechaUltimaActualizacion < ultimoDomingo) {
          setMostrarRecordatorioActualizacion(true)
        }
      } else {
        // Si nunca se ha guardado una actualización, mostrar
        setMostrarRecordatorioActualizacion(true)
      }
    }
  }, [])

  // Función para cargar facturas precargadas (definida antes de los useEffect que la llaman)
  const cargarFacturasPrecargadas = async () => {
    try {
      setBuscandoFacturas(true)
      const facturas = await facturacionService.getFacturasPrecargadas()
      setFacturasPrecargadas(facturas)
      setFacturasEncontradas(facturas) // Mostrar todas inicialmente
    } catch (error) {
      console.error('Error cargando facturas precargadas:', error)
      mostrarMensaje('Error cargando facturas: ' + error.message, 'error')
      setFacturasPrecargadas([])
      setFacturasEncontradas([])
    } finally {
      setBuscandoFacturas(false)
    }
  }

  const refrescarFacturasLocales = async () => {
    try {
      const facturas = await facturacionService.getFacturasPrecargadas()
      setFacturasPrecargadas(facturas)
      if (!busquedaFactura) {
        setFacturasEncontradas(facturas)
      }
    } catch (error) {
      console.error('Error refrescando facturas locales:', error)
    }
  }

  const descartarEdicionPendiente = async (localId, facturaId) => {
    try {
      await facturacionService.eliminarEdicionPendiente(localId, facturaId)
      const ediciones = await facturacionService.getEdicionesPendientes()
      setEdicionesPendientes(ediciones)
      mostrarMensaje('Edición descartada', 'info', 3000)
      await refrescarFacturasLocales()
    } catch (error) {
      console.error('Error descartando edición pendiente:', error)
      mostrarMensaje('Error descartando edición: ' + error.message, 'error')
    }
  }

  const inicializarServicio = async () => {
    try {
      setLoading(true)

      // Inicializar servicio
      await facturacionService.init()

      // Cargar datos del cache
      const [productosCache, clientesCache, impuestosData, metodosPagoData, pendientes, stats] = await Promise.all([
        facturacionService.getProductos(),
        facturacionService.getClientes(),
        facturacionService.getImpuestos(),
        facturacionService.getMetodosPago(),
        facturacionService.getFacturasPendientes(),
        facturacionService.getCacheStats()
      ])

      setProductos(productosCache)
      setClientes(clientesCache)
      prepararImpuestosIniciales(impuestosData)
      setMetodosPago(metodosPagoData)
      setFacturasPendientes(pendientes)
      setCacheStats(stats)

      // Si no hay datos en cache, intentar descargarlos
      if (productosCache.length === 0 || clientesCache.length === 0) {
        if (isOnline) {
          mostrarMensaje('Descargando catálogo por primera vez...', 'info')
          await actualizarCache()
        } else {
          mostrarMensaje('Sin datos en cache y sin conexión. Por favor conectate a internet.', 'error')
        }
      }
    } catch (error) {
      console.error('Error inicializando servicio:', error)
      mostrarMensaje('Error inicializando sistema: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const actualizarCache = async () => {
    try {
      setSyncingCache(true)
      mostrarMensaje('Actualizando catálogo...', 'info')

      const resultado = await facturacionService.actualizarTodoCache()

      // Recargar datos del cache (incluyendo facturas precargadas)
      const [productosCache, clientesCache, stats] = await Promise.all([
        facturacionService.getProductos(),
        facturacionService.getClientes(),
        facturacionService.getCacheStats(),
        cargarFacturasPrecargadas() // Recargar facturas precargadas
      ])

      setProductos(productosCache)
      setClientes(clientesCache)
      setCacheStats(stats)

      mostrarMensaje(`Catálogo actualizado: ${resultado.productos} productos, ${resultado.clientes} clientes, ${resultado.facturas} facturas`, 'success')

      // Ocultar recordatorio guardando la fecha y hora de la actualización
      localStorage.setItem(RECORDATORIO_ACTUALIZACION_KEY, new Date().toISOString())
      setMostrarRecordatorioActualizacion(false)
    } catch (error) {
      console.error('Error actualizando cache:', error)
      mostrarMensaje('Error actualizando catálogo: ' + error.message, 'error')
    } finally {
      setSyncingCache(false)
    }
  }

  const sincronizarFacturas = async () => {
    try {
      const resultado = await facturacionService.sincronizarFacturasPendientes()

      // Recargar pendientes
      const pendientes = await facturacionService.getFacturasPendientes()
      setFacturasPendientes(pendientes)

      if (resultado.sincronizadas > 0) {
        mostrarMensaje(`${resultado.sincronizadas} factura(s) sincronizada(s)`, 'success')
      }

      await sincronizarEdiciones()
      await refrescarFacturasLocales()
    } catch (error) {
      console.error('Error sincronizando:', error)
    }
  }

  const ocultarRecordatorioActualizacion = () => {
    const fechaHoy = new Date().toISOString().split('T')[0]
    localStorage.setItem(RECORDATORIO_ACTUALIZACION_KEY, fechaHoy)
    setMostrarRecordatorioActualizacion(false)
  }

  const sincronizarEdiciones = async () => {
    try {
      const resultado = await facturacionService.sincronizarEdicionesPendientes()
      const ediciones = await facturacionService.getEdicionesPendientes()
      setEdicionesPendientes(ediciones)

      if (resultado.sincronizadas > 0) {
        mostrarMensaje(`${resultado.sincronizadas} edición(es) sincronizada(s)`, 'success')
      }

      await refrescarFacturasLocales()
    } catch (error) {
      console.error('Error sincronizando ediciones:', error)
    }
  }

  useEffect(() => {
    if (!isOnline || edicionesPendientes.length === 0) return
    sincronizarEdiciones()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, edicionesPendientes.length])

  const buscarProductoPorCodigo = async (codigo) => {
    if (!codigo.trim()) return null

    try {
      const producto = await facturacionService.buscarProductoPorCodigo(codigo.trim())
      return producto
    } catch (error) {
      console.error('Error buscando producto:', error)
      return null
    }
  }

  const buscarProductosPorNombre = async (nombre) => {
    if (!nombre || nombre.length < 2) {
      setProductosEncontrados([])
      return
    }

    try {
      const encontrados = await facturacionService.buscarProductosPorNombre(nombre)
      setProductosEncontrados(encontrados.slice(0, 10)) // Máximo 10 resultados
    } catch (error) {
      console.error('Error buscando productos:', error)
      setProductosEncontrados([])
    }
  }

  const buscarClientesPorNombre = async (nombre) => {
    if (!nombre || nombre.length < 2) {
      setClientesEncontrados([])
      return
    }

    try {
      const encontrados = await facturacionService.buscarClientesPorNombre(nombre)
      setClientesEncontrados(encontrados.slice(0, 10))
    } catch (error) {
      console.error('Error buscando clientes:', error)
      setClientesEncontrados([])
    }
  }

  const buscarFacturas = async (termino) => {
    if (!termino || termino.length < 2) {
      // Si no hay búsqueda, mostrar todas las facturas precargadas
      setFacturasEncontradas(facturasPrecargadas)
      return
    }

    try {
      setBuscandoFacturas(true)

      // Primero buscar en las facturas precargadas (offline)
      const terminoLower = termino.toLowerCase()
      let facturasLocales = facturasPrecargadas.filter(factura => {
        const numero = factura.numberTemplate?.fullNumber?.toString().toLowerCase() || ''
        const cliente = factura.client?.name?.toLowerCase() || ''
        return numero.includes(terminoLower) || cliente.includes(terminoLower)
      })

      // Si hay conexión, también buscar online
      if (isOnline) {
        try {
          const facturasOnline = await facturacionService.buscarFacturas({ numero: termino })

          // Combinar resultados evitando duplicados
          const idsLocales = new Set(facturasLocales.map(f => f.id))
          const facturasNuevas = facturasOnline.filter(f => !idsLocales.has(f.id))
          facturasLocales = [...facturasLocales, ...facturasNuevas]
        } catch (error) {
          console.warn('⚠️ Error buscando online, mostrando solo resultados locales:', error.message)
        }
      }

      setFacturasEncontradas(facturasLocales.slice(0, 20)) // Mostrar hasta 20 resultados
    } catch (error) {
      console.error('Error buscando facturas:', error)
      mostrarMensaje('Error buscando facturas: ' + error.message, 'error')
      setFacturasEncontradas([])
    } finally {
      setBuscandoFacturas(false)
    }
  }

  const cargarFacturaParaEdicion = async (factura) => {
    try {
      setLoading(true)

      // Obtener detalles completos de la factura
      let facturaCompleta = factura
      const esLocal = typeof factura.id === 'string' && factura.id.startsWith('local-')

      if (!esLocal) {
        facturaCompleta = await facturacionService.getFacturaById(factura.id)
      }

      if (!facturaCompleta && esLocal) {
        facturaCompleta = await facturacionService.getFacturaById(factura.id)
      }

      if (!facturaCompleta) {
        mostrarMensaje('No se pudo cargar la factura', 'error')
        return
      }

      if (esLocal && !facturaCompleta.localId) {
        facturaCompleta.localId = parseInt(factura.id.replace('local-', ''), 10)
        facturaCompleta.pendienteSincronizar = true
      }

      // Cargar datos en el formulario
      setFacturaEditando(facturaCompleta)
      setModoEdicion(true)

      // Cliente
      if (facturaCompleta.client) {
        setClienteSeleccionado(facturaCompleta.client)
      }

      // Items
      if (facturaCompleta.items && facturaCompleta.items.length > 0) {
        const itemsFormateados = facturaCompleta.items.map(item => ({
          id: item.id,
          reference: getReference(item.reference),
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          tax: item.tax || [],
          discount: item.discount || 0,
          description: typeof item.description === 'string'
            ? item.description.slice(0, DESCRIPCION_MAX)
            : ''
        }))
        setItems(itemsFormateados)
      }

      // Fecha
      if (facturaCompleta.date) {
        setFecha(facturaCompleta.date)
      }

      // Observaciones
      if (facturaCompleta.observations) {
        setObservaciones(facturaCompleta.observations)
      }

      // Descuento global (si existe en la factura)
      if (facturaCompleta.discount) {
        setDescuentoGlobal(parseFloat(facturaCompleta.discount) || 0)
      }

      // Cambiar a la pestaña de nueva/editar para mostrar el formulario
      setTabActiva('nueva')
      setBusquedaFactura('')
      setFacturasEncontradas([])

      mostrarMensaje(`Factura ${facturaCompleta.numberTemplate?.fullNumber || facturaCompleta.id} cargada para edición`, 'success')
    } catch (error) {
      console.error('Error cargando factura:', error)
      mostrarMensaje('Error cargando factura: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCodigoKeyPress = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()

      setProductoPreviewRapido(null) // Limpiar previa anterior

      const producto = await buscarProductoPorCodigo(codigoProducto)

      if (producto) {
        setProductoPreviewRapido(producto) // Cargar previa
        // Producto encontrado, pasar a cantidad (vacío para que el usuario ingrese)
        setCantidadProducto('')
        setTimeout(() => {
          cantidadInputRef.current?.focus()
          cantidadInputRef.current?.select() // Seleccionar todo el contenido
        }, 50)
      } else {
        mostrarMensaje(`Producto "${codigoProducto}" no encontrado`, 'error')
        setCodigoProducto('')
      }
    }
  }

  const handleCantidadKeyPress = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()

      // Utilizar el producto ya cargado en la previa o buscarlo como fallback
      const producto = productoPreviewRapido || await buscarProductoPorCodigo(codigoProducto)
      const cantidad = parseInt(cantidadProducto) || 0

      if (producto && cantidad > 0) {
        agregarProductoAFactura(producto, cantidad)

        // Limpiar y volver al código con scroll
        setCodigoProducto('')
        setCantidadProducto('')
        setProductoPreviewRapido(null)
        setTimeout(() => {
          codigoInputRef.current?.focus()
          scrollElementIntoView(productoCardRef, 'center')
        }, 50)
      } else if (producto && cantidad <= 0) {
        mostrarMensaje('La cantidad debe ser mayor a 0', 'warning')
        cantidadInputRef.current?.select()
      }
    }
  }

  const abrirModalCantidadProducto = (producto) => {
    setProductoSeleccionadoCantidad(producto)
    setCantidadSeleccionada('1')
    setModalCantidadProducto(true)
    setBusquedaProducto('')
    setProductosEncontrados([])
  }

  const confirmarCantidadProducto = () => {
    const cantidad = parseInt(cantidadSeleccionada) || 1
    if (cantidad > 0 && productoSeleccionadoCantidad) {
      agregarProductoAFactura(productoSeleccionadoCantidad, cantidad)
      setModalCantidadProducto(false)
      setProductoSeleccionadoCantidad(null)
      setCantidadSeleccionada('')

      // Enfocar el input de búsqueda y centrar tarjeta de productos
      enfocarYMostrarBusquedaProducto()
    } else {
      mostrarMensaje('La cantidad debe ser mayor a 0', 'warning')
    }
  }

  const cerrarModalCantidadProducto = () => {
    setModalCantidadProducto(false)
    setProductoSeleccionadoCantidad(null)
    setCantidadSeleccionada('')
    enfocarYMostrarBusquedaProducto()
  }

  const agregarProductoAFactura = (producto, cantidad) => {
    // Verificar si ya existe
    const existente = items.find(item => item.id === producto.id)

    if (existente) {
      // Actualizar cantidad y mover al principio
      const itemActualizado = { ...existente, quantity: existente.quantity + cantidad }
      setItems([itemActualizado, ...items.filter(item => item.id !== producto.id)])
    } else {
      // Agregar nuevo al principio
      const impuestoDefault = impuestoPrincipal
        ? [{
          id: impuestoPrincipal.id,
          percentage: Number(impuestoPrincipal.percentage) || 0,
          name: impuestoPrincipal.name,
          type: impuestoPrincipal.type
        }]
        : []

      const nuevoItem = {
        id: producto.id,
        reference: getReference(producto.reference),
        name: producto.name,
        quantity: cantidad,
        price: producto.price || 0,
        tax: impuestoDefault,
        discount: 0,
        description: ''
      }

      setItems([nuevoItem, ...items])
    }

    mostrarMensaje(`${producto.name} agregado (${cantidad})`, 'success', 2000)
  }

  const eliminarItem = (index) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const actualizarCantidadItem = (index, cantidad) => {
    // Permitir valores vacíos temporalmente mientras el usuario edita
    const nuevaCantidad = cantidad === '' ? '' : (parseInt(cantidad) || 1)

    setItems(prevItems => prevItems.map((item, i) =>
      i === index ? { ...item, quantity: nuevaCantidad } : item
    ))
  }

  const validarCantidadItem = (index) => {
    // Al perder foco, validar que la cantidad sea válida
    setItems(prevItems => prevItems.map((item, i) => {
      if (i === index) {
        const cantidad = parseInt(item.quantity) || 1
        return { ...item, quantity: cantidad >= 1 ? cantidad : 1 }
      }
      return item
    }))
  }

  const actualizarPrecioItem = (index, precio) => {
    const nuevoPrecio = parseFloat(precio) || 0
    setItems(items.map((item, i) =>
      i === index ? { ...item, price: nuevoPrecio } : item
    ))
  }

  const actualizarDescuentoItem = (index, descuento) => {
    const nuevoDescuento = parseFloat(descuento) || 0
    setItems(items.map((item, i) =>
      i === index ? { ...item, discount: nuevoDescuento } : item
    ))
  }

  const actualizarDescripcionItem = (index, descripcion) => {
    const texto = (descripcion || '').slice(0, DESCRIPCION_MAX)
    setItems(items.map((item, i) =>
      i === index ? { ...item, description: texto } : item
    ))
  }

  const finalizarFactura = async () => {
    // Validaciones
    if (!clienteSeleccionado) {
      mostrarMensaje('Debes seleccionar un cliente', 'error')
      return
    }

    if (items.length === 0) {
      mostrarMensaje('Debes agregar al menos un producto', 'error')
      return
    }

    try {
      setLoading(true)

      // Preparar datos según formato Alegra
      const facturaData = {
        date: fecha,
        dueDate: fecha, // Misma fecha por defecto
        client: parseInt(clienteSeleccionado.id),
        items: items.map(item => ({
          id: parseInt(item.id),
          reference: item.reference || '', // Campo reference
          quantity: Number(item.quantity) || 0,
          price: Number(item.price) || 0,
          discount: item.discount || 0,
          description: (item.description && item.description.trim()
            ? item.description.trim()
            : '' // Si no hay descripción, dejar vacío
          )?.slice(0, DESCRIPCION_MAX),
          tax: (item.tax || []).map(t => ({ id: t.id }))
        })),
        observations: observaciones || '',
        status: 'open',
        ...(esElectronica && { stamp: { generateStamp: true } })
      }

      // Guardar con descuento global si existe
      if (descuentoGlobal > 0) {
        facturaData.discount = descuentoGlobal
      }

      const itemsVista = items.map(item => ({
        id: item.id,
        name: item.name,
        reference: item.reference,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount || 0,
        description: (item.description || '').slice(0, DESCRIPCION_MAX),
        tax: item.tax || []
      }))

      const facturaVista = {
        id: facturaEditando?.id || null,
        localId: facturaEditando?.localId || null,
        cliente: clienteSeleccionado,
        items: itemsVista,
        total: calcularTotal(items, descuentoGlobal, impuestoPrincipal, impuestos),
        numberTemplate: facturaEditando?.numberTemplate || null,
        observaciones,
        date: fecha,
        estado: facturaEditando?.status || 'open'
      }

      if (!facturaVista.numberTemplate) {
        const numeroTemporal = `LOCAL-${Date.now()}`
        facturaVista.numberTemplate = { fullNumber: numeroTemporal }
        facturaVista.numeroTemporal = numeroTemporal
      }

      let resultado
      const esFacturaLocalPendiente = modoEdicion && (
        facturaEditando?.pendienteSincronizar ||
        (typeof facturaEditando?.id === 'string' && facturaEditando.id.startsWith('local-'))
      )
      const localIdEdicion = facturaEditando?.localId ||
        (typeof facturaEditando?.id === 'string' && facturaEditando.id.startsWith('local-')
          ? parseInt(facturaEditando.id.replace('local-', ''), 10)
          : null)

      if (modoEdicion && esFacturaLocalPendiente && localIdEdicion) {
        if (facturacionService.isConnected()) {
          resultado = await facturacionService.enviarFacturaPendiente(localIdEdicion, facturaData, facturaVista)
        } else {
          resultado = await facturacionService.actualizarFacturaPendiente(localIdEdicion, facturaData, facturaVista)
        }
      } else if (modoEdicion && facturaEditando) {
        resultado = await facturacionService.editarFactura(facturaEditando.id, facturaData, facturaVista)
      } else {
        // Crear factura nueva
        resultado = await facturacionService.crearFactura(facturaData, facturaVista)
      }

      if (resultado.success) {
        const numeroFacturaDisplay = modoEdicion
          ? (facturaEditando?.numberTemplate?.fullNumber ||
            facturaVista.numberTemplate?.fullNumber ||
            facturaEditando?.id)
          : (resultado.data?.numberTemplate?.fullNumber ||
            facturaVista.numberTemplate?.fullNumber ||
            resultado.data?.id)

        const mensajeTexto = modoEdicion
          ? (resultado.online
            ? `✅ Factura #${numeroFacturaDisplay} editada exitosamente`
            : `💾 Edición guardada localmente. Se sincronizará cuando haya conexión.`)
          : (resultado.online
            ? `✅ Factura #${numeroFacturaDisplay} creada exitosamente`
            : `💾 Factura guardada localmente. Se sincronizará cuando haya conexión.`)

        mostrarMensaje(mensajeTexto, 'success', 5000)

        // Visualizar PDF desde Alegra (solo si se creó/editó online y no está en modo edición)
        if (resultado.online && resultado.data?.id) {
          try {
            await alegraService.visualizarPDFFactura(resultado.data.id)
            mostrarMensaje('📄 PDF abierto en nueva pestaña', 'success', 2000)
          } catch (pdfError) {
            console.error('❌ Error visualizando PDF desde Alegra:', pdfError)
            console.error('❌ Stack:', pdfError.stack)
            mostrarMensaje('⚠️ Error abriendo PDF. La factura fue creada correctamente.', 'warning', 3000)
          }
        } else if (!resultado.online) {
          mostrarMensaje('ℹ️ El PDF estará disponible cuando la factura se sincronice con Alegra', 'info', 4000)
        } else {
          console.warn('⚠️ No se puede mostrar PDF: online=', resultado.online, 'id=', resultado.data?.id)
        }

        // Limpiar formulario
        limpiarFactura()

        // Actualizar pendientes si es offline
        if (!resultado.online) {
          if (esFacturaLocalPendiente || !modoEdicion) {
            const pendientes = await facturacionService.getFacturasPendientes()
            setFacturasPendientes(pendientes)
          } else {
            const ediciones = await facturacionService.getEdicionesPendientes()
            setEdicionesPendientes(ediciones)
          }
        } else {
          const pendientes = await facturacionService.getFacturasPendientes()
          setFacturasPendientes(pendientes)
          const ediciones = await facturacionService.getEdicionesPendientes()
          setEdicionesPendientes(ediciones)
        }

        await refrescarFacturasLocales()
      }
    } catch (error) {
      console.error('Error creando factura:', error)
      mostrarMensaje('Error creando factura: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const limpiarFactura = () => {
    setClienteSeleccionado(null)
    setItems([])
    setFecha(new Date().toISOString().split('T')[0])
    setMetodoPago('cash')
    setObservaciones('')
    setDescuentoGlobal(0)
    setEsElectronica(false)
    setCodigoProducto('')
    setCantidadProducto('')
    setProductoPreviewRapido(null)
    setBusquedaCliente('')
    setClientesEncontrados([])
    setModoEdicion(false)
    setFacturaEditando(null)
  }

  const mostrarMensaje = (texto, tipo = 'info', duracion = 3000) => {
    setMensaje({ texto, tipo })
    setTimeout(() => setMensaje(null), duracion)
  }

  const deseleccionarCliente = () => {
    setClienteSeleccionado(null)
    setItems([]) // Limpiar items si cambia cliente
  }

  // --- Búsqueda de cliente (paso 1) ---
  const cambiarBusquedaCliente = (val) => {
    setBusquedaCliente(val)
    buscarClientesPorNombre(val)
    if (val && !busquedaCliente) {
      scrollElementIntoView(clienteCardRef)
    }
  }

  const focusBusquedaCliente = () => {
    setTimeout(() => {
      scrollElementIntoView(clienteCardRef)
    }, 150)
  }

  const limpiarBusquedaCliente = () => {
    setBusquedaCliente('')
    setClientesEncontrados([])
  }

  const seleccionarCliente = (cliente) => {
    setClienteSeleccionado(cliente)
    setBusquedaCliente('')
    setClientesEncontrados([])
  }

  // --- Entrada rápida / búsqueda de producto ---
  const cambiarCodigoProducto = (val) => {
    setCodigoProducto(val)
    setProductoPreviewRapido(null)
    if (val && !codigoProducto) {
      scrollElementIntoView(productoCardRef)
    }
  }

  const focusCodigoProducto = () => {
    setTimeout(() => {
      scrollElementIntoView(productoCardRef)
    }, 150)
  }

  const cambiarBusquedaProducto = (val) => {
    setBusquedaProducto(val)
    buscarProductosPorNombre(val)
    if (val && !busquedaProducto) {
      scrollElementIntoView(productoCardRef)
    }
  }

  const focusBusquedaProducto = () => {
    setTimeout(() => {
      scrollElementIntoView(productoCardRef)
    }, 150)
  }

  const limpiarBusquedaProducto = () => {
    setBusquedaProducto('')
    setProductosEncontrados([])
  }

  // --- Búsqueda de facturas (pestaña Editar) ---
  const cambiarBusquedaFactura = (val) => {
    setBusquedaFactura(val)
    buscarFacturas(val)
  }

  const limpiarBusquedaFactura = () => {
    setBusquedaFactura('')
    setFacturasEncontradas(facturasPrecargadas) // Volver a mostrar todas
  }

  const cambiarTab = (tab) => {
    if (tab === 'nueva') {
      setTabActiva('nueva')
      if (modoEdicion) {
        limpiarFactura()
      }
    } else {
      setTabActiva('editar')
      limpiarFactura()
    }
  }

  return {
    // Estado principal
    isOnline,
    isMobile,
    loading,
    syncingCache,
    tabActiva,
    cambiarTab,
    modoEdicion,
    facturaEditando,

    // Datos
    productos,
    clientes,
    facturasPendientes,

    // Factura actual
    clienteSeleccionado,
    setClienteSeleccionado,
    deseleccionarCliente,
    items,
    DESCRIPCION_MAX,
    descuentoGlobal,
    observaciones,
    setObservaciones,

    // Búsqueda y entrada rápida
    codigoProducto,
    setCodigoProducto,
    cantidadProducto,
    setCantidadProducto,
    modoEntradaRapida,
    setModoEntradaRapida,
    busquedaProducto,
    setBusquedaProducto,
    productosEncontrados,
    busquedaCliente,
    setBusquedaCliente,
    clientesEncontrados,

    // Búsqueda de facturas para edición
    busquedaFactura,
    setBusquedaFactura,
    facturasPrecargadas,
    facturasEncontradas,
    setFacturasEncontradas,
    buscandoFacturas,
    edicionesPendientes,

    // UI
    cacheStats,
    mensaje,
    mostrarRecordatorioActualizacion,
    ocultarRecordatorioActualizacion,

    modalCantidadProducto,
    setModalCantidadProducto,
    productoSeleccionadoCantidad,
    setProductoSeleccionadoCantidad,
    cantidadSeleccionada,
    setCantidadSeleccionada,
    productoPreviewRapido,

    mostrarDetalles,
    toggleDetalles,

    // Refs
    codigoInputRef,
    cantidadInputRef,
    busquedaProductoInputRef,
    cantidadMovilInputRef,
    clienteCardRef,
    productoCardRef,
    scrollElementIntoView,
    enfocarYMostrarBusquedaProducto,

    // Acciones
    actualizarCache,
    descartarEdicionPendiente,
    buscarProductosPorNombre,
    buscarClientesPorNombre,
    buscarFacturas,
    cargarFacturaParaEdicion,
    handleCodigoKeyPress,
    handleCantidadKeyPress,
    abrirModalCantidadProducto,
    confirmarCantidadProducto,
    cerrarModalCantidadProducto,

    // Búsqueda compuesta (setter + trigger + scroll), replican el
    // comportamiento inline exacto del componente original
    cambiarBusquedaCliente,
    focusBusquedaCliente,
    limpiarBusquedaCliente,
    seleccionarCliente,
    cambiarCodigoProducto,
    focusCodigoProducto,
    cambiarBusquedaProducto,
    focusBusquedaProducto,
    limpiarBusquedaProducto,
    cambiarBusquedaFactura,
    limpiarBusquedaFactura,

    eliminarItem,
    actualizarCantidadItem,
    validarCantidadItem,
    actualizarPrecioItem,
    actualizarDescuentoItem,
    actualizarDescripcionItem,
    finalizarFactura,
    limpiarFactura,

    // Cálculos (para el resumen de totales)
    calcularSubtotal: () => calcularSubtotal(items),
    calcularImpuestos: () => calcularImpuestos(items, impuestoPrincipal, impuestos),
    calcularDescuentoGlobal: () => calcularDescuentoGlobal(items, descuentoGlobal),
    calcularTotal: () => calcularTotal(items, descuentoGlobal, impuestoPrincipal, impuestos),
    impuestoPrincipal
  }
}
