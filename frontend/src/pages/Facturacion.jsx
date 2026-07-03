import { useState, useEffect, useRef } from 'react';
import {
  Receipt, Package, Users, Wifi, WifiOff, RefreshCw, Save,
  Check, AlertCircle, Search, X, Plus, Minus, ShoppingCart,
  CreditCard, Calendar, FileText, Download, Send, Edit,
  ChevronUp, ChevronDown
} from 'lucide-react';
import facturacionService from '../services/facturacionService';
import { alegraService } from '../services/alegraService';

const RECORDATORIO_ACTUALIZACION_KEY = 'facturacion.recordatorio_actualizacion_fecha';

export default function Facturacion() {
  // Estados principales
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncingCache, setSyncingCache] = useState(false);
  const [tabActiva, setTabActiva] = useState('nueva'); // 'nueva' o 'editar'
  const [modoEdicion, setModoEdicion] = useState(false);
  const [facturaEditando, setFacturaEditando] = useState(null);

  // Estados de datos
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [impuestos, setImpuestos] = useState([]);
  const [impuestoPrincipal, setImpuestoPrincipal] = useState(null);
  const [metodosPago, setMetodosPago] = useState([]);
  const [facturasPendientes, setFacturasPendientes] = useState([]);

  // Estados de factura actual
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [items, setItems] = useState([]);
  const DESCRIPCION_MAX = 500;
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [metodoPago, setMetodoPago] = useState('cash');
  const [observaciones, setObservaciones] = useState('');
  const [descuentoGlobal, setDescuentoGlobal] = useState(0);
  const [esElectronica, setEsElectronica] = useState(false);

  // Estados de búsqueda y entrada rápida
  const [codigoProducto, setCodigoProducto] = useState('');
  const [cantidadProducto, setCantidadProducto] = useState('');
  const [modoEntradaRapida, setModoEntradaRapida] = useState(true); // true = código, false = búsqueda
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [productosEncontrados, setProductosEncontrados] = useState([]);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [clientesEncontrados, setClientesEncontrados] = useState([]);

  // Estados de búsqueda de facturas para edición
  const [busquedaFactura, setBusquedaFactura] = useState('');
  const [facturasPrecargadas, setFacturasPrecargadas] = useState([]); // Facturas precargadas del cache
  const [facturasEncontradas, setFacturasEncontradas] = useState([]);
  const [buscandoFacturas, setBuscandoFacturas] = useState(false);
  const [edicionesPendientes, setEdicionesPendientes] = useState([]);

  // Estados UI
  const [itemEditando, setItemEditando] = useState(null);
  const [mostrarBusquedaCliente, setMostrarBusquedaCliente] = useState(false);
  const [mostrarBusquedaProducto, setMostrarBusquedaProducto] = useState(false);
  const [cacheStats, setCacheStats] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [mostrarRecordatorioActualizacion, setMostrarRecordatorioActualizacion] = useState(false);

  const [modalCantidadProducto, setModalCantidadProducto] = useState(false);
  const [productoSeleccionadoCantidad, setProductoSeleccionadoCantidad] = useState(null);
  const [cantidadSeleccionada, setCantidadSeleccionada] = useState('');
  const [productoPreviewRapido, setProductoPreviewRapido] = useState(null);

  // Detalles colapsables por item en el carrito de compras (móvil)
  const [mostrarDetalles, setMostrarDetalles] = useState({});
  const toggleDetalles = (itemId) => {
    setMostrarDetalles(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // Referencias
  const codigoInputRef = useRef(null);
  const cantidadInputRef = useRef(null);
  const busquedaProductoInputRef = useRef(null);
  const cantidadMovilInputRef = useRef(null);
  const clienteCardRef = useRef(null);
  const productoCardRef = useRef(null);

  const scrollElementIntoView = (ref, block = 'center') => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block });
    }
  };

  const enfocarYMostrarBusquedaProducto = () => {
    setTimeout(() => {
      if (modoEntradaRapida && !isMobile) {
        codigoInputRef.current?.focus();
      } else {
        busquedaProductoInputRef.current?.focus();
      }
      scrollElementIntoView(productoCardRef, 'center');
    }, 150);
  };

  // Helper: Obtener reference como string (puede venir como objeto o string desde Alegra)
  const getReference = (ref) => {
    if (!ref) return '';
    if (typeof ref === 'object' && ref.reference) return String(ref.reference);
    return String(ref);
  };

  const normalizarImpuestos = (lista = []) =>
    lista.map((imp) => ({
      ...imp,
      percentage: Number(imp.percentage ?? imp.rate ?? imp.value ?? 0)
    }));

  const ordenarImpuestos = (lista = []) =>
    [...lista].sort((a, b) => (Number(b.percentage) || 0) - (Number(a.percentage) || 0));

  const seleccionarImpuestoPrincipal = (lista = []) => {
    if (!lista.length) return null;
    const preferidoIVA = lista.find(
      (imp) =>
        Number(imp.percentage) >= 13 &&
        (imp.type?.toUpperCase() === 'IVA' || /iva/i.test(imp.name || ''))
    );
    return preferidoIVA || lista.find((imp) => Number(imp.percentage) >= 13) || lista[0];
  };

  const prepararImpuestosIniciales = (lista = []) => {
    const normalizados = normalizarImpuestos(lista);
    const ordenados = ordenarImpuestos(normalizados);
    setImpuestos(ordenados);
    setImpuestoPrincipal(seleccionarImpuestoPrincipal(ordenados));
  };

  const obtenerPorcentajeImpuesto = (taxItem) => {
    if (!taxItem) return null;
    if (taxItem.percentage !== undefined) return Number(taxItem.percentage) || 0;
    const encontrado = impuestos.find((imp) => imp.id === taxItem.id);
    if (encontrado) return Number(encontrado.percentage) || 0;
    return null;
  };

  // Detectar tipo de dispositivo (mejorado con mejor detección)
  useEffect(() => {
    const checkDevice = () => {
      // Detección más precisa de dispositivos móviles
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isMobileUserAgent = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth < 768;
      const isTablet = window.innerWidth >= 768 && window.innerWidth <= 1024;

      // Es móvil si tiene pantalla pequeña O (táctil Y user agent móvil)
      const mobile = isSmallScreen || (isTouchDevice && isMobileUserAgent && !isTablet);

      setIsMobile(mobile);

      // Agregar clase al body para estilos globales
      if (mobile) {
        document.body.classList.add('mobile-device');
        document.body.classList.remove('desktop-device');
        document.body.classList.add('touch-device');
      } else {
        document.body.classList.add('desktop-device');
        document.body.classList.remove('mobile-device');
        if (isTouchDevice) {
          document.body.classList.add('touch-device');
        }
      }

      // Dispositivo configurado
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    window.addEventListener('orientationchange', checkDevice);

    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('orientationchange', checkDevice);
    };
  }, []);

  // Inicializar servicio y cargar datos
  useEffect(() => {
    const init = async () => {
      await inicializarServicio();
      // Cargar ediciones pendientes y facturas precargadas después de inicializar el servicio
      try {
        const [ediciones] = await Promise.all([
          facturacionService.getEdicionesPendientes(),
          cargarFacturasPrecargadas() // Cargar facturas precargadas al inicio
        ]);
        setEdicionesPendientes(ediciones);
      } catch (error) {
        console.error('Error cargando datos iniciales:', error);
      }
    };

    init();
  }, []);

  // Listeners de conexión
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      mostrarMensaje('Conexión restablecida. Sincronizando...', 'success');
      sincronizarFacturas();
    };

    const handleOffline = () => {
      setIsOnline(false);
      mostrarMensaje('Sin conexión. Modo offline activado.', 'warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-focus en código cuando cambia el modo (solo en desktop)
  useEffect(() => {
    if (modoEntradaRapida && codigoInputRef.current && !isMobile) {
      codigoInputRef.current.focus();
    }
  }, [modoEntradaRapida, isMobile]);

  // Focus con delay en modal de cantidad (evita que el teclado tape el modal)
  useEffect(() => {
    if (modalCantidadProducto && cantidadMovilInputRef.current) {
      // Esperar a que termine la animación del modal (400ms)
      const timer = setTimeout(() => {
        if (cantidadMovilInputRef.current) {
          cantidadMovilInputRef.current.focus();
          cantidadMovilInputRef.current.select();
        }
      }, 400);

      return () => clearTimeout(timer);
    }
  }, [modalCantidadProducto]);

  // Auto-focus y auto-scroll a productos cuando se selecciona un cliente
  useEffect(() => {
    if (clienteSeleccionado) {
      setTimeout(() => {
        if (modoEntradaRapida && codigoInputRef.current && !isMobile) {
          codigoInputRef.current.focus();
        } else if (busquedaProductoInputRef.current) {
          busquedaProductoInputRef.current.focus();
        }
        scrollElementIntoView(productoCardRef, 'center');
      }, 300);
    }
  }, [clienteSeleccionado, modoEntradaRapida, isMobile]);

  useEffect(() => {
    if (!impuestoPrincipal && impuestos.length > 0) {
      setImpuestoPrincipal(seleccionarImpuestoPrincipal(impuestos));
    }
  }, [impuestos, impuestoPrincipal]);

  // Cambiar automáticamente a búsqueda en móvil
  useEffect(() => {
    if (isMobile && modoEntradaRapida) {
      setModoEntradaRapida(false);
    }
  }, [isMobile]);

  useEffect(() => {
    const hoy = new Date();
    const dia = hoy.getDay(); // 0 = domingo, 1 = lunes
    if (dia === 0 || dia === 1) {
      // Calcular el domingo más reciente de este ciclo de fin de semana
      const ultimoDomingo = new Date(hoy);
      ultimoDomingo.setDate(hoy.getDate() - dia); // Si es lunes (1), retrocede al domingo. Si es domingo (0), queda igual.
      ultimoDomingo.setHours(0, 0, 0, 0);

      const fechaUltimaActualizacionStr = localStorage.getItem(RECORDATORIO_ACTUALIZACION_KEY);
      if (fechaUltimaActualizacionStr) {
        const fechaUltimaActualizacion = new Date(fechaUltimaActualizacionStr);
        // Si la última actualización ocurrió antes del domingo de esta semana, mostrar recordatorio
        if (fechaUltimaActualizacion < ultimoDomingo) {
          setMostrarRecordatorioActualizacion(true);
        }
      } else {
        // Si nunca se ha guardado una actualización, mostrar
        setMostrarRecordatorioActualizacion(true);
      }
    }
  }, []);

  // Función para cargar facturas precargadas (definida antes de los useEffect que la llaman)
  const cargarFacturasPrecargadas = async () => {
    try {
      setBuscandoFacturas(true);
      const facturas = await facturacionService.getFacturasPrecargadas();
      setFacturasPrecargadas(facturas);
      setFacturasEncontradas(facturas); // Mostrar todas inicialmente
    } catch (error) {
      console.error('Error cargando facturas precargadas:', error);
      mostrarMensaje('Error cargando facturas: ' + error.message, 'error');
      setFacturasPrecargadas([]);
      setFacturasEncontradas([]);
    } finally {
      setBuscandoFacturas(false);
    }
  };

  const refrescarFacturasLocales = async () => {
    try {
      const facturas = await facturacionService.getFacturasPrecargadas();
      setFacturasPrecargadas(facturas);
      if (!busquedaFactura) {
        setFacturasEncontradas(facturas);
      }
    } catch (error) {
      console.error('Error refrescando facturas locales:', error);
    }
  };

  const descartarEdicionPendiente = async (localId, facturaId) => {
    try {
      await facturacionService.eliminarEdicionPendiente(localId, facturaId);
      const ediciones = await facturacionService.getEdicionesPendientes();
      setEdicionesPendientes(ediciones);
      mostrarMensaje('Edición descartada', 'info', 3000);
      await refrescarFacturasLocales();
    } catch (error) {
      console.error('Error descartando edición pendiente:', error);
      mostrarMensaje('Error descartando edición: ' + error.message, 'error');
    }
  };

  const inicializarServicio = async () => {
    try {
      setLoading(true);

      // Inicializar servicio
      await facturacionService.init();

      // Cargar datos del cache
      const [productosCache, clientesCache, impuestosData, metodosPagoData, pendientes, stats] = await Promise.all([
        facturacionService.getProductos(),
        facturacionService.getClientes(),
        facturacionService.getImpuestos(),
        facturacionService.getMetodosPago(),
        facturacionService.getFacturasPendientes(),
        facturacionService.getCacheStats()
      ]);

      setProductos(productosCache);
      setClientes(clientesCache);
      prepararImpuestosIniciales(impuestosData);
      setMetodosPago(metodosPagoData);
      setFacturasPendientes(pendientes);
      setCacheStats(stats);

      // Si no hay datos en cache, intentar descargarlos
      if (productosCache.length === 0 || clientesCache.length === 0) {
        if (isOnline) {
          mostrarMensaje('Descargando catálogo por primera vez...', 'info');
          await actualizarCache();
        } else {
          mostrarMensaje('Sin datos en cache y sin conexión. Por favor conectate a internet.', 'error');
        }
      }

      // Servicio inicializado de facturación
    } catch (error) {
      console.error('Error inicializando servicio:', error);
      mostrarMensaje('Error inicializando sistema: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const actualizarCache = async () => {
    try {
      setSyncingCache(true);
      mostrarMensaje('Actualizando catálogo...', 'info');

      const resultado = await facturacionService.actualizarTodoCache();

      // Recargar datos del cache (incluyendo facturas precargadas)
      const [productosCache, clientesCache, stats] = await Promise.all([
        facturacionService.getProductos(),
        facturacionService.getClientes(),
        facturacionService.getCacheStats(),
        cargarFacturasPrecargadas() // Recargar facturas precargadas
      ]);

      setProductos(productosCache);
      setClientes(clientesCache);
      setCacheStats(stats);

      mostrarMensaje(`Catálogo actualizado: ${resultado.productos} productos, ${resultado.clientes} clientes, ${resultado.facturas} facturas`, 'success');

      // Ocultar recordatorio guardando la fecha y hora de la actualización
      localStorage.setItem(RECORDATORIO_ACTUALIZACION_KEY, new Date().toISOString());
      setMostrarRecordatorioActualizacion(false);

    } catch (error) {
      console.error('Error actualizando cache:', error);
      mostrarMensaje('Error actualizando catálogo: ' + error.message, 'error');
    } finally {
      setSyncingCache(false);
    }
  };

  const sincronizarFacturas = async () => {
    try {
      const resultado = await facturacionService.sincronizarFacturasPendientes();

      // Recargar pendientes
      const pendientes = await facturacionService.getFacturasPendientes();
      setFacturasPendientes(pendientes);

      if (resultado.sincronizadas > 0) {
        mostrarMensaje(`${resultado.sincronizadas} factura(s) sincronizada(s)`, 'success');
      }

      await sincronizarEdiciones();
      await refrescarFacturasLocales();

    } catch (error) {
      console.error('Error sincronizando:', error);
    }
  };

  const ocultarRecordatorioActualizacion = () => {
    const fechaHoy = new Date().toISOString().split('T')[0];
    localStorage.setItem(RECORDATORIO_ACTUALIZACION_KEY, fechaHoy);
    setMostrarRecordatorioActualizacion(false);
  };

  const sincronizarEdiciones = async () => {
    try {
      const resultado = await facturacionService.sincronizarEdicionesPendientes();
      const ediciones = await facturacionService.getEdicionesPendientes();
      setEdicionesPendientes(ediciones);

      if (resultado.sincronizadas > 0) {
        mostrarMensaje(`${resultado.sincronizadas} edición(es) sincronizada(s)`, 'success');
      }

      await refrescarFacturasLocales();
    } catch (error) {
      console.error('Error sincronizando ediciones:', error);
    }
  };

  useEffect(() => {
    if (!isOnline || edicionesPendientes.length === 0) return;
    sincronizarEdiciones();
  }, [isOnline, edicionesPendientes.length]);

  const buscarProductoPorCodigo = async (codigo) => {
    if (!codigo.trim()) return null;

    try {
      const producto = await facturacionService.buscarProductoPorCodigo(codigo.trim());
      return producto;
    } catch (error) {
      console.error('Error buscando producto:', error);
      return null;
    }
  };

  const buscarProductosPorNombre = async (nombre) => {
    if (!nombre || nombre.length < 2) {
      setProductosEncontrados([]);
      return;
    }

    try {
      const encontrados = await facturacionService.buscarProductosPorNombre(nombre);
      setProductosEncontrados(encontrados.slice(0, 10)); // Máximo 10 resultados
    } catch (error) {
      console.error('Error buscando productos:', error);
      setProductosEncontrados([]);
    }
  };

  const buscarClientesPorNombre = async (nombre) => {
    if (!nombre || nombre.length < 2) {
      setClientesEncontrados([]);
      return;
    }

    try {
      const encontrados = await facturacionService.buscarClientesPorNombre(nombre);
      setClientesEncontrados(encontrados.slice(0, 10));
    } catch (error) {
      console.error('Error buscando clientes:', error);
      setClientesEncontrados([]);
    }
  };

  const buscarFacturas = async (termino) => {
    if (!termino || termino.length < 2) {
      // Si no hay búsqueda, mostrar todas las facturas precargadas
      setFacturasEncontradas(facturasPrecargadas);
      return;
    }

    try {
      setBuscandoFacturas(true);

      // Primero buscar en las facturas precargadas (offline)
      const terminoLower = termino.toLowerCase();
      let facturasLocales = facturasPrecargadas.filter(factura => {
        const numero = factura.numberTemplate?.fullNumber?.toString().toLowerCase() || '';
        const cliente = factura.client?.name?.toLowerCase() || '';
        return numero.includes(terminoLower) || cliente.includes(terminoLower);
      });

      // Si hay conexión, también buscar online
      if (isOnline) {
        try {
          const facturasOnline = await facturacionService.buscarFacturas({ numero: termino });

          // Combinar resultados evitando duplicados
          const idsLocales = new Set(facturasLocales.map(f => f.id));
          const facturasNuevas = facturasOnline.filter(f => !idsLocales.has(f.id));
          facturasLocales = [...facturasLocales, ...facturasNuevas];
        } catch (error) {
          console.warn('⚠️ Error buscando online, mostrando solo resultados locales:', error.message);
        }
      }

      setFacturasEncontradas(facturasLocales.slice(0, 20)); // Mostrar hasta 20 resultados
    } catch (error) {
      console.error('Error buscando facturas:', error);
      mostrarMensaje('Error buscando facturas: ' + error.message, 'error');
      setFacturasEncontradas([]);
    } finally {
      setBuscandoFacturas(false);
    }
  };

  const cargarFacturaParaEdicion = async (factura) => {
    try {
      setLoading(true);

      // Obtener detalles completos de la factura
      let facturaCompleta = factura;
      const esLocal = typeof factura.id === 'string' && factura.id.startsWith('local-');

      if (!esLocal) {
        facturaCompleta = await facturacionService.getFacturaById(factura.id);
      }

      if (!facturaCompleta && esLocal) {
        facturaCompleta = await facturacionService.getFacturaById(factura.id);
      }

      if (!facturaCompleta) {
        mostrarMensaje('No se pudo cargar la factura', 'error');
        return;
      }

      if (esLocal && !facturaCompleta.localId) {
        facturaCompleta.localId = parseInt(factura.id.replace('local-', ''), 10);
        facturaCompleta.pendienteSincronizar = true;
      }

      // Cargar datos en el formulario
      setFacturaEditando(facturaCompleta);
      setModoEdicion(true);

      // Cliente
      if (facturaCompleta.client) {
        setClienteSeleccionado(facturaCompleta.client);
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
        }));
        setItems(itemsFormateados);
      }

      // Fecha
      if (facturaCompleta.date) {
        setFecha(facturaCompleta.date);
      }

      // Observaciones
      if (facturaCompleta.observations) {
        setObservaciones(facturaCompleta.observations);
      }

      // Descuento global (si existe en la factura)
      if (facturaCompleta.discount) {
        setDescuentoGlobal(parseFloat(facturaCompleta.discount) || 0);
      }

      // Cambiar a la pestaña de nueva/editar para mostrar el formulario
      setTabActiva('nueva');
      setBusquedaFactura('');
      setFacturasEncontradas([]);

      mostrarMensaje(`Factura ${facturaCompleta.numberTemplate?.fullNumber || facturaCompleta.id} cargada para edición`, 'success');

    } catch (error) {
      console.error('Error cargando factura:', error);
      mostrarMensaje('Error cargando factura: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCodigoKeyPress = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      setProductoPreviewRapido(null); // Limpiar previa anterior

      const producto = await buscarProductoPorCodigo(codigoProducto);

      if (producto) {
        setProductoPreviewRapido(producto); // Cargar previa
        // Producto encontrado, pasar a cantidad (vacío para que el usuario ingrese)
        setCantidadProducto('');
        setTimeout(() => {
          cantidadInputRef.current?.focus();
          cantidadInputRef.current?.select(); // Seleccionar todo el contenido
        }, 50);
      } else {
        mostrarMensaje(`Producto "${codigoProducto}" no encontrado`, 'error');
        setCodigoProducto('');
      }
    }
  };

  const handleCantidadKeyPress = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      // Utilizar el producto ya cargado en la previa o buscarlo como fallback
      const producto = productoPreviewRapido || await buscarProductoPorCodigo(codigoProducto);
      const cantidad = parseInt(cantidadProducto) || 0;

      if (producto && cantidad > 0) {
        agregarProductoAFactura(producto, cantidad);

        // Limpiar y volver al código con scroll
        setCodigoProducto('');
        setCantidadProducto('');
        setProductoPreviewRapido(null);
        setTimeout(() => {
          codigoInputRef.current?.focus();
          scrollElementIntoView(productoCardRef, 'center');
        }, 50);
      } else if (producto && cantidad <= 0) {
        mostrarMensaje('La cantidad debe ser mayor a 0', 'warning');
        cantidadInputRef.current?.select();
      }
    }
  };

  const abrirModalCantidadProducto = (producto) => {
    setProductoSeleccionadoCantidad(producto);
    setCantidadSeleccionada('1');
    setModalCantidadProducto(true);
    setBusquedaProducto('');
    setProductosEncontrados([]);
  };

  const confirmarCantidadProducto = () => {
    const cantidad = parseInt(cantidadSeleccionada) || 1;
    if (cantidad > 0 && productoSeleccionadoCantidad) {
      agregarProductoAFactura(productoSeleccionadoCantidad, cantidad);
      setModalCantidadProducto(false);
      setProductoSeleccionadoCantidad(null);
      setCantidadSeleccionada('');

      // Enfocar el input de búsqueda y centrar tarjeta de productos
      enfocarYMostrarBusquedaProducto();
    } else {
      mostrarMensaje('La cantidad debe ser mayor a 0', 'warning');
    }
  };

  const agregarProductoAFactura = (producto, cantidad) => {
    // Verificar si ya existe
    const existente = items.find(item => item.id === producto.id);

    if (existente) {
      // Actualizar cantidad y mover al principio
      const itemActualizado = { ...existente, quantity: existente.quantity + cantidad };
      setItems([itemActualizado, ...items.filter(item => item.id !== producto.id)]);
    } else {
      // Agregar nuevo al principio
      const impuestoDefault = impuestoPrincipal
        ? [{
          id: impuestoPrincipal.id,
          percentage: Number(impuestoPrincipal.percentage) || 0,
          name: impuestoPrincipal.name,
          type: impuestoPrincipal.type
        }]
        : [];

      const nuevoItem = {
        id: producto.id,
        reference: getReference(producto.reference),
        name: producto.name,
        quantity: cantidad,
        price: producto.price || 0,
        tax: impuestoDefault,
        discount: 0,
        description: ''
      };

      setItems([nuevoItem, ...items]);
    }

    mostrarMensaje(`${producto.name} agregado (${cantidad})`, 'success', 2000);
  };

  const eliminarItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const actualizarCantidadItem = (index, cantidad) => {
    // Permitir valores vacíos temporalmente mientras el usuario edita
    const nuevaCantidad = cantidad === '' ? '' : (parseInt(cantidad) || 1);

    setItems(prevItems => prevItems.map((item, i) =>
      i === index ? { ...item, quantity: nuevaCantidad } : item
    ));
  };

  const validarCantidadItem = (index) => {
    // Al perder foco, validar que la cantidad sea válida
    setItems(prevItems => prevItems.map((item, i) => {
      if (i === index) {
        const cantidad = parseInt(item.quantity) || 1;
        return { ...item, quantity: cantidad >= 1 ? cantidad : 1 };
      }
      return item;
    }));
  };

  const actualizarPrecioItem = (index, precio) => {
    const nuevoPrecio = parseFloat(precio) || 0;
    setItems(items.map((item, i) =>
      i === index ? { ...item, price: nuevoPrecio } : item
    ));
  };

  const actualizarDescuentoItem = (index, descuento) => {
    const nuevoDescuento = parseFloat(descuento) || 0;
    setItems(items.map((item, i) =>
      i === index ? { ...item, discount: nuevoDescuento } : item
    ));
  };

  const actualizarDescripcionItem = (index, descripcion) => {
    const texto = (descripcion || '').slice(0, DESCRIPCION_MAX);
    setItems(items.map((item, i) =>
      i === index ? { ...item, description: texto } : item
    ));
  };

  const calcularSubtotal = () => {
    return items.reduce((sum, item) => {
      const cantidad = Number(item.quantity) || 0;
      const precio = Number(item.price) || 0;
      const descuento = Number(item.discount) || 0;
      const subtotalItem = cantidad * precio;
      const descuentoItem = (subtotalItem * descuento) / 100;
      return sum + (subtotalItem - descuentoItem);
    }, 0);
  };

  const calcularImpuestos = () => {
    return items.reduce((sum, item) => {
      const cantidad = Number(item.quantity) || 0;
      const precio = Number(item.price) || 0;
      const descuento = Number(item.discount) || 0;
      const base = cantidad * precio * (1 - descuento / 100);
      const porcentaje =
        obtenerPorcentajeImpuesto(item.tax?.[0]) ??
        (impuestoPrincipal ? Number(impuestoPrincipal.percentage) || 0 : 0);
      return sum + (base * porcentaje) / 100;
    }, 0);
  };

  const calcularDescuentoGlobal = () => {
    const subtotal = calcularSubtotal();
    return (subtotal * descuentoGlobal) / 100;
  };

  const calcularTotal = () => {
    const subtotal = calcularSubtotal();
    const impuesto = calcularImpuestos();
    const descuento = calcularDescuentoGlobal();
    return subtotal + impuesto - descuento;
  };

  const finalizarFactura = async () => {
    // Validaciones
    if (!clienteSeleccionado) {
      mostrarMensaje('Debes seleccionar un cliente', 'error');
      return;
    }

    if (items.length === 0) {
      mostrarMensaje('Debes agregar al menos un producto', 'error');
      return;
    }

    try {
      setLoading(true);

      // Preparar datos según formato Alegra
      const facturaData = {
        date: fecha,
        dueDate: fecha, // Misma fecha por defecto
        client: parseInt(clienteSeleccionado.id),
        items: items.map(item => ({
          id: parseInt(item.id),
          reference: item.reference || '', // ✅ AGREGADO: Campo reference
          quantity: Number(item.quantity) || 0,
          price: Number(item.price) || 0,
          discount: item.discount || 0,
          description: (item.description && item.description.trim()
            ? item.description.trim()
            : ''  // Si no hay descripción, dejar vacío
          )?.slice(0, DESCRIPCION_MAX),
          tax: (item.tax || []).map(t => ({ id: t.id }))
        })),
        observations: observaciones || '',
        status: 'open',
        ...(esElectronica && { stamp: { generateStamp: true } })
      };

      // Guardar con descuento global si existe
      if (descuentoGlobal > 0) {
        facturaData.discount = descuentoGlobal;
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
      }));

      const facturaVista = {
        id: facturaEditando?.id || null,
        localId: facturaEditando?.localId || null,
        cliente: clienteSeleccionado,
        items: itemsVista,
        total: calcularTotal(),
        numberTemplate: facturaEditando?.numberTemplate || null,
        observaciones,
        date: fecha,
        estado: facturaEditando?.status || 'open'
      };

      if (!facturaVista.numberTemplate) {
        const numeroTemporal = `LOCAL-${Date.now()}`;
        facturaVista.numberTemplate = { fullNumber: numeroTemporal };
        facturaVista.numeroTemporal = numeroTemporal;
      }

      let resultado;
      const esFacturaLocalPendiente = modoEdicion && (
        facturaEditando?.pendienteSincronizar ||
        (typeof facturaEditando?.id === 'string' && facturaEditando.id.startsWith('local-'))
      );
      const localIdEdicion = facturaEditando?.localId ||
        (typeof facturaEditando?.id === 'string' && facturaEditando.id.startsWith('local-')
          ? parseInt(facturaEditando.id.replace('local-', ''), 10)
          : null);

      if (modoEdicion && esFacturaLocalPendiente && localIdEdicion) {
        if (facturacionService.isConnected()) {
          resultado = await facturacionService.enviarFacturaPendiente(localIdEdicion, facturaData, facturaVista);
        } else {
          resultado = await facturacionService.actualizarFacturaPendiente(localIdEdicion, facturaData, facturaVista);
        }
      } else if (modoEdicion && facturaEditando) {
        resultado = await facturacionService.editarFactura(facturaEditando.id, facturaData, facturaVista);
      } else {
        // Crear factura nueva
        resultado = await facturacionService.crearFactura(facturaData, facturaVista);
      }

      if (resultado.success) {
        const numeroFacturaDisplay = modoEdicion
          ? (facturaEditando?.numberTemplate?.fullNumber ||
            facturaVista.numberTemplate?.fullNumber ||
            facturaEditando?.id)
          : (resultado.data?.numberTemplate?.fullNumber ||
            facturaVista.numberTemplate?.fullNumber ||
            resultado.data?.id);

        const mensaje = modoEdicion
          ? (resultado.online
            ? `✅ Factura #${numeroFacturaDisplay} editada exitosamente`
            : `💾 Edición guardada localmente. Se sincronizará cuando haya conexión.`)
          : (resultado.online
            ? `✅ Factura #${numeroFacturaDisplay} creada exitosamente`
            : `💾 Factura guardada localmente. Se sincronizará cuando haya conexión.`);

        mostrarMensaje(mensaje, 'success', 5000);

        // Visualizar PDF desde Alegra (solo si se creó/editó online y no está en modo edición)
        if (resultado.online && resultado.data?.id) {
          try {
            await alegraService.visualizarPDFFactura(resultado.data.id);
            mostrarMensaje('📄 PDF abierto en nueva pestaña', 'success', 2000);
          } catch (pdfError) {
            console.error('❌ Error visualizando PDF desde Alegra:', pdfError);
            console.error('❌ Stack:', pdfError.stack);
            mostrarMensaje('⚠️ Error abriendo PDF. La factura fue creada correctamente.', 'warning', 3000);
          }
        } else if (!resultado.online) {
          mostrarMensaje('ℹ️ El PDF estará disponible cuando la factura se sincronice con Alegra', 'info', 4000);
        } else {
          console.warn('⚠️ No se puede mostrar PDF: online=', resultado.online, 'id=', resultado.data?.id);
        }

        // Limpiar formulario
        limpiarFactura();

        // Actualizar pendientes si es offline
        if (!resultado.online) {
          if (esFacturaLocalPendiente || !modoEdicion) {
            const pendientes = await facturacionService.getFacturasPendientes();
            setFacturasPendientes(pendientes);
          } else {
            const ediciones = await facturacionService.getEdicionesPendientes();
            setEdicionesPendientes(ediciones);
          }
        } else {
          const pendientes = await facturacionService.getFacturasPendientes();
          setFacturasPendientes(pendientes);
          const ediciones = await facturacionService.getEdicionesPendientes();
          setEdicionesPendientes(ediciones);
        }

        await refrescarFacturasLocales();
      }

    } catch (error) {
      console.error('Error creando factura:', error);
      mostrarMensaje('Error creando factura: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const limpiarFactura = () => {
    setClienteSeleccionado(null);
    setItems([]);
    setFecha(new Date().toISOString().split('T')[0]);
    setMetodoPago('cash');
    setObservaciones('');
    setDescuentoGlobal(0);
    setEsElectronica(false);
    setCodigoProducto('');
    setCantidadProducto('');
    setProductoPreviewRapido(null);
    setBusquedaCliente('');
    setClientesEncontrados([]);
    setModoEdicion(false);
    setFacturaEditando(null);
  };

  const mostrarMensaje = (texto, tipo = 'info', duracion = 3000) => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), duracion);
  };

  if (loading && productos.length === 0) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="text-center py-12">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600">Inicializando sistema de facturación...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isMobile ? 'pb-10' : 'max-w-7xl mx-auto'}`}>
      {/* Header - Sticky en móvil */}
      <div className={`${isMobile ? 'sticky top-0 z-40 bg-white shadow-md px-4 py-3' : 'mb-6'}`}>
        <div className={`${isMobile ? '' : 'flex items-center justify-between'}`}>
          <div className={isMobile ? 'mb-3' : ''}>
            <h1 className={`${isMobile ? 'text-xl' : 'text-3xl'} font-bold text-gray-900 flex items-center gap-2`}>
              <FileText className="text-blue-600" size={isMobile ? 24 : 32} />
              Facturación
              {isMobile && (
                <span className="ml-auto text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                  {isOnline ? '🟢' : '🔴'}
                </span>
              )}
            </h1>
            {!isMobile && (
              <p className="text-gray-600 mt-1">
                Sistema de facturación con soporte offline
              </p>
            )}
          </div>

          <div className={`flex ${isMobile ? 'justify-between' : ''} items-center gap-2`}>
            {/* Indicador de conexión - Solo desktop */}
            {!isMobile && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isOnline ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                }`}>
                {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
                <span className="text-sm font-medium">
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            )}

            {/* Facturas pendientes */}
            {facturasPendientes.length > 0 && (
              <div className={`bg-yellow-100 text-yellow-800 px-3 py-2 rounded-lg flex items-center gap-2 ${isMobile ? 'text-xs' : 'text-sm'
                }`}>
                <AlertCircle size={isMobile ? 14 : 16} />
                <span className="font-medium">
                  {facturasPendientes.length}
                </span>
              </div>
            )}

            {/* Botón actualizar cache */}
            <button
              onClick={actualizarCache}
              disabled={!isOnline || syncingCache}
              className={`btn btn-outline flex items-center gap-2 ${isMobile ? 'text-xs px-2 py-1.5' : ''
                }`}
              title="Actualizar catálogo"
            >
              <RefreshCw size={isMobile ? 14 : 16} className={syncingCache ? 'animate-spin' : ''} />
              {!isMobile && 'Actualizar'}
            </button>
          </div>
        </div>
      </div>

      {mostrarRecordatorioActualizacion && (
        <div className={`${isMobile ? 'px-4 mb-4' : 'mb-6'}`}>
          <div className="card border border-yellow-200 bg-gradient-to-r from-yellow-50 to-blue-50 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-yellow-600 flex-shrink-0" size={isMobile ? 20 : 24} />
              <div>
                <p className="text-base font-semibold text-yellow-900">
                  Actualiza el sistema antes de facturar
                </p>
                <p className="text-sm text-yellow-800">
                  Cada domingo y lunes recuerda sincronizar el catálogo para trabajar con precios y clientes actualizados.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <button
                onClick={actualizarCache}
                disabled={!isOnline || syncingCache}
                className="btn btn-primary flex-1 sm:flex-initial flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} className={syncingCache ? 'animate-spin' : ''} />
                Actualizar ahora
              </button>
              <button
                onClick={ocultarRecordatorioActualizacion}
                className="btn btn-ghost text-sm text-gray-600 hover:text-gray-900"
              >
                Ya actualicé
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mensaje flotante */}
      {mensaje && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 ${mensaje.tipo === 'success' ? 'bg-green-500 text-white' :
          mensaje.tipo === 'error' ? 'bg-red-500 text-white' :
            mensaje.tipo === 'warning' ? 'bg-orange-500 text-white' :
              'bg-blue-500 text-white'
          }`}>
          <Check size={20} />
          <span>{mensaje.texto}</span>
        </div>
      )}

      {/* Sistema de Pestañas */}
      <div className={`${isMobile ? 'px-4 mb-4' : 'mb-6'}`}>
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => {
              setTabActiva('nueva');
              if (modoEdicion) {
                limpiarFactura();
              }
            }}
            className={`px-6 py-3 font-medium transition-colors relative ${tabActiva === 'nueva'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-800'
              } ${isMobile ? 'flex-1 text-sm' : ''}`}
          >
            <FileText size={16} className="inline mr-2" />
            {modoEdicion ? 'Editando Factura' : 'Nueva Factura'}
          </button>
          <button
            onClick={() => {
              setTabActiva('editar');
              limpiarFactura();
            }}
            className={`px-6 py-3 font-medium transition-colors relative ${tabActiva === 'editar'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-800'
              } ${isMobile ? 'flex-1 text-sm' : ''}`}
          >
            <Edit size={16} className="inline mr-2" />
            Editar Facturas
            {edicionesPendientes.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded-full">
                {edicionesPendientes.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Contenido de la pestaña "Editar Facturas" */}
      {tabActiva === 'editar' && (
        <div className={`${isMobile ? 'px-4 mb-4' : 'mb-6'}`}>
          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Search size={20} />
              Editar Facturas
            </h3>

            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="search"
                  value={busquedaFactura}
                  onChange={(e) => {
                    setBusquedaFactura(e.target.value);
                    buscarFacturas(e.target.value);
                  }}
                  placeholder="Buscar por número de factura o cliente..."
                  className="input w-full pl-10"
                />
                {busquedaFactura && (
                  <button
                    onClick={() => {
                      setBusquedaFactura('');
                      setFacturasEncontradas(facturasPrecargadas); // Volver a mostrar todas
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>

            {buscandoFacturas && (
              <div className="text-center py-8">
                <div className="spinner mx-auto mb-4"></div>
                <p className="text-gray-600">Cargando facturas...</p>
              </div>
            )}

            {!buscandoFacturas && facturasEncontradas.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 mb-2">
                  {busquedaFactura
                    ? `${facturasEncontradas.length} factura(s) encontrada(s)`
                    : `${facturasEncontradas.length} facturas disponibles (últimas 60 días)`
                  }
                </p>
                <div className="max-h-[600px] overflow-y-auto space-y-2">
                  {facturasEncontradas.map((factura) => (
                    <button
                      key={factura.id}
                      onClick={() => cargarFacturaParaEdicion(factura)}
                      className="w-full text-left p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            Factura #{factura.numberTemplate?.fullNumber || factura.id}
                          </p>
                          <p className="text-sm text-gray-600">
                            Cliente: {factura.client?.name || factura.cliente_nombre || 'N/A'}
                          </p>
                          <p className="text-sm text-gray-500">
                            Fecha: {factura.date 
                               ? new Date(factura.date).toLocaleDateString('es-CR') 
                               : factura.fecha_emision 
                                 ? new Date(factura.fecha_emision).toLocaleDateString('es-CR') 
                                 : 'N/A'}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {factura.pendienteSincronizar && (
                              <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full">
                                Pendiente de envío
                              </span>
                            )}
                            {factura.pendienteEdicion && (
                              <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full">
                                Edición pendiente
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-green-600">
                            ₡{(factura.total || 0).toLocaleString('es-CR')}
                          </p>
                          <span className="text-xs text-blue-600 flex items-center gap-1">
                            <Edit size={12} />
                            Editar
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!buscandoFacturas && facturasEncontradas.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <AlertCircle size={48} className="mx-auto mb-2 opacity-50" />
                <p>
                  {busquedaFactura
                    ? 'No se encontraron facturas con ese criterio'
                    : 'No hay facturas en cache'
                  }
                </p>
                {!isOnline && (
                  <p className="text-sm text-orange-600 mt-2">
                    Estás offline. Solo se muestran facturas en cache.
                  </p>
                )}
                {isOnline && !busquedaFactura && (
                  <button
                    onClick={actualizarCache}
                    className="mt-4 btn btn-primary flex items-center gap-2 mx-auto"
                  >
                    <RefreshCw size={16} />
                    Actualizar Cache
                  </button>
                )}
              </div>
            )}

            {edicionesPendientes.length > 0 && (
              <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <h4 className="font-semibold text-orange-900 mb-2 flex items-center gap-2">
                  <AlertCircle size={18} />
                  Ediciones Pendientes de Sincronización
                </h4>
                <p className="text-sm text-orange-800 mb-3">
                  Hay {edicionesPendientes.length} edición(es) que se sincronizarán cuando haya conexión.
                </p>
                <div className="space-y-2">
                  {edicionesPendientes.map((edicion) => (
                    <div key={edicion.localId} className="bg-white p-3 rounded border border-orange-200">
                      <p className="text-sm font-medium">Factura ID: {edicion.facturaId}</p>
                      <p className="text-xs text-gray-600">
                        Editada: {new Date(edicion.timestamp).toLocaleString('es-CR')}
                      </p>
                      {edicion.errorSincronizacion && (
                        <p className="text-xs text-red-600 mt-1">Error: {edicion.errorSincronizacion}</p>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => descartarEdicionPendiente(edicion.localId, edicion.facturaId)}
                          className="btn btn-xs btn-outline text-red-600 border-red-200 hover:bg-red-50"
                        >
                          Descartar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats del cache - Horizontal scroll en móvil */}
      {tabActiva === 'nueva' && cacheStats && (
        <div className={`${isMobile ? 'px-4 mb-4' : 'mb-6'}`}>
          <div className={`${isMobile
            ? 'flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 scrollbar-hide'
            : 'grid grid-cols-1 md:grid-cols-3 gap-4'
            }`}>
            <div className={`${isMobile ? 'flex-shrink-0 w-64 snap-start' : ''} card`}>
              <div className="flex items-center gap-3">
                <div className={`${isMobile ? 'p-2' : 'p-2'} bg-blue-100 rounded-lg`}>
                  <Package className="text-blue-600" size={isMobile ? 20 : 24} />
                </div>
                <div>
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-600`}>Productos</p>
                  <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold`}>{cacheStats.productos.total}</p>
                  {!isMobile && cacheStats.productos.ultimaActualizacion && (
                    <p className="text-xs text-gray-500">
                      {new Date(cacheStats.productos.ultimaActualizacion).toLocaleDateString('es-CR')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className={`${isMobile ? 'flex-shrink-0 w-64 snap-start' : ''} card`}>
              <div className="flex items-center gap-3">
                <div className={`${isMobile ? 'p-2' : 'p-2'} bg-green-100 rounded-lg`}>
                  <Users className="text-green-600" size={isMobile ? 20 : 24} />
                </div>
                <div>
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-600`}>Clientes</p>
                  <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold`}>{cacheStats.clientes.total}</p>
                  {!isMobile && cacheStats.clientes.ultimaActualizacion && (
                    <p className="text-xs text-gray-500">
                      {new Date(cacheStats.clientes.ultimaActualizacion).toLocaleDateString('es-CR')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className={`${isMobile ? 'flex-shrink-0 w-64 snap-start' : ''} card`}>
              <div className="flex items-center gap-3">
                <div className={`${isMobile ? 'p-2' : 'p-2'} bg-purple-100 rounded-lg`}>
                  <Receipt className="text-purple-600" size={isMobile ? 20 : 24} />
                </div>
                <div>
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-600`}>Pendientes</p>
                  <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold`}>{cacheStats.facturasPendientes}</p>
                  <p className={`${isMobile ? 'text-xs' : 'text-xs'} text-gray-500`}>Por sincronizar</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banner de modo edición */}
      {modoEdicion && facturaEditando && tabActiva === 'nueva' && (
        <div className={`${isMobile ? 'px-4 mb-4' : 'mb-6'}`}>
          <div className="bg-orange-50 border-l-4 border-orange-600 p-4 rounded-r-lg">
            <div className="flex items-center gap-3">
              <Edit className="text-orange-600" size={24} />
              <div className="flex-1">
                <p className="font-semibold text-orange-900">
                  Editando Factura #{facturaEditando.numberTemplate?.fullNumber || facturaEditando.id}
                </p>
                <p className="text-sm text-orange-700">
                  Realiza los cambios necesarios y guarda cuando termines
                </p>
              </div>
              <button
                onClick={limpiarFactura}
                className="text-orange-600 hover:text-orange-800 p-2"
                title="Cancelar edición"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {tabActiva === 'nueva' && (
        <>
          {!clienteSeleccionado ? (
            /* PASO 1: Buscar Cliente */
            <div className={`${isMobile ? 'px-4' : 'max-w-3xl mx-auto'} mb-6`}>
              <div ref={clienteCardRef} className="card shadow-xl border-2 border-blue-100 p-6 md:p-8 bg-white rounded-2xl">
                <div className="text-center mb-6">
                  <div className="inline-flex p-4 bg-blue-50 text-blue-600 rounded-full mb-3">
                    <Users size={isMobile ? 32 : 40} />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Buscar Cliente</h2>
                  <p className="text-gray-500 text-sm md:text-base mt-1">Busca y selecciona un cliente para comenzar a facturar</p>
                </div>

                <div className="relative mb-2">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={24} />
                  <input
                    type="text"
                    value={busquedaCliente}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBusquedaCliente(val);
                      buscarClientesPorNombre(val);
                      if (val && !busquedaCliente) {
                        scrollElementIntoView(clienteCardRef);
                      }
                    }}
                    onFocus={() => {
                      setTimeout(() => {
                        scrollElementIntoView(clienteCardRef);
                      }, 150);
                    }}
                    placeholder="Escribe el nombre del cliente..."
                    className="input w-full pl-12 pr-12 py-4 text-lg border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                    style={{ fontSize: '18px', height: '56px' }}
                    autoFocus
                  />
                  {busquedaCliente && (
                    <button
                      onClick={() => {
                        setBusquedaCliente('');
                        setClientesEncontrados([]);
                      }}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    >
                      <X size={22} />
                    </button>
                  )}
                </div>

                {/* Resultados búsqueda clientes */}
                {clientesEncontrados.length > 0 && (
                  <div className="mt-4 border-2 border-gray-200 rounded-xl max-h-[350px] overflow-y-auto divide-y divide-gray-100 shadow-md">
                    {clientesEncontrados.map((cliente) => (
                      <button
                        key={cliente.id}
                        onClick={() => {
                          setClienteSeleccionado(cliente);
                          setBusquedaCliente('');
                          setClientesEncontrados([]);
                        }}
                        className={`w-full text-left ${isMobile ? 'p-6 py-6 border-2 border-blue-50 bg-blue-50/20' : 'p-4'} rounded-xl hover:bg-blue-50 active:bg-blue-100 transition-colors flex items-center justify-between gap-4 mb-2`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className={`font-black text-gray-950 ${isMobile ? 'text-sm' : 'text-lg md:text-sm'} leading-snug`}>{cliente.name}</p>
                          <div className={`flex flex-wrap gap-x-4 gap-y-1 mt-2 text-gray-700 ${isMobile ? 'text-base font-medium' : 'text-sm'}`}>
                            {cliente.identification && (
                              <span>Cédula: <strong>{cliente.identification}</strong></span>
                            )}
                            {cliente.email && (
                              <span className="truncate">{cliente.email}</span>
                            )}
                          </div>
                        </div>
                        <div className={`p-3 bg-blue-100 text-blue-700 rounded-xl flex-shrink-0 ${isMobile ? 'p-4' : ''}`}>
                          <Plus size={isMobile ? 24 : 20} strokeWidth={3} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* PASO 2: Agregar Productos y Datos de Facturación */
            <div className={`${isMobile ? 'px-4' : 'grid grid-cols-1 lg:grid-cols-3 gap-6'}`}>
              {/* Columna principal: Entrada de datos */}
              <div className={`${isMobile ? 'space-y-4' : 'lg:col-span-2 space-y-6'}`}>

                {/* Tarjeta del Cliente Seleccionado */}
                <div className="card border-2 border-green-200 bg-green-50 shadow-sm p-4 md:p-6 rounded-2xl">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-green-100 text-green-700 rounded-xl">
                        <Users size={isMobile ? 24 : 28} />
                      </div>
                      <div>
                        <span className="text-xs text-green-700 font-semibold tracking-wider uppercase block">Cliente Seleccionado</span>
                        <h3 className="font-bold text-green-900 text-lg md:text-2xl leading-tight">
                          {clienteSeleccionado.name}
                        </h3>
                        {clienteSeleccionado.identification && (
                          <p className="text-sm text-green-700 mt-0.5">
                            Cédula: <strong>{clienteSeleccionado.identification}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                    {isMobile ? (
                      <button
                        onClick={() => {
                          setClienteSeleccionado(null);
                          setItems([]); // Limpiar items si cambia cliente
                        }}
                        className="px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 font-extrabold text-sm rounded-xl transition-all flex-shrink-0"
                      >
                        Cambiar
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setClienteSeleccionado(null);
                          setItems([]); // Limpiar items si cambia cliente
                        }}
                        className="p-3 text-red-600 hover:text-red-800 hover:bg-red-100 rounded-xl transition-colors"
                        title="Cambiar cliente"
                      >
                        <X size={24} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Entrada de Productos */}
                <div ref={productoCardRef} className="card shadow-md p-6 rounded-2xl">
                  <h3 className="text-lg md:text-xl font-bold mb-4 text-gray-900 flex items-center gap-2">
                    <Package size={22} className="text-blue-600" />
                    Agregar Productos
                  </h3>

                  {/* Toggle: Modo rápido vs Búsqueda (solo en desktop) */}
                  {!isMobile && (
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => setModoEntradaRapida(true)}
                        className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-colors ${modoEntradaRapida
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                      >
                        <Package size={16} className="inline mr-2" />
                        Entrada Rápida (PC)
                      </button>
                      <button
                        onClick={() => setModoEntradaRapida(false)}
                        className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-colors ${!modoEntradaRapida
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                      >
                        <Search size={16} className="inline mr-2" />
                        Búsqueda por Nombre
                      </button>
                    </div>
                  )}

                  {/* Modo Entrada Rápida (PC) - Solo en desktop */}
                  {modoEntradaRapida && !isMobile && (
                    <div className="space-y-4">
                      <div>
                        <label className="label text-sm font-semibold text-gray-700">Código del Producto</label>
                        <input
                          ref={codigoInputRef}
                          type="text"
                          value={codigoProducto}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCodigoProducto(val);
                            setProductoPreviewRapido(null);
                            if (val && !codigoProducto) {
                              scrollElementIntoView(productoCardRef);
                            }
                          }}
                          onFocus={() => {
                            setTimeout(() => {
                              scrollElementIntoView(productoCardRef);
                            }, 150);
                          }}
                          onKeyPress={handleCodigoKeyPress}
                          placeholder="Ingresa código y presiona Enter"
                          className="input w-full text-lg py-3 px-4 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                          style={{ height: '48px' }}
                          autoFocus
                        />
                      </div>

                      {/* Vista previa del producto detectado */}
                      {productoPreviewRapido && (
                        <div className="bg-blue-50/50 border-2 border-blue-200 rounded-xl p-4 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <span className="text-xs text-blue-700 font-bold uppercase tracking-wider block mb-1">Producto Detectado</span>
                            <h4 className="font-bold text-gray-900 text-base truncate">{productoPreviewRapido.name}</h4>
                            <p className="text-xs text-gray-500 mt-1">
                              Ref: <strong>{getReference(productoPreviewRapido.reference)}</strong>
                            </p>
                          </div>
                          {productoPreviewRapido.price && (
                            <div className="text-right">
                              <span className="text-xs text-gray-405 block mb-1">Precio Unitario</span>
                              <span className="text-lg font-black text-green-600 block">
                                ₡{productoPreviewRapido.price.toLocaleString('es-CR')}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="label text-sm font-semibold text-gray-700">Cantidad</label>
                        <input
                          ref={cantidadInputRef}
                          type="number"
                          min="1"
                          value={cantidadProducto}
                          onChange={(e) => setCantidadProducto(e.target.value)}
                          onKeyPress={handleCantidadKeyPress}
                          onFocus={(e) => e.target.select()}
                          placeholder="Ingrese cantidad"
                          className="input w-full text-lg py-3 px-4 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                          style={{ height: '48px' }}
                        />
                      </div>

                      <p className="text-sm text-gray-500">
                        💡 <strong>Flujo rápido:</strong> Ingresa código → Enter → Ingresa cantidad → Enter
                      </p>
                    </div>
                  )}

                  {/* Modo Búsqueda por Nombre - Desktop y Móvil */}
                  {(!modoEntradaRapida || isMobile) && (
                    <div>
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={22} />
                        <input
                          ref={busquedaProductoInputRef}
                          type="search"
                          inputMode="search"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck="false"
                          value={busquedaProducto}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBusquedaProducto(val);
                            buscarProductosPorNombre(val);
                            if (val && !busquedaProducto) {
                              scrollElementIntoView(productoCardRef);
                            }
                          }}
                          onFocus={() => {
                            setTimeout(() => {
                              scrollElementIntoView(productoCardRef);
                            }, 150);
                          }}
                          placeholder="Buscar producto por código o nombre..."
                          className="input w-full pl-12 pr-12 py-4 text-lg border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                          style={{ fontSize: '18px', height: '56px' }}
                        />
                        {busquedaProducto && (
                          <button
                            onClick={() => {
                              setBusquedaProducto('');
                              setProductosEncontrados([]);
                            }}
                            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                          >
                            <X size={20} />
                          </button>
                        )}
                      </div>

                      {/* Resultados búsqueda productos */}
                      {productosEncontrados.length > 0 && (
                        <div className="mt-3 border-2 border-gray-200 rounded-xl max-h-80 overflow-y-auto divide-y divide-gray-100 shadow-md">
                          {productosEncontrados.map((producto) => (
                            <button
                              key={producto.id}
                              onClick={() => {
                                abrirModalCantidadProducto(producto);
                              }}
                              className={`w-full text-left ${isMobile ? 'p-4 py-4 border-2 border-blue-50 bg-blue-50/10' : 'p-3'} rounded-xl hover:bg-blue-50 active:bg-blue-100 transition-colors flex items-center justify-between gap-4 mb-2`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className={`font-bold text-gray-950 leading-tight ${isMobile ? 'text-sm whitespace-normal break-words' : 'text-sm md:text-base truncate'}`}>{producto.name}</p>
                                <p className={`text-gray-500 truncate mt-1 ${isMobile ? 'text-xs' : 'text-xs'}`}>
                                  Ref: <strong>{getReference(producto.reference)}</strong>
                                </p>
                                {producto.price && (
                                  <p className={`text-green-600 font-bold mt-1.5 ${isMobile ? 'text-base' : 'text-sm md:text-base'}`}>
                                    ₡{producto.price.toLocaleString('es-CR')}
                                  </p>
                                )}
                              </div>
                              <div className={`p-3 bg-blue-100 text-blue-700 rounded-xl flex-shrink-0 ${isMobile ? 'p-4' : ''}`}>
                                <Plus size={isMobile ? 24 : 20} strokeWidth={3} />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Lista de Productos en Factura */}
                {items.length > 0 && (
                  <div className="card shadow-md p-6 rounded-2xl">
                    <h3 className="text-lg md:text-xl font-bold mb-4 text-gray-900 flex items-center gap-2">
                      <ShoppingCart size={22} className="text-blue-600" />
                      Productos Agregados ({items.length})
                    </h3>

                    <div className="space-y-4">
                      {items.map((item, index) => (
                        <div key={item.id} className="border-2 border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className={`font-bold text-gray-955 leading-snug ${isMobile ? 'text-sm' : 'text-sm md:text-base'}`}>{item.name}</p>
                              <p className={`text-gray-500 mt-1 ${isMobile ? 'text-xs' : 'text-xs'}`}>
                                Código: <strong>{getReference(item.reference)}</strong>
                              </p>
                            </div>
                            <button
                              onClick={() => eliminarItem(index)}
                              className={`text-red-650 hover:text-red-800 hover:bg-red-50 rounded-xl transition-colors flex-shrink-0 ${isMobile ? 'p-3 hover:bg-red-150' : 'p-2'}`}
                              title="Eliminar producto"
                            >
                              <X size={isMobile ? 24 : 20} strokeWidth={isMobile ? 3 : 2.5} />
                            </button>
                          </div>

                          {isMobile ? (
                            <div className="flex flex-col gap-4">
                              {/* Fila principal: Cantidad y Subtotal */}
                              <div className="flex items-center justify-between gap-4 border-b border-gray-150 pb-3">
                                {/* Selector de cantidad táctil gigante */}
                                <div>
                                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">Cantidad</span>
                                  <div className="flex items-center gap-1 border-2 border-gray-350 rounded-2xl overflow-hidden bg-white">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const val = parseInt(item.quantity) || 1;
                                        if (val > 1) {
                                          actualizarCantidadItem(index, val - 1);
                                        }
                                      }}
                                      className="w-14 h-14 flex items-center justify-center bg-gray-100 active:bg-gray-200 text-gray-800 font-extrabold text-2xl"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min="1"
                                      value={item.quantity}
                                      onChange={(e) => actualizarCantidadItem(index, e.target.value)}
                                      onBlur={() => validarCantidadItem(index)}
                                      className="w-14 text-center font-black text-2xl border-0 focus:ring-0 focus:outline-none p-0"
                                      style={{ border: 'none', background: 'transparent' }}
                                      inputMode="numeric"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const val = parseInt(item.quantity) || 0;
                                        actualizarCantidadItem(index, val + 1);
                                      }}
                                      className="w-14 h-14 flex items-center justify-center bg-blue-100 active:bg-blue-200 text-blue-800 font-extrabold text-2xl"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>

                                {/* Precio y Subtotal en grande */}
                                <div className="text-right flex flex-col justify-end h-full pt-4">
                                  <span className="text-xs text-gray-500 block">
                                    ₡{item.price.toLocaleString('es-CR', { minimumFractionDigits: 2 })} c/u
                                  </span>
                                  {item.discount > 0 && (
                                    <span className="text-xs font-bold text-orange-650 block">
                                      Dcto: -{item.discount}%
                                    </span>
                                  )}
                                  <span className="text-lg font-bold text-gray-950 block mt-0.5">
                                    ₡{((item.quantity * item.price) * (1 - (item.discount || 0) / 100)).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>

                              {/* Botón para alternar Opciones Avanzadas en móvil */}
                              <div className="flex justify-start">
                                <button
                                  type="button"
                                  onClick={() => toggleDetalles(item.id)}
                                  className="text-base font-extrabold text-blue-600 active:text-blue-800 flex items-center gap-1.5 py-2 px-3 bg-blue-50 rounded-xl transition-all"
                                >
                                  {mostrarDetalles[item.id] ? <ChevronUp size={20} /> : <FileText size={20} />}
                                  <span>{mostrarDetalles[item.id] ? 'Ocultar detalle' : 'Agregar detalle / nota'}</span>
                                </button>
                              </div>

                              {/* Opciones Avanzadas colapsables */}
                              {mostrarDetalles[item.id] && (
                                <div className="border-t border-dashed border-gray-300 pt-3 mt-1 space-y-4">
                                  {/* Opciones de precio y descuento comentadas a solicitud del usuario */}
                                  {/* 
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="label text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">Precio Unitario</label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={item.price}
                                        onChange={(e) => actualizarPrecioItem(index, e.target.value)}
                                        className="input w-full text-lg font-bold py-3 px-3 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                                        style={{ height: '48px' }}
                                        inputMode="decimal"
                                      />
                                    </div>

                                    <div>
                                      <label className="label text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">Descuento %</label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={item.discount || 0}
                                        onChange={(e) => actualizarDescuentoItem(index, e.target.value)}
                                        className="input w-full text-lg font-bold py-3 px-3 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                                        style={{ height: '48px' }}
                                        inputMode="numeric"
                                      />
                                    </div>
                                  </div>
                                  */}

                                  {/* Detalle o notas */}
                                  <div>
                                    <label className="label text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">Detalle / Notas de línea</label>
                                    <textarea
                                      value={item.description || ''}
                                      onChange={(e) => actualizarDescripcionItem(index, e.target.value)}
                                      maxLength={DESCRIPCION_MAX}
                                      rows={2}
                                      className="input w-full resize-none text-base py-2.5 px-3 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                                      placeholder="Detalle adicional"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                {/* Cantidad con botones táctiles grandes */}
                                <div>
                                  <label className="label text-xs font-semibold text-gray-700 uppercase tracking-wider block mb-1">Cantidad</label>
                                  <div className="flex items-center gap-1 border-2 border-gray-300 rounded-xl overflow-hidden bg-white max-w-[160px]">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const val = parseInt(item.quantity) || 1;
                                        if (val > 1) {
                                          actualizarCantidadItem(index, val - 1);
                                        }
                                      }}
                                      className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-xl transition-colors flex-shrink-0"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min="1"
                                      value={item.quantity}
                                      onChange={(e) => actualizarCantidadItem(index, e.target.value)}
                                      onBlur={() => validarCantidadItem(index)}
                                      className="w-full text-center font-bold text-lg border-0 focus:ring-0 focus:outline-none p-0"
                                      style={{ border: 'none', background: 'transparent' }}
                                      inputMode="numeric"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const val = parseInt(item.quantity) || 0;
                                        actualizarCantidadItem(index, val + 1);
                                      }}
                                      className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xl transition-colors flex-shrink-0"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>

                                {/* Precio */}
                                <div>
                                  <label className="label text-xs font-semibold text-gray-700 uppercase tracking-wider block mb-1">Precio Unitario</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.price}
                                    onChange={(e) => actualizarPrecioItem(index, e.target.value)}
                                    className="input w-full text-base font-medium py-2 px-3 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                                    style={{ height: '40px' }}
                                    inputMode="decimal"
                                  />
                                </div>

                                {/* Descuento */}
                                <div>
                                  <label className="label text-xs font-semibold text-gray-700 uppercase tracking-wider block mb-1">Descuento %</label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={item.discount || 0}
                                    onChange={(e) => actualizarDescuentoItem(index, e.target.value)}
                                    className="input w-full text-base font-medium py-2 px-3 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                                    style={{ height: '40px' }}
                                    inputMode="numeric"
                                  />
                                </div>
                              </div>

                              <div className="mt-2">
                                <label className="label text-xs font-semibold text-gray-700 uppercase tracking-wider block mb-1">Descripción en factura</label>
                                <textarea
                                  value={item.description || ''}
                                  onChange={(e) => actualizarDescripcionItem(index, e.target.value)}
                                  maxLength={DESCRIPCION_MAX}
                                  rows={2}
                                  className="input w-full resize-none text-sm py-2 px-3 border-2 border-gray-300 focus:border-blue-500 rounded-xl"
                                  placeholder="Detalle adicional"
                                />
                              </div>

                              <div className="flex justify-between items-center border-t border-gray-200 pt-3 mt-1">
                                <span className="text-sm font-semibold text-gray-600">Subtotal Línea:</span>
                                <span className="font-bold text-lg text-gray-900">
                                  ₡{((item.quantity * item.price) * (1 - (item.discount || 0) / 100)).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                      {/* Header del resumen - Solo desktop */}
                      {!isMobile && <h3 className="text-lg font-semibold mb-4">Resumen</h3>}

                      {/* Totales compactos en móvil */}
                      <div className={`${isMobile ? 'space-y-1 mb-3' : 'space-y-2 mb-4'}`}>
                        {!isMobile && (
                          <>
                            <div className="flex justify-between text-gray-700">
                              <span>Subtotal:</span>
                              <span className="font-medium">₡{calcularSubtotal().toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>
                            </div>

                            {descuentoGlobal > 0 && (
                              <div className="flex justify-between text-orange-600">
                                <span>Descuento ({descuentoGlobal}%):</span>
                                <span className="font-medium">-₡{calcularDescuentoGlobal().toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>
                              </div>
                            )}

                            <div className="flex justify-between text-gray-700">
                              <span>
                                {impuestoPrincipal
                                  ? `${impuestoPrincipal.name || 'Impuestos'} (${Number(impuestoPrincipal.percentage) || 0}%)`
                                  : 'Impuestos estimados'}:
                              </span>
                              <span className="font-medium">
                                ₡{calcularImpuestos().toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </>
                        )}

                        {/* Total - Siempre visible */}
                        <div className={`${isMobile ? 'py-2' : 'border-t-2 border-gray-300 pt-2'
                          } flex justify-between ${isMobile ? 'text-lg' : 'text-xl'} font-bold text-gray-900`}>
                          <div>
                            <span className={isMobile ? 'text-sm text-gray-600 block' : ''}>
                              {isMobile && `${items.length} ${items.length === 1 ? 'producto' : 'productos'} •`}
                            </span>
                            <span>TOTAL:</span>
                          </div>
                          <span className="text-green-600">₡{calcularTotal().toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      {/* Botones de acción */}
                      <div className={`${isMobile ? 'space-y-2' : 'space-y-2'}`}>
                        <button
                          onClick={finalizarFactura}
                          disabled={!clienteSeleccionado || items.length === 0 || loading}
                          className={`btn ${modoEdicion ? 'bg-orange-600 hover:bg-orange-700' : 'btn-primary'} w-full flex items-center justify-center gap-2 ${isMobile ? 'py-4 text-lg font-bold shadow-lg' : ''
                            }`}
                        >
                          {modoEdicion ? <Edit size={isMobile ? 24 : 20} /> : <Check size={isMobile ? 24 : 20} />}
                          {loading ? 'Procesando...' : (modoEdicion ? (isMobile ? 'Guardar Cambios' : 'Guardar Cambios') : (isMobile ? 'Finalizar' : 'Finalizar Factura'))}
                        </button>

                        <button
                          onClick={limpiarFactura}
                          className="btn btn-outline w-full flex items-center justify-center gap-2"
                        >
                          <X size={20} />
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </>
      )}
      {/* Fin del formulario de factura */}

      {/* Modal de Cantidad para Móvil - Optimizado touch */}
      {modalCantidadProducto && productoSeleccionadoCantidad && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4"
          onClick={() => {
            setModalCantidadProducto(false);
            setProductoSeleccionadoCantidad(null);
            setCantidadSeleccionada('');
            enfocarYMostrarBusquedaProducto();
          }}
        >
          <div
            className="bg-white rounded-3xl sm:rounded-xl shadow-2xl w-full sm:max-w-md p-6 animate-slideUp"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxHeight: '90vh',
              marginBottom: 'env(safe-area-inset-bottom, 0px)'
            }}
          >
            {/* Handle visual para drag (solo móvil) */}
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden"></div>

            {/* Producto seleccionado */}
            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2 leading-tight">
                {productoSeleccionadoCantidad.name}
              </h3>
              <p className="text-sm text-gray-600 flex items-center gap-2">
                <Package size={14} />
                {getReference(productoSeleccionadoCantidad.reference)}
              </p>
              {productoSeleccionadoCantidad.price && (
                <p className="text-xl font-bold text-green-600 mt-2">
                  ₡{productoSeleccionadoCantidad.price.toLocaleString()}
                </p>
              )}
            </div>

            {/* Input de cantidad con botones + y - */}
            <div className="mb-6">
              <label className="block text-lg font-semibold text-gray-900 mb-4">
                Cantidad
              </label>

              <div className="flex items-center gap-3 justify-center flex-nowrap">
                {/* Botón menos */}
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(cantidadSeleccionada) || 1;
                    if (current > 1) setCantidadSeleccionada((current - 1).toString());
                  }}
                  className="w-16 h-16 flex-shrink-0 flex items-center justify-center bg-gray-200 hover:bg-gray-300 active:bg-gray-400 rounded-2xl text-gray-700 font-extrabold text-3xl transition-colors"
                >
                  <Minus size={28} />
                </button>

                {/* Input numérico envuelto en contenedor de tamaño fijo */}
                <div className="w-16 h-16 flex-shrink-0">
                  <input
                    ref={cantidadMovilInputRef}
                    type="number"
                    min="1"
                    value={cantidadSeleccionada}
                    onChange={(e) => setCantidadSeleccionada(e.target.value)}
                    onFocus={(e) => {
                      e.target.select();
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        confirmarCantidadProducto();
                      }
                    }}
                    placeholder="1"
                    className="w-full h-full text-center text-2xl font-black border-2 border-gray-350 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-200 focus:outline-none"
                    inputMode="numeric"
                    pattern="[0-9]*"
                  />
                </div>

                {/* Botón más */}
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(cantidadSeleccionada) || 0;
                    setCantidadSeleccionada((current + 1).toString());
                  }}
                  className="w-16 h-16 flex-shrink-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-2xl text-white font-extrabold text-3xl transition-colors"
                >
                  <Plus size={28} />
                </button>
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setModalCantidadProducto(false);
                  setProductoSeleccionadoCantidad(null);
                  setCantidadSeleccionada('');
                  enfocarYMostrarBusquedaProducto();
                }}
                className="flex-1 py-5 px-4 bg-gray-200 text-gray-800 rounded-2xl font-black hover:bg-gray-300 active:bg-gray-400 transition-colors text-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarCantidadProducto}
                disabled={!cantidadSeleccionada || parseInt(cantidadSeleccionada) <= 0}
                className="flex-1 py-5 px-4 bg-green-600 text-white rounded-2xl font-black hover:bg-green-700 active:bg-green-800 transition-colors disabled:bg-gray-350 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg shadow-xl"
              >
                <Check size={26} strokeWidth={3} />
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

