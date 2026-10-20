import { useState, useEffect, useRef, useMemo } from 'react'
import api from '../services/api'
import useDescuentoClienteFacturacion from './useDescuentoClienteFacturacion'
import useLineasFacturacion from './useLineasFacturacion'
import { hoyEnCostaRica } from '../utils/fechaCR'
import { combinarBusqueda } from '../utils/facturasLocales'
import facturacionService from '../services/facturacionService'
import { abrirPdfFacturaPropia } from '../services/facturaPdf'
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
  scrollElementIntoView,
  enriquecerFacturasPendientes,
  idPropioDelCliente,
  sugerenciasDelCatalogo
} from '../utils/facturacionUtils'

const RECORDATORIO_ACTUALIZACION_KEY = 'facturacion.recordatorio_actualizacion_fecha'
const DESCRIPCION_MAX = 500
const REINTENTO_PENDIENTES_INTERVALO = 2 * 60 * 1000 // 2 minutos

/**
 * Cuántos resultados de búsqueda se muestran.
 *
 * Eran 10, y en un catálogo de dos mil productos eso escondía cosas sin
 * avisar: buscar "anzuelo" devuelve 26 y solo se veían los primeros diez,
 * sin nada que dijera que faltaban dieciséis. Quien buscaba daba por hecho
 * que el resto no existía.
 *
 * Tampoco se quita el tope del todo. Los términos cortos son masivos —"an"
 * cae en 565 productos, "ca" en 456— y pintar eso en cada tecla arrastra la
 * tableta del mostrador. Cien cubre cualquier búsqueda real (la más grande
 * medida fue "bolsa", con 81) y deja acotado el caso patológico.
 *
 * Lo que no puede volver a pasar es que sobre y no se diga: cuando hay más
 * de los que caben, la pantalla lo dice.
 */
