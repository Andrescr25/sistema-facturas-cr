import { useState, useEffect, useRef } from 'react';
import {
  Receipt, Package, Users, Wifi, WifiOff, RefreshCw, Save,
  Check, AlertCircle, Search, X, Plus, Minus, ShoppingCart,
  CreditCard, Calendar, FileText, Download, Send, Edit
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
  
  // Modal de cantidad para móvil
  const [modalCantidadProducto, setModalCantidadProducto] = useState(false);
  const [productoSeleccionadoCantidad, setProductoSeleccionadoCantidad] = useState(null);
  const [cantidadSeleccionada, setCantidadSeleccionada] = useState('');

  // Referencias
  const codigoInputRef = useRef(null);
  const cantidadInputRef = useRef(null);
  const busquedaProductoInputRef = useRef(null);
  const cantidadMovilInputRef = useRef(null);

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
      
      console.log('🔍 Dispositivo detectado:', {
        mobile,
        isTouchDevice,
        isMobileUserAgent,
        isSmallScreen,
        isTablet,
        width: window.innerWidth,
        height: window.innerHeight
      });
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
          
          // Hacer scroll para asegurar que el input sea visible
          setTimeout(() => {
            cantidadMovilInputRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
          }, 100);
        }
      }, 400);

      return () => clearTimeout(timer);
    }
  }, [modalCantidadProducto]);
  
  useEffect(() => {
    if (!impuestoPrincipal && impuestos.length > 0) {
      setImpuestoPrincipal(seleccionarImpuestoPrincipal(impuestos));
    }
  }, [impuestos, impuestoPrincipal]);
  
  // Cambiar automáticamente a búsqueda en móvil
  useEffect(() => {
    if (isMobile && modoEntradaRapida) {
      setModoEntradaRapida(false);
      console.log('📱 Cambiado a modo búsqueda (dispositivo móvil)');
    }
  }, [isMobile]);

  useEffect(() => {
    const hoy = new Date();
    const dia = hoy.getDay(); // 0 = domingo, 1 = lunes
    if (dia === 0 || dia === 1) {
      const fechaHoy = hoy.toISOString().split('T')[0];
      const fechaOculta = localStorage.getItem(RECORDATORIO_ACTUALIZACION_KEY);
      if (fechaOculta !== fechaHoy) {
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
      console.log(`✅ ${facturas.length} facturas precargadas listas para edición`);
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

      console.log('✅ Servicio inicializado:', {
        productos: productosCache.length,
        clientes: clientesCache.length,
        pendientes: pendientes.length
      });

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

      const producto = await buscarProductoPorCodigo(codigoProducto);

      if (producto) {
        // Producto encontrado, pasar a cantidad (vacío para que el usuario ingrese)
        setCantidadProducto('');
        cantidadInputRef.current?.focus();
        cantidadInputRef.current?.select(); // Seleccionar todo el contenido
      } else {
        mostrarMensaje(`Producto "${codigoProducto}" no encontrado`, 'error');
        setCodigoProducto('');
      }
    }
  };

  const handleCantidadKeyPress = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      const producto = await buscarProductoPorCodigo(codigoProducto);
      const cantidad = parseInt(cantidadProducto) || 0;

      if (producto && cantidad > 0) {
        agregarProductoAFactura(producto, cantidad);
        
        // Limpiar y volver al código
        setCodigoProducto('');
        setCantidadProducto('');
        codigoInputRef.current?.focus();
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
      
      // Enfocar el input de búsqueda para continuar con el siguiente producto
      setTimeout(() => {
        if (busquedaProductoInputRef.current) {
          busquedaProductoInputRef.current.focus();
        }
      }, 100);
    } else {
      mostrarMensaje('La cantidad debe ser mayor a 0', 'warning');
    }
  };

  const agregarProductoAFactura = (producto, cantidad) => {
    // Verificar si ya existe
    const existente = items.find(item => item.id === producto.id);

    if (existente) {
      // Actualizar cantidad
      setItems(items.map(item =>
        item.id === producto.id
          ? { ...item, quantity: item.quantity + cantidad }
          : item
      ));
    } else {
      // Agregar nuevo
      const impuestoDefault = impuestoPrincipal
        ? [{
            id: impuestoPrincipal.id,
            percentage: Number(impuestoPrincipal.percentage) || 0,
            name: impuestoPrincipal.name,
            type: impuestoPrincipal.type
          }]
        : [];

      const descripcionBase = (producto.description || '').trim().slice(0, DESCRIPCION_MAX);
      const nuevoItem = {
        id: producto.id,
        reference: getReference(producto.reference),
        name: producto.name,
        quantity: cantidad,
        price: producto.price || 0,
        tax: impuestoDefault,
        discount: 0,
        description: descripcionBase || ''
      };

      setItems([...items, nuevoItem]);
    }

    mostrarMensaje(`${producto.name} agregado (${cantidad})`, 'success', 2000);
  };

  const eliminarItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const actualizarCantidadItem = (index, cantidad) => {
    // Permitir valores vacíos temporalmente mientras el usuario edita
    const nuevaCantidad = cantidad === '' ? '' : (parseInt(cantidad) || 1);

    setItems(items.map((item, i) =>
      i === index ? { ...item, quantity: nuevaCantidad } : item
    ));
  };

  const validarCantidadItem = (index) => {
    // Al perder foco, validar que la cantidad sea válida
    setItems(items.map((item, i) => {
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
          quantity: Number(item.quantity) || 0,
          price: Number(item.price) || 0,
          discount: item.discount || 0,
          description: (item.description && item.description.trim()
            ? item.description.trim()
            : item.name
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
    <div className={`${isMobile ? 'pb-20' : 'max-w-7xl mx-auto'}`}>
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
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                isOnline ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
              }`}>
                {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
                <span className="text-sm font-medium">
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            )}

            {/* Facturas pendientes */}
            {facturasPendientes.length > 0 && (
              <div className={`bg-yellow-100 text-yellow-800 px-3 py-2 rounded-lg flex items-center gap-2 ${
                isMobile ? 'text-xs' : 'text-sm'
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
              className={`btn btn-outline flex items-center gap-2 ${
                isMobile ? 'text-xs px-2 py-1.5' : ''
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
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
          mensaje.tipo === 'success' ? 'bg-green-500 text-white' :
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
            className={`px-6 py-3 font-medium transition-colors relative ${
              tabActiva === 'nueva'
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
            className={`px-6 py-3 font-medium transition-colors relative ${
              tabActiva === 'editar'
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
                            Cliente: {factura.client?.name || 'N/A'}
                          </p>
                          <p className="text-sm text-gray-500">
                            Fecha: {factura.date ? new Date(factura.date).toLocaleDateString('es-CR') : 'N/A'}
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
          <div className={`${
            isMobile 
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

      {/* Formulario de factura (Nueva/Edición) */}
      {tabActiva === 'nueva' && (
      <>
      <div className={`${isMobile ? 'px-4' : 'grid grid-cols-1 lg:grid-cols-3 gap-6'}`}>
        {/* Columna principal: Entrada de datos */}
        <div className={`${isMobile ? 'space-y-4' : 'lg:col-span-2 space-y-6'}`}>
          
          {/* Selección de Cliente */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users size={20} />
              Cliente
            </h3>

            {!clienteSeleccionado ? (
              <div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={busquedaCliente}
                    onChange={(e) => {
                      setBusquedaCliente(e.target.value);
                      buscarClientesPorNombre(e.target.value);
                    }}
                    placeholder="Buscar cliente por nombre..."
                    className="input flex-1"
                  />
                </div>

                {/* Resultados búsqueda clientes */}
                {clientesEncontrados.length > 0 && (
                  <div className="mt-2 border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                    {clientesEncontrados.map((cliente) => (
                      <button
                        key={cliente.id}
                        onClick={() => {
                          setClienteSeleccionado(cliente);
                          setBusquedaCliente('');
                          setClientesEncontrados([]);
                        }}
                        className="w-full text-left p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      >
                        <p className="font-medium">{cliente.name}</p>
                        {cliente.identification && (
                          <p className="text-sm text-gray-600">Cédula: {cliente.identification}</p>
                        )}
                        {cliente.email && (
                          <p className="text-sm text-gray-500">{cliente.email}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-green-900">{clienteSeleccionado.name}</p>
                    {clienteSeleccionado.identification && (
                      <p className="text-sm text-green-700">Cédula: {clienteSeleccionado.identification}</p>
                    )}
                    {clienteSeleccionado.email && (
                      <p className="text-sm text-green-600">{clienteSeleccionado.email}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setClienteSeleccionado(null)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Entrada de Productos */}
          <div className={`card ${isMobile ? 'shadow-sm' : ''}`}>
            <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold mb-4 flex items-center gap-2`}>
              <Package size={isMobile ? 18 : 20} />
              Agregar Productos
            </h3>

            {/* Toggle: Modo rápido vs Búsqueda (solo en desktop) */}
            {!isMobile && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setModoEntradaRapida(true)}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                    modoEntradaRapida
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Package size={16} className="inline mr-2" />
                  Entrada Rápida (PC)
                </button>
                <button
                  onClick={() => setModoEntradaRapida(false)}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                    !modoEntradaRapida
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
              <div className="space-y-3">
                <div>
                  <label className="label">Código del Producto</label>
                  <input
                    ref={codigoInputRef}
                    type="text"
                    value={codigoProducto}
                    onChange={(e) => setCodigoProducto(e.target.value)}
                    onKeyPress={handleCodigoKeyPress}
                    placeholder="Ingresa código y presiona Enter"
                    className="input w-full text-lg"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="label">Cantidad</label>
                  <input
                    ref={cantidadInputRef}
                    type="number"
                    min="1"
                    value={cantidadProducto}
                    onChange={(e) => setCantidadProducto(e.target.value)}
                    onKeyPress={handleCantidadKeyPress}
                    onFocus={(e) => e.target.select()}
                    placeholder="Ingrese cantidad"
                    className="input w-full text-lg"
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
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={isMobile ? 18 : 20} />
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
                      setBusquedaProducto(e.target.value);
                      buscarProductosPorNombre(e.target.value);
                    }}
                    onFocus={(e) => {
                      // Ajustar scroll cuando aparece el teclado en móvil (scroll mínimo)
                      if (isMobile) {
                        setTimeout(() => {
                          // Scroll manual más controlado
                          const rect = e.target.getBoundingClientRect();
                          const offset = window.pageYOffset || document.documentElement.scrollTop;
                          const targetY = rect.top + offset - (window.innerHeight * 0.3); // Solo 30% desde arriba
                          
                          window.scrollTo({
                            top: targetY,
                            behavior: 'smooth'
                          });
                        }, 300);
                      }
                    }}
                    placeholder={isMobile ? "Buscar producto..." : "Buscar producto por código o nombre..."}
                    className={`input w-full ${isMobile ? 'text-base pl-10 py-3' : 'pl-10'}`}
                    style={isMobile ? { fontSize: '16px' } : {}}
                  />
                  {busquedaProducto && (
                    <button
                      onClick={() => {
                        setBusquedaProducto('');
                        setProductosEncontrados([]);
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>

                {/* Resultados búsqueda productos */}
                {productosEncontrados.length > 0 && (
                  <div className={`mt-2 border border-gray-200 rounded-lg max-h-80 overflow-y-auto ${
                    isMobile ? 'shadow-lg' : ''
                  }`}>
                    {productosEncontrados.map((producto) => (
                      <button
                        key={producto.id}
                        onClick={() => {
                          abrirModalCantidadProducto(producto);
                        }}
                        className={`w-full text-left ${
                          isMobile ? 'p-4 active:bg-blue-50' : 'p-3 hover:bg-gray-50'
                        } border-b border-gray-100 last:border-b-0 transition-colors`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium truncate ${isMobile ? 'text-base' : ''}`}>{producto.name}</p>
                            <p className={`text-gray-600 truncate ${isMobile ? 'text-sm' : 'text-sm'}`}>
                              {getReference(producto.reference)}
                            </p>
                            {producto.price && (
                              <p className={`text-green-600 font-semibold ${isMobile ? 'text-base mt-1' : 'text-sm'}`}>
                                ₡{producto.price.toLocaleString()}
                              </p>
                            )}
                          </div>
                          <div className={`${
                            isMobile ? 'p-2 bg-blue-100 rounded-full' : ''
                          }`}>
                            <Plus className="text-blue-600" size={isMobile ? 24 : 20} />
                          </div>
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
            <div className="card">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <ShoppingCart size={20} />
                Productos en Factura ({items.length})
              </h3>

              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-gray-600">Código: {getReference(item.reference)}</p>
                      </div>
                      <button
                        onClick={() => eliminarItem(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    <div className={`grid ${isMobile ? 'grid-cols-1 gap-2' : 'grid-cols-3 gap-3'}`}>
                      <div>
                        <label className="label text-xs">Cantidad</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => actualizarCantidadItem(index, e.target.value)}
                          onBlur={() => validarCantidadItem(index)}
                          className={`input w-full ${isMobile ? 'text-base' : 'input-sm'}`}
                          inputMode="numeric"
                        />
                      </div>

                      <div>
                        <label className="label text-xs">Precio</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.price}
                          onChange={(e) => actualizarPrecioItem(index, e.target.value)}
                          className={`input w-full ${isMobile ? 'text-base' : 'input-sm'}`}
                          inputMode="decimal"
                        />
                      </div>

                      <div>
                        <label className="label text-xs">Descuento %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={item.discount || 0}
                          onChange={(e) => actualizarDescuentoItem(index, e.target.value)}
                          className={`input w-full ${isMobile ? 'text-base' : 'input-sm'}`}
                          inputMode="numeric"
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="label text-xs">Descripción en factura</label>
                      <textarea
                        value={item.description || ''}
                        onChange={(e) => actualizarDescripcionItem(index, e.target.value)}
                        maxLength={DESCRIPCION_MAX}
                        rows={isMobile ? 2 : 3}
                        className={`input w-full resize-none ${isMobile ? 'text-base' : 'text-sm'}`}
                        placeholder={item.name ? `*${item.name}*` : 'Detalle adicional que aparecerá en el PDF (opcional)'}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Visible en el PDF. Máximo {DESCRIPCION_MAX} caracteres.
                      </p>
                    </div>

                    <div className="mt-2 text-right">
                      <span className="text-sm text-gray-600">Subtotal: </span>
                      <span className="font-bold">
                        ₡{((item.quantity * item.price) * (1 - (item.discount || 0) / 100)).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Columna derecha: Resumen y configuración */}
        <div className={`${isMobile ? 'space-y-4 pb-48' : 'space-y-6'}`}>
          
          {/* Configuración de Factura */}
          <div className={`card ${isMobile ? 'shadow-sm overflow-hidden' : ''}`}>
            <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold mb-4 flex items-center gap-2`}>
              <FileText size={isMobile ? 18 : 20} />
              Configuración
            </h3>

            <div className={`${isMobile ? 'space-y-3' : 'space-y-4'}`}>
              {/* Fecha */}
              <div className={isMobile ? 'overflow-hidden' : ''}>
                <label className={`label ${isMobile ? 'text-sm' : ''}`}>Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className={`input w-full ${isMobile ? 'text-base' : ''}`}
                  style={{ 
                    fontSize: '16px',
                    maxWidth: '100%',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Método de Pago */}
              <div className={isMobile ? 'overflow-hidden' : ''}>
                <label className={`label ${isMobile ? 'text-sm' : ''}`}>Método de Pago</label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value)}
                  className={`input w-full ${isMobile ? 'text-base' : ''}`}
                  style={{ 
                    fontSize: '16px',
                    maxWidth: '100%',
                    boxSizing: 'border-box'
                  }}
                >
                  {metodosPago.map((metodo) => (
                    <option key={metodo.id} value={metodo.id}>
                      {metodo.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Descuento Global */}
              <div className={isMobile ? 'overflow-hidden' : ''}>
                <label className={`label ${isMobile ? 'text-sm' : ''}`}>Descuento Global %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={descuentoGlobal}
                  onChange={(e) => setDescuentoGlobal(parseFloat(e.target.value) || 0)}
                  className={`input w-full ${isMobile ? 'text-base' : ''}`}
                  inputMode="decimal"
                  style={{ 
                    fontSize: '16px',
                    maxWidth: '100%',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Factura Electrónica */}
              <div className={`flex items-center gap-3 ${isMobile ? 'p-2.5' : 'p-3'} bg-blue-50 border border-blue-200 rounded-lg`}>
                <input
                  type="checkbox"
                  id="factura-electronica"
                  checked={esElectronica}
                  onChange={(e) => setEsElectronica(e.target.checked)}
                  className={`${isMobile ? 'w-5 h-5' : 'w-5 h-5'} flex-shrink-0`}
                />
                <label htmlFor="factura-electronica" className="flex-1 cursor-pointer">
                  <p className={`font-medium text-blue-900 ${isMobile ? 'text-sm' : ''}`}>Factura Electrónica</p>
                  <p className={`text-blue-700 ${isMobile ? 'text-xs' : 'text-xs'}`}>
                    {esElectronica ? 'Se enviará a Hacienda' : 'Factura simple sin envío a Hacienda'}
                  </p>
                </label>
              </div>

              {/* Observaciones */}
              <div className={isMobile ? 'overflow-hidden' : ''}>
                <label className={`label ${isMobile ? 'text-sm' : ''}`}>Observaciones</label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={isMobile ? "2" : "3"}
                  placeholder="Notas o comentarios adicionales..."
                  className={`input w-full resize-none ${isMobile ? 'text-base' : ''}`}
                  style={{ 
                    fontSize: '16px',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    minHeight: isMobile ? '60px' : 'auto'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Resumen de Totales - Solo desktop */}
          {!isMobile && (
            <div className="card bg-gradient-to-br from-blue-50 to-purple-50">
            <div className={isMobile ? 'px-4 pt-3 pb-safe' : ''}>
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
                <div className={`${
                  isMobile ? 'py-2' : 'border-t-2 border-gray-300 pt-2'
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
                  className={`btn ${modoEdicion ? 'bg-orange-600 hover:bg-orange-700' : 'btn-primary'} w-full flex items-center justify-center gap-2 ${
                    isMobile ? 'py-4 text-lg font-bold shadow-lg' : ''
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

      {/* Bottom Sheet Móvil - Fijo fuera del scroll */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-br from-blue-50 to-purple-50 shadow-2xl border-t-2 border-blue-200">
          <div className="px-4 pt-3 pb-safe">
            {/* Total compacto */}
            <div className="space-y-1 mb-3">
              <div className="py-2 flex justify-between text-lg font-bold text-gray-900">
                <div>
                  <span className="text-sm text-gray-600 block">
                    {items.length} {items.length === 1 ? 'producto' : 'productos'} •
                  </span>
                  <span>TOTAL:</span>
                </div>
                <span className="text-green-600">₡{calcularTotal().toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Botón de finalizar */}
            <button
              onClick={finalizarFactura}
              disabled={!clienteSeleccionado || items.length === 0 || loading}
              className={`btn ${modoEdicion ? 'bg-orange-600 hover:bg-orange-700' : 'btn-primary'} w-full flex items-center justify-center gap-2 py-4 text-lg font-bold shadow-lg`}
            >
              {modoEdicion ? <Edit size={24} /> : <Check size={24} />}
              {loading ? 'Procesando...' : (modoEdicion ? 'Guardar Cambios' : 'Finalizar')}
            </button>
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
              <h3 className="text-xl font-bold text-gray-900 mb-2 leading-tight">
                {productoSeleccionadoCantidad.name}
              </h3>
              <p className="text-sm text-gray-600 flex items-center gap-2">
                <Package size={14} />
                {getReference(productoSeleccionadoCantidad.reference)}
              </p>
              {productoSeleccionadoCantidad.price && (
                <p className="text-2xl font-bold text-green-600 mt-3">
                  ₡{productoSeleccionadoCantidad.price.toLocaleString()}
                </p>
              )}
            </div>

            {/* Input de cantidad con botones + y - */}
            <div className="mb-6">
              <label className="block text-lg font-semibold text-gray-900 mb-4">
                Cantidad
              </label>
              
              <div className="flex items-center gap-3">
                {/* Botón menos */}
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(cantidadSeleccionada) || 1;
                    if (current > 1) setCantidadSeleccionada((current - 1).toString());
                  }}
                  className="w-14 h-14 flex-shrink-0 flex items-center justify-center bg-gray-200 hover:bg-gray-300 active:bg-gray-400 rounded-xl text-gray-700 font-bold text-2xl transition-colors"
                >
                  <Minus size={24} />
                </button>

                {/* Input numérico */}
                <input
                  ref={cantidadMovilInputRef}
                  type="number"
                  min="1"
                  value={cantidadSeleccionada}
                  onChange={(e) => setCantidadSeleccionada(e.target.value)}
                  onFocus={(e) => {
                    e.target.select();
                    // Ajustar scroll cuando aparece el teclado
                    setTimeout(() => {
                      e.target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                      });
                    }, 300);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirmarCantidadProducto();
                    }
                  }}
                  placeholder="1"
                  className="w-full max-w-[120px] text-center text-2xl font-bold border-2 border-gray-300 rounded-xl py-3 px-2 focus:border-blue-500 focus:ring-4 focus:ring-blue-200 focus:outline-none"
                  inputMode="numeric"
                  pattern="[0-9]*"
                />

                {/* Botón más */}
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(cantidadSeleccionada) || 0;
                    setCantidadSeleccionada((current + 1).toString());
                  }}
                  className="w-14 h-14 flex-shrink-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl text-white font-bold text-2xl transition-colors"
                >
                  <Plus size={24} />
                </button>
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setModalCantidadProducto(false);
                  setProductoSeleccionadoCantidad(null);
                  setCantidadSeleccionada('');
                }}
                className="flex-1 py-4 px-4 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300 active:bg-gray-400 transition-colors text-base"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarCantidadProducto}
                disabled={!cantidadSeleccionada || parseInt(cantidadSeleccionada) <= 0}
                className="flex-1 py-4 px-4 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 active:bg-green-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base shadow-lg"
              >
                <Check size={24} strokeWidth={3} />
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