const MAX_RESULTADOS = 100

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
  // Cómo paga el cliente ESTA venta. No es la condición de venta del
  // documento: un cliente con crédito puede pagar de una, y uno de contado
  // puede quedar debiendo.
  // Los descuentos de exceso vivos, por id de producto. Se cargan con los
  // catálogos porque hacen falta justo al agregar una línea.
  const [ofertas, setOfertas] = useState(new Map())
  const [metodosPago, setMetodosPago] = useState([])
  const [metodoPagoId, setMetodoPagoId] = useState(null)
  const [referenciaPago, setReferenciaPago] = useState('')
  const [impuestoPrincipal, setImpuestoPrincipal] = useState(null)
  const [facturasPendientes, setFacturasPendientes] = useState([])
  const [reintentandoLocalId, setReintentandoLocalId] = useState(null)

  // Estados de factura actual
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [ciclosCliente, setCiclosCliente] = useState([])
  const [cicloId, setCicloId] = useState('sin-ciclo')
  const [cargandoCiclos, setCargandoCiclos] = useState(false)
  const [errorCiclos, setErrorCiclos] = useState('')
  useEffect(() => { setCicloId(''); setCiclosCliente([]) }, [clienteSeleccionado?.id])
  useEffect(() => {
    let vigente = true
    setErrorCiclos('')
    if (modoEdicion) {
      const c = facturaEditando?.ciclo
      setCiclosCliente(c ? [c] : []); setCicloId(c ? String(c.id) : c === null ? 'sin-ciclo' : 'sin-descargar'); setCargandoCiclos(false)
      return () => { vigente = false }
    }
    if (!clienteSeleccionado) { setCicloId('sin-ciclo'); setCargandoCiclos(false); return }
    setCargandoCiclos(true)
    facturacionService.getCiclosCliente(clienteSeleccionado.id).then(ciclos => {
      if (!vigente) return
      setCiclosCliente(ciclos)
      setCicloId(prev => prev === 'sin-ciclo' || ciclos.some(c => String(c.id) === prev)
        ? prev : ciclos.length ? '' : 'sin-ciclo')
    }).catch(e => { if (vigente) setErrorCiclos(e.message || 'No se pudieron consultar los ciclos.') })
      .finally(() => { if (vigente) setCargandoCiclos(false) })
    return () => { vigente = false }
  }, [clienteSeleccionado, modoEdicion, facturaEditando, isOnline])

  // Lo que ese cliente suele llevar. Es el mismo cálculo que ve él en su
  // catálogo: si fueran dos cuentas distintas, el agente le ofrecería algo
  // que el portal no le muestra.
  const [sugerencias, setSugerencias] = useState({ habituales: [], perdidos: [] })
  const facturaExistente = modoEdicion && !facturaEditando?.pendienteSincronizar && !String(facturaEditando?.id).startsWith('local-')
  const condicionesDescuento = useDescuentoClienteFacturacion(clienteSeleccionado, isOnline, facturaExistente)
  const { items, setItems, agregarProductoAFactura, eliminarItem, actualizarCantidadItem, validarCantidadItem,
    actualizarPrecioItem, actualizarDescuentoItem, actualizarDescripcionItem } = useLineasFacturacion({
    ofertas, impuestoPrincipal, mostrarMensaje: (...args) => mostrarMensaje(...args), condiciones: condicionesDescuento, facturaExistente, DESCRIPCION_MAX
  })
  const [fecha, setFecha] = useState(hoyEnCostaRica())
  const [observaciones, setObservaciones] = useState('')
  const [descuentoGlobal, setDescuentoGlobal] = useState(0)

  // Estados de búsqueda y entrada rápida
  const [codigoProducto, setCodigoProducto] = useState('')
  const [cantidadProducto, setCantidadProducto] = useState('')
  const [modoEntradaRapida, setModoEntradaRapida] = useState(true) // true = código, false = búsqueda
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [productosEncontrados, setProductosEncontrados] = useState([])
  // Cuántos hay de verdad, para poder avisar si el tope dejó alguno fuera.
  const [totalProductosEncontrados, setTotalProductosEncontrados] = useState(0)
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [clientesEncontrados, setClientesEncontrados] = useState([])
  const [totalClientesEncontrados, setTotalClientesEncontrados] = useState(0)

  // Estados de búsqueda de facturas para edición
  const [busquedaFactura, setBusquedaFactura] = useState('')
  const [facturasPrecargadas, setFacturasPrecargadas] = useState([]) // Facturas precargadas del cache
  const [facturasEncontradas, setFacturasEncontradas] = useState([])
  const [buscandoFacturas, setBuscandoFacturas] = useState(false)
  const [edicionesPendientes, setEdicionesPendientes] = useState([])

  // Estados UI
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

  // LA COLA SE RELEE CUANDO LA SINCRONIZACIÓN TERMINA DE VERDAD, la haya
  // lanzado esta pantalla o el servicio al volver la conexión (ver
  // `alSincronizar` en facturacionService). Antes se releía al toque y
  // quedaba la foto de antes de subir.
  useEffect(() => facturacionService.alSincronizar(async ({ tipo, resultado }) => {
    try {
      const [pendientes, ediciones] = await Promise.all([
        facturacionService.getFacturasPendientes(),
        facturacionService.getEdicionesPendientes()
      ])
      setFacturasPendientes(pendientes)
      setEdicionesPendientes(ediciones)
      await refrescarFacturasLocales()
    } catch (error) {
      console.error('Error releyendo la cola después de sincronizar:', error)
    }
    if (!resultado) return
    const que = tipo === 'ediciones' ? 'edición(es)' : 'factura(s)'
    const rechazadas = (resultado.detalles?.fallidas || []).filter(f => f.rechazada).length
    if (rechazadas > 0) {
      // No se va solo: algo que el agente cree vendido NO quedó facturado.
      mostrarMensaje(`${rechazadas} ${que} no se pudieron subir: el servidor las rechazó. Tocá «Por subir» para ver por qué.`, 'error', 0)
    } else if (resultado.sincronizadas > 0) {
      mostrarMensaje(`${resultado.sincronizadas} ${que} sincronizada(s)`, 'success')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

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

  const descartarFacturaPendiente = async (localId) => {
    try {
      await facturacionService.eliminarFacturaPendiente(localId)
      const pendientes = await facturacionService.getFacturasPendientes()
      setFacturasPendientes(pendientes)
      mostrarMensaje('Factura descartada', 'info', 3000)
      await refrescarFacturasLocales()
    } catch (error) {
      console.error('Error descartando factura pendiente:', error)
      mostrarMensaje('Error descartando factura: ' + error.message, 'error')
    }
  }

  const reintentarFacturaPendiente = async (localId) => {
    setReintentandoLocalId(localId)
    try {
      await facturacionService.reintentarFacturaPendiente(localId)
      mostrarMensaje('Factura enviada al servidor correctamente', 'success')
    } catch (error) {
      console.error('Error reintentando factura pendiente:', error)
      mostrarMensaje('No se pudo enviar la factura: ' + error.message, 'error')
    } finally {
      const pendientes = await facturacionService.getFacturasPendientes()
      setFacturasPendientes(pendientes)
      await refrescarFacturasLocales()
      setReintentandoLocalId(null)
    }
  }

  const inicializarServicio = async () => {
    try {
      setLoading(true)

      // Inicializar servicio
      await facturacionService.init()

      // Cargar datos del cache
      const [productosCache, clientesCache, impuestosData, metodosData, ofertasData, pendientes, stats] = await Promise.all([
        facturacionService.getProductos(),
        facturacionService.getClientes(),
        facturacionService.getImpuestos(),
        facturacionService.getMetodosPago().catch(() => []),
        facturacionService.getOfertasExceso().catch(() => []),
        facturacionService.getFacturasPendientes(),
        facturacionService.getCacheStats()
      ])

      setProductos(productosCache)
      setClientes(clientesCache)
      prepararImpuestosIniciales(impuestosData)
      setMetodosPago(metodosData || [])
      setOfertas(new Map((ofertasData || []).map(o => [Number(o.productoId), o.descuentoPorcentaje])))
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
      // El aviso de cuántas subieron y la relectura de la cola los hace quien
      // escucha `alSincronizar`, cuando termina de verdad.
      await facturacionService.sincronizarFacturasPendientes()

      await sincronizarEdiciones()
      await refrescarFacturasLocales()
    } catch (error) {
      console.error('Error sincronizando:', error)
    }
  }

  const ocultarRecordatorioActualizacion = () => {
    const fechaHoy = hoyEnCostaRica()
    localStorage.setItem(RECORDATORIO_ACTUALIZACION_KEY, fechaHoy)
    setMostrarRecordatorioActualizacion(false)
  }

  const sincronizarEdiciones = async () => {
    try {
      await facturacionService.sincronizarEdicionesPendientes()
    } catch (error) {
      console.error('Error sincronizando ediciones:', error)
    }
  }

  useEffect(() => {
    if (!isOnline || edicionesPendientes.length === 0) return
    sincronizarEdiciones()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, edicionesPendientes.length])

  // Reintento automático periódico de facturas/ediciones pendientes. No depende
  // del evento 'online' del navegador (que solo refleja si la interfaz de red
  // está conectada, no si el servidor es realmente alcanzable) — así una factura que
  // quedó pendiente por un fallo puntual se reintenta sola sin que haga falta
  // recargar la página.
  useEffect(() => {
    if (!isOnline) return

    const interval = setInterval(() => {
      sincronizarFacturas()
    }, REINTENTO_PENDIENTES_INTERVALO)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline])

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
      setTotalProductosEncontrados(0)
      return
    }

    try {
      const encontrados = await facturacionService.buscarProductosPorNombre(nombre)
      setTotalProductosEncontrados(encontrados.length)
      setProductosEncontrados(encontrados.slice(0, MAX_RESULTADOS))
    } catch (error) {
      console.error('Error buscando productos:', error)
      setProductosEncontrados([])
      setTotalProductosEncontrados(0)
    }
  }

  const buscarClientesPorNombre = async (nombre) => {
    if (!nombre || nombre.length < 2) {
      setClientesEncontrados([])
      setTotalClientesEncontrados(0)
      return
    }

    try {
      const encontrados = await facturacionService.buscarClientesPorNombre(nombre)
      setTotalClientesEncontrados(encontrados.length)
      setClientesEncontrados(encontrados.slice(0, MAX_RESULTADOS))
    } catch (error) {
      console.error('Error buscando clientes:', error)
      setClientesEncontrados([])
      setTotalClientesEncontrados(0)
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
        const numero = factura.numero?.toString().toLowerCase() || ''
        const cliente = factura.cliente?.nombre?.toLowerCase() || ''
        return numero.includes(terminoLower) || cliente.includes(terminoLower)
      })

      // Si hay conexión, también buscar online
      if (isOnline) {
        try {
          // Sin repetir y en orden de llegada, como la lista sin búsqueda.
          facturasLocales = combinarBusqueda(facturasLocales, await facturacionService.buscarFacturas({ numero: termino }))
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

      // Una copia con id de Alegra jamás se consulta por ese número en el
      // espacio propio: podría abrir la factura de otra persona y marcarla
      // como nuestra antes de intentar editarla.
      if (!factura.esPropia) {
        throw new Error('Esta copia viene del sistema anterior. Actualizá la lista con conexión y abrí la factura propia para editarla.');
      }
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

      if (!Array.isArray(facturaCompleta.lineas) || facturaCompleta.detalleDisponible === false) {
        throw new Error('El detalle de esta factura no está descargado. Abrila con conexión antes de editarla sin señal.');
      }
      // Cargar datos en el formulario
      setFacturaEditando(facturaCompleta)
      setModoEdicion(true)

      // Los controles del catálogo mantienen su forma de formulario; el
      // documento y la copia persistida usan cliente y líneas propios.
      const clienteFactura = facturaCompleta.cliente;
      setClienteSeleccionado(clienteFactura ? {
        ...clienteFactura,
        name: clienteFactura.nombre,
        identification: clienteFactura.identificacion
      } : null);
      setItems(facturaCompleta.lineas.map(linea => ({
        id: linea.productoId, productoId: linea.productoId,
        reference: getReference(linea.referencia), name: linea.nombre,
        quantity: linea.cantidad, price: linea.precioUnitario,
        tax: [{ id: linea.impuestoId, percentage: linea.tarifa }],
        discount: linea.descuentoPorcentaje || 0, descuentoBase: linea.descuentoBase ?? linea.descuentoPorcentaje ?? 0,
        description: String(linea.descripcion || '').slice(0, DESCRIPCION_MAX)
      })));
      setFecha(facturaCompleta.fecha || hoyEnCostaRica());
      setObservaciones(facturaCompleta.observaciones || '');
      setDescuentoGlobal(facturaCompleta.descuentoGlobal || 0);

      // Cambiar a la pestaña de nueva/editar para mostrar el formulario
      setTabActiva('nueva')
      setBusquedaFactura('')
      setFacturasEncontradas([])

      mostrarMensaje(`Factura ${facturaCompleta.numero || facturaCompleta.id} cargada para edición`, 'success')
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
      const codigoBuscado = codigoProducto

      // EL FOCO PASA A LA CANTIDAD YA, antes de buscar. Buscar el código es
      // una lectura de la base del navegador y el foco se movía después, con
      // 50 ms más de espera: quien teclea "64 ⏎ 10 ⏎" de corrido —o un lector
      // de códigos— metía el "10" en la casilla del código y la pantalla
      // contestaba «Producto "6410" no encontrado». Si el código no existe,
      // el foco vuelve y la cantidad tecleada se descarta.
      setCantidadProducto('')
      cantidadInputRef.current?.focus()

      const producto = await buscarProductoPorCodigo(codigoBuscado)

      if (producto) {
        setProductoPreviewRapido(producto) // Cargar previa
      } else {
        mostrarMensaje(`Producto "${codigoBuscado}" no encontrado`, 'error')
        setCodigoProducto('')
        setCantidadProducto('')
        codigoInputRef.current?.focus()
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

  // Se piden al elegir al cliente, no al abrir la pantalla: sin cliente no hay
  // nada que sugerir. Si falla, se factura igual que siempre.
  //
  // TODO VA EN IDS PROPIOS: se pide con `cliente.id` y cada sugerencia llega
  // con `producto.id`. El histórico (`venta_linea`) habla en ids propios
  // desde que las ventas salen de las facturas propias (sección 12). Esta
  // pantalla siguió pidiendo con el id de Alegra del cliente, y como los dos
  // son números no hubo error: a 216 de los 247 clientes se les mostraba lo
  // que compra OTRO, el que tiene ese número como id propio. Ver
  // docs/grafo/leccion/ids-propios-y-de-alegra-no-se-mezclan.md.
  const clienteIdSugerencias = idPropioDelCliente(clienteSeleccionado)
  useEffect(() => {
    if (!clienteIdSugerencias) { setSugerencias({ habituales: [], perdidos: [] }); return }

    let vigente = true
    facturacionService.getSugerenciasCliente(clienteIdSugerencias)
      .then(r => { if (vigente) setSugerencias(r) })
      .catch(() => { if (vigente) setSugerencias({ habituales: [], perdidos: [] }) })
    return () => { vigente = false }
  }, [clienteIdSugerencias])

  // Solo las que están en el catálogo de la tablet. Los ids ya son de la
  // misma clase que los de `productos` y los de las líneas de la factura.
  const sugerenciasPropias = useMemo(
    () => sugerenciasDelCatalogo(sugerencias, productos), [sugerencias, productos])

  /**
   * Agregar desde una sugerencia.
   *
   * Se busca el producto COMPLETO en el catálogo que ya está en la tablet y se
   * agrega por el camino de siempre. La sugerencia trae nombre y precio para
   * mostrarse, pero no el impuesto de la línea: armar el ítem con ella sería
   * repetir el error que hacía que un producto al 1 % se facturara al 13 %.
   */
  const agregarSugerencia = (sugerencia) => {
    const producto = productos.find(p => String(p.id) === String(sugerencia.id))
    if (!producto) {
      mostrarMensaje('Ese producto no está en el catálogo de esta tablet. Actualizá el catálogo.', 'warning', 4000)
      return
    }
    agregarProductoAFactura(producto, 1)
  }

  const finalizarFactura = async () => {
    if (!facturaExistente && (condicionesDescuento.cargando || condicionesDescuento.error)) {
      mostrarMensaje(condicionesDescuento.error || 'Esperá a que se consulte el descuento del cliente.', 'error'); return
    }
    // Validaciones
    if (!clienteSeleccionado) {
      mostrarMensaje('Debes seleccionar un cliente', 'error')
      return
    }

    if (items.length === 0) {
      mostrarMensaje('Debes agregar al menos un producto', 'error')
      return
    }

    if (cargandoCiclos || !cicloId) { mostrarMensaje('Seleccioná la ruta y semana del pedido', 'error'); return }

    try {
      setLoading(true)

      // La petición conserva los nombres aceptados por el backend y lleva ids propios
      const facturaData = {
        date: fecha,
        dueDate: fecha, // Misma fecha por defecto
        // NUESTROS ids, no los de Alegra: así el servidor resuelve contra su
        // propio maestro y una venta deja de depender de la columna alegra_id,
        // que algún día va a estar vacía.
        clienteId: parseInt(clienteSeleccionado.clienteId ?? clienteSeleccionado.id),
        // Lo que el cajero tiene en pantalla, además del id: el servidor lo
        // compara con la ficha de ese id y, si no es la misma, no factura.
        // Así un catálogo viejo en el dispositivo no cambia un cliente por
        // otro ni un producto por otro (pasó el 2026-10-10 en producción).
        clienteNombre: clienteSeleccionado.name || '',
        clienteIdentificacion: clienteSeleccionado.identification || '',
        items: items.map(item => ({
          id: parseInt(item.id),
          productoId: parseInt(item.productoId ?? item.id),
          reference: item.reference || '', // Campo reference
          name: item.name || '',
          quantity: Number(item.quantity) || 0,
          price: Number(item.price) || 0,
          discount: item.discount || 0, descuentoBase: item.descuentoBase ?? item.discount ?? 0,
          description: (item.description && item.description.trim()
            ? item.description.trim()
            : '' // Si no hay descripción, dejar vacío
          )?.slice(0, DESCRIPCION_MAX),
          tax: (item.tax || []).map(t => ({ id: t.id }))
        })),
        observations: observaciones || '',
        status: 'open'
      }

      if (!facturaExistente) facturaData.descuentoClienteRevisado = condicionesDescuento.porcentaje

      // Solo el ID elegido viaja con la venta; el servidor valida la parada.
      // Las colas antiguas no se actualizan al refrescar este formulario.
      if (!['sin-ciclo', 'sin-descargar'].includes(cicloId) && (!modoEdicion || facturaEditando?.pendienteSincronizar || String(facturaEditando?.id).startsWith('local-'))) facturaData.cicloId = Number(cicloId)

      // El cobro viaja con la factura y se registra en la misma transacción:
      // si la factura no se guarda, tampoco queda un pago suelto. Sin método
      // elegido, la factura sale con su saldo y va a Cuentas por Cobrar.
      if (metodoPagoId) {
        const metodo = metodosPago.find(m => m.id === metodoPagoId)
        facturaData.metodoPagoId = metodoPagoId
        facturaData.metodoPagoTexto = metodo?.name || null
        facturaData.cobro = {
          metodoPagoId,
          referencia: referenciaPago.trim() || null
        }
      }

      // Guardar con descuento global si existe
      if (descuentoGlobal > 0) {
        facturaData.discount = descuentoGlobal
      }

      const lineasVista = items.map(item => ({
        productoId: item.productoId ?? item.id,
        nombre: item.name, referencia: item.reference,
        cantidad: item.quantity, precioUnitario: item.price,
        descuentoPorcentaje: item.discount || 0, descuentoBase: item.descuentoBase ?? item.discount ?? 0,
        descripcion: (item.description || '').slice(0, DESCRIPCION_MAX),
        impuestoId: item.tax?.[0]?.id, tarifa: item.tax?.[0]?.percentage || 0
      }));
      const facturaVista = {
        id: facturaEditando?.id || null,
        localId: facturaEditando?.localId || null,
        // Una factura nueva usa el catálogo propio; una edición conserva la
        // procedencia del documento. Las colas antiguas no se renombran.
        esPropia: !modoEdicion || Boolean(facturaEditando?.esPropia),
        cliente: { id: clienteSeleccionado.id, nombre: clienteSeleccionado.name,
          identificacion: clienteSeleccionado.identification },
        // Editar no convierte una copia incompleta en Sin ciclo ni pierde
        // su origen anticipado. El servidor completa el contexto al responder.
        ciclo: modoEdicion ? facturaEditando?.ciclo : ciclosCliente.find(c => String(c.id) === cicloId) || null,
        anticipado: modoEdicion ? facturaEditando?.anticipado : false,
        lineas: lineasVista,
        total: calcularTotal(items, descuentoGlobal, impuestoPrincipal, impuestos),
        numero: facturaEditando?.numero || `LOCAL-${Date.now()}`,
        observaciones, fecha, descuentoGlobal,
        estado: facturaEditando?.estado || 'borrador'
      };

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
        // La marca dice que el id es NUESTRO. Sin ella la factura salió de
        // una copia vieja de la tablet, con el id de Alegra, y no se edita.
        resultado = await facturacionService.editarFactura(
          facturaEditando.id, facturaData, facturaVista, { esPropia: Boolean(facturaEditando.esPropia) })
      } else {
        // Crear factura nueva
        resultado = await facturacionService.crearFactura(facturaData, facturaVista)
      }

      if (resultado.success) {
        const numeroFacturaDisplay = modoEdicion
          ? (facturaEditando?.numero ||
            facturaVista.numero ||
            facturaEditando?.id)
          : (resultado.data?.numero ||
            facturaVista.numero ||
            resultado.data?.id)

        const mensajeTexto = modoEdicion
          ? (resultado.online
            ? `✅ Factura #${numeroFacturaDisplay} editada exitosamente`
            : `💾 Edición guardada localmente. Se sincronizará cuando haya conexión.`)
          : (resultado.online
            ? `✅ Factura #${numeroFacturaDisplay} creada exitosamente`
            : `💾 Factura guardada localmente. Se sincronizará cuando haya conexión.`)

        mostrarMensaje(mensajeTexto, 'success', 5000)

        // Abrir el PDF (solo si se creó o editó con conexión). Es el nuestro:
        // toda factura que llega acá se guardó en la base propia.
        if (resultado.online && resultado.data?.id) {
          try {
            await abrirPdfFacturaPropia(api, resultado.data.id)
            // El número sigue en el aviso: antes "PDF abierto" lo reemplazaba
            // al segundo y ya no se sabía cuál factura se acababa de hacer.
            mostrarMensaje(`${mensajeTexto} · PDF abierto en otra pestaña`, 'success', 5000)
          } catch (pdfError) {
            console.error('❌ Error visualizando el PDF:', pdfError)
            console.error('❌ Stack:', pdfError.stack)
            mostrarMensaje(`⚠️ La factura #${numeroFacturaDisplay} se guardó bien, pero no se pudo abrir su PDF. Abrila desde Facturas.`, 'warning', 6000)
          }
        } else if (!resultado.online) {
          // Un solo aviso: el de "guardada localmente" ya lo dice todo.
        } else {
          // El servidor reconoció la factura pero no devolvió un id nuestro:
          // se había creado en Alegra antes de pasar al sistema nuevo y
          // todavía no está copiada acá. No se abre un PDF adivinando.
          mostrarMensaje('ℹ️ Esa factura ya estaba creada desde antes del cambio de sistema. Su PDF se podrá abrir cuando esté cargada acá.', 'info', 6000)
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
      if (error.code === 'DESCUENTO_CLIENTE_CAMBIO') condicionesDescuento.refrescar()
      console.error('Error creando factura:', error)
      // No se va solo: la venta sigue en pantalla y hay que leer por qué no
      // salió antes de volver a intentar.
      mostrarMensaje(`No se ${modoEdicion ? 'guardaron los cambios' : 'creó la factura'}: ${error.message}`, 'error', 0)
    } finally {
      setLoading(false)
    }
  }

  const limpiarFactura = () => {
    setClienteSeleccionado(null)
    setItems([])
    setFecha(hoyEnCostaRica())
    setObservaciones('')
    setDescuentoGlobal(0)
    setCodigoProducto('')
    setCantidadProducto('')
    setProductoPreviewRapido(null)
    setBusquedaCliente('')
    setClientesEncontrados([])
    setModoEdicion(false)
    setFacturaEditando(null)
    // El cobro de una venta no se hereda a la siguiente.
    setMetodoPagoId(null)
    setReferenciaPago('')
  }

  // UN SOLO RELOJ PARA EL AVISO. Cada aviso programaba su propio "borrar en
  // 3 s" y ese borrado se llevaba el aviso que hubiera en pantalla, fuera el
  // suyo o no: agregar un producto y facturar enseguida hacía que el motivo
  // de un rechazo ("X está inactivo: no se puede facturar") desapareciera en
  // un segundo, y la venta se quedaba en pantalla sin que nadie supiera por
  // qué. Ahora un aviso nuevo cancela el reloj del anterior.
  //
  // `duracion: 0` = no se va solo: es para lo que hay que LEER antes de
  // seguir (la factura no se creó). Se cierra tocándolo.
  const relojMensaje = useRef(null)
  const cerrarMensaje = () => {
    if (relojMensaje.current) clearTimeout(relojMensaje.current)
    relojMensaje.current = null
    setMensaje(null)
  }
  const mostrarMensaje = (texto, tipo = 'info', duracion = 3000) => {
    if (relojMensaje.current) clearTimeout(relojMensaje.current)
    relojMensaje.current = null
    setMensaje({ texto, tipo, fijo: duracion === 0 })
    if (duracion > 0) relojMensaje.current = setTimeout(cerrarMensaje, duracion)
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

    // LA FACTURA NACE SIN COBRAR, para todos. Antes, a un cliente "de contado"
    // se le marcaba Efectivo sola —"paga en el mostrador"—, pero acá casi
    // todos los clientes son de contado (185 de 247) y casi nada se cobra en
    // un mostrador: se factura el pedido y se cobra al entregarlo. Resultado,
    // visto en producción el 2026-10-11: toda factura salía pagada, con su
    // recibo en caja y el papel diciendo "Pagado · SALDO ₡0", sin que nadie
    // hubiera tocado nada (en tablet y teléfono la elección ni se veía:
    // estaba dentro del desglose cerrado). Cobrar ahora es una decisión de
    // quien factura, nunca un valor por omisión.
    setMetodoPagoId(null)
    setReferenciaPago('')
  }

  const elegirMetodoPago = (id) => {
    setMetodoPagoId(id)
    if (id === null) setReferenciaPago('')
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

  const facturasPendientesDetalle = useMemo(
    () => enriquecerFacturasPendientes(facturasPendientes, facturasPrecargadas, clientes),
    [facturasPendientes, facturasPrecargadas, clientes]
  )

  const cambiarTab = (tab) => {
    if (tab === 'nueva') {
      setTabActiva('nueva')
      if (modoEdicion) limpiarFactura()
      return
    }

    // "Facturas" es SOLO CONSULTA y no toca la factura en curso: alguien que
    // está armando una venta y va a mirar un documento viejo no puede volver
    // y encontrarse el mostrador vacío. Antes cualquier pestaña que no fuera
    // "nueva" caía en "editar" y borraba lo que había.
    if (tab === 'facturas') {
      setTabActiva('facturas')
      return
    }

    setTabActiva('editar')
    // Ir a ver lo pendiente NO borra la venta en curso: alguien con veinte
    // líneas armadas que toca el aviso de "1 por subir" no puede volver y
    // encontrarse el mostrador vacío. Solo se sale de una edición a medias.
    if (modoEdicion) limpiarFactura()
  }

  return {
    ofertas,

    // Cómo se cobra esta venta
    metodosPago,
    metodoPagoId,
    elegirMetodoPago,
    referenciaPago,
    setReferenciaPago,

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
    productos, setProductos,
    clientes,
    sugerencias: sugerenciasPropias,
    agregarSugerencia,
    facturasPendientes,

    // Factura actual
    ciclosCliente, cicloId, setCicloId, cargandoCiclos, errorCiclos,
    condicionesDescuento, facturaExistente, clienteSeleccionado,
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
    totalProductosEncontrados,
    busquedaCliente,
    setBusquedaCliente,
    clientesEncontrados,
    totalClientesEncontrados,

    // Búsqueda de facturas para edición
    busquedaFactura,
    setBusquedaFactura,
    facturasPrecargadas,
    facturasEncontradas,
    setFacturasEncontradas,
    buscandoFacturas,
    edicionesPendientes,
    facturasPendientesDetalle,
    reintentandoLocalId,

    // UI
    cacheStats,
    mensaje,
    cerrarMensaje,
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
    descartarFacturaPendiente,
    reintentarFacturaPendiente,
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
