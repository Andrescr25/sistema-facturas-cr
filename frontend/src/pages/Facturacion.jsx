import { useState, useEffect, useRef } from 'react';
import { 
  Receipt, Package, Users, Wifi, WifiOff, RefreshCw, Save, 
  Check, AlertCircle, Search, X, Plus, Minus, ShoppingCart,
  CreditCard, Calendar, FileText, Download, Zap, Send
} from 'lucide-react';
import facturacionService from '../services/facturacionService';
import { descargarFacturaPDF } from '../utils/pdfGenerator';

export default function Facturacion() {
  // Estados principales
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncingCache, setSyncingCache] = useState(false);

  // Estados de datos
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [impuestos, setImpuestos] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);
  const [facturasPendientes, setFacturasPendientes] = useState([]);

  // Estados de factura actual
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [items, setItems] = useState([]);
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

  // Estados UI
  const [itemEditando, setItemEditando] = useState(null);
  const [mostrarBusquedaCliente, setMostrarBusquedaCliente] = useState(false);
  const [mostrarBusquedaProducto, setMostrarBusquedaProducto] = useState(false);
  const [cacheStats, setCacheStats] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  // Referencias
  const codigoInputRef = useRef(null);
  const cantidadInputRef = useRef(null);

  // Helper: Obtener reference como string (puede venir como objeto o string desde Alegra)
  const getReference = (ref) => {
    if (!ref) return '';
    if (typeof ref === 'object' && ref.reference) return String(ref.reference);
    return String(ref);
  };

  // Detectar tipo de dispositivo (mejorado)
  useEffect(() => {
    const checkDevice = () => {
      // Detección más precisa de dispositivos móviles
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isMobileUserAgent = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth < 768;
      
      // Es móvil si tiene pantalla táctil Y (user agent móvil O pantalla pequeña)
      const mobile = isTouchDevice && (isMobileUserAgent || isSmallScreen);
      
      setIsMobile(mobile);
      
      // Agregar clase al body para estilos globales
      if (mobile) {
        document.body.classList.add('mobile-device');
        document.body.classList.remove('desktop-device');
      } else {
        document.body.classList.add('desktop-device');
        document.body.classList.remove('mobile-device');
      }
      
      console.log('🔍 Dispositivo detectado:', {
        mobile,
        isTouchDevice,
        isMobileUserAgent,
        isSmallScreen,
        width: window.innerWidth
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
    inicializarServicio();
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
  
  // Cambiar automáticamente a búsqueda en móvil
  useEffect(() => {
    if (isMobile && modoEntradaRapida) {
      setModoEntradaRapida(false);
      console.log('📱 Cambiado a modo búsqueda (dispositivo móvil)');
    }
  }, [isMobile]);

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
      setImpuestos(impuestosData);
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

      // Recargar datos del cache
      const [productosCache, clientesCache, stats] = await Promise.all([
        facturacionService.getProductos(),
        facturacionService.getClientes(),
        facturacionService.getCacheStats()
      ]);

      setProductos(productosCache);
      setClientes(clientesCache);
      setCacheStats(stats);

      mostrarMensaje(`Catálogo actualizado: ${resultado.productos} productos, ${resultado.clientes} clientes`, 'success');

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

    } catch (error) {
      console.error('Error sincronizando:', error);
    }
  };

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
      const nuevoItem = {
        id: producto.id,
        reference: getReference(producto.reference),
        name: producto.name,
        quantity: cantidad,
        price: producto.price || 0,
        tax: impuestos.length > 0 ? [{ id: impuestos[0].id }] : [],
        discount: 0
      };

      setItems([...items, nuevoItem]);
    }

    mostrarMensaje(`${producto.name} agregado (${cantidad})`, 'success', 2000);
  };

  const eliminarItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const actualizarCantidadItem = (index, cantidad) => {
    const nuevaCantidad = parseInt(cantidad) || 0;
    if (nuevaCantidad <= 0) {
      eliminarItem(index);
      return;
    }

    setItems(items.map((item, i) =>
      i === index ? { ...item, quantity: nuevaCantidad } : item
    ));
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

  const calcularSubtotal = () => {
    return items.reduce((sum, item) => {
      const subtotalItem = item.quantity * item.price;
      const descuentoItem = (subtotalItem * item.discount) / 100;
      return sum + (subtotalItem - descuentoItem);
    }, 0);
  };

  const calcularImpuestos = () => {
    const subtotal = calcularSubtotal();
    const impuestoPorcentaje = impuestos[0]?.percentage || 0;
    return (subtotal * impuestoPorcentaje) / 100;
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
          quantity: item.quantity,
          price: item.price,
          discount: item.discount || 0,
          tax: item.tax || []
        })),
        observations: observaciones || '',
        status: 'open',
        ...(esElectronica && { stamp: { generateStamp: true } })
      };

      // Guardar con descuento global si existe
      if (descuentoGlobal > 0) {
        facturaData.discount = descuentoGlobal;
      }

      // Crear factura
      const resultado = await facturacionService.crearFactura(facturaData);

      if (resultado.success) {
        mostrarMensaje(
          resultado.online 
            ? `✅ Factura #${resultado.data.id} creada exitosamente`
            : `💾 Factura guardada localmente. Se sincronizará cuando haya conexión.`,
          'success',
          5000
        );

        // Generar y descargar PDF
        try {
          const pdfData = {
            invoice: {
              id: resultado.data?.id || `LOCAL-${resultado.localId}`,
              fecha: fecha,
              electronica: esElectronica,
              observaciones: observaciones,
              descuentoGlobal: descuentoGlobal,
              impuestoPorcentaje: impuestos[0]?.percentage || 13
            },
            client: clienteSeleccionado,
            items: items,
            empresa: {
              nombre: 'DISTRIBUIDORA TACHI',
              cedula: '3-101-234567',
              direccion: 'San José, Costa Rica',
              telefono: '2222-2222',
              email: 'info@tachi.cr'
            }
          };

          descargarFacturaPDF(pdfData);
          mostrarMensaje('📄 PDF descargado', 'success', 2000);
        } catch (pdfError) {
          console.error('Error generando PDF:', pdfError);
          mostrarMensaje('⚠️ Error generando PDF', 'warning', 3000);
        }

        // Limpiar formulario
        limpiarFactura();

        // Actualizar pendientes si es offline
        if (!resultado.online) {
          const pendientes = await facturacionService.getFacturasPendientes();
          setFacturasPendientes(pendientes);
        }
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
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className={`${isMobile ? 'flex-col' : 'flex items-center justify-between'} mb-6`}>
        <div className={isMobile ? 'mb-4' : ''}>
          <h1 className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900 flex items-center gap-2`}>
            <Zap className="text-yellow-500" size={isMobile ? 28 : 32} />
            Facturación
          </h1>
          <p className={`text-gray-600 mt-1 ${isMobile ? 'text-sm' : ''}`}>
            Sistema de facturación con soporte offline
          </p>
        </div>

        <div className={`flex ${isMobile ? 'flex-wrap' : ''} items-center gap-2`}>
          {/* Indicador de conexión */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
            isOnline ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
          }`}>
            {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span className="text-sm font-medium">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {/* Facturas pendientes */}
          {facturasPendientes.length > 0 && (
            <div className="bg-yellow-100 text-yellow-800 px-3 py-2 rounded-lg flex items-center gap-2">
              <AlertCircle size={16} />
              <span className="text-sm font-medium">
                {facturasPendientes.length} pendiente{facturasPendientes.length > 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Botón actualizar cache */}
          <button
            onClick={actualizarCache}
            disabled={!isOnline || syncingCache}
            className={`btn btn-outline flex items-center gap-2 ${isMobile ? 'text-sm px-3 py-2' : ''}`}
            title="Actualizar catálogo"
          >
            <RefreshCw size={16} className={syncingCache ? 'animate-spin' : ''} />
            {isMobile ? 'Actualizar' : 'Actualizar'}
          </button>
        </div>
      </div>

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

      {/* Stats del cache */}
      {cacheStats && (
        <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-1 md:grid-cols-3 gap-4'} mb-6`}>
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="text-blue-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-600">Productos en Cache</p>
                <p className="text-2xl font-bold">{cacheStats.productos.total}</p>
                {cacheStats.productos.ultimaActualizacion && (
                  <p className="text-xs text-gray-500">
                    Actualizado: {new Date(cacheStats.productos.ultimaActualizacion).toLocaleString('es-CR')}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="text-green-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-600">Clientes en Cache</p>
                <p className="text-2xl font-bold">{cacheStats.clientes.total}</p>
                {cacheStats.clientes.ultimaActualizacion && (
                  <p className="text-xs text-gray-500">
                    Actualizado: {new Date(cacheStats.clientes.ultimaActualizacion).toLocaleString('es-CR')}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Receipt className="text-purple-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-600">Facturas Pendientes</p>
                <p className="text-2xl font-bold">{cacheStats.facturasPendientes}</p>
                <p className="text-xs text-gray-500">Por sincronizar</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'} gap-6`}>
        {/* Columna principal: Entrada de datos */}
        <div className={`${isMobile ? '' : 'lg:col-span-2'} space-y-6`}>
          
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
          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Package size={20} />
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
                  <Zap size={16} className="inline mr-2" />
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
                <input
                  type="text"
                  value={busquedaProducto}
                  onChange={(e) => {
                    setBusquedaProducto(e.target.value);
                    buscarProductosPorNombre(e.target.value);
                  }}
                  placeholder={isMobile ? "Buscar producto..." : "Buscar producto por código o nombre..."}
                  className={`input w-full ${isMobile ? 'text-base' : ''}`}
                  autoFocus={isMobile}
                />

                {/* Resultados búsqueda productos */}
                {productosEncontrados.length > 0 && (
                  <div className="mt-2 border border-gray-200 rounded-lg max-h-80 overflow-y-auto">
                    {productosEncontrados.map((producto) => (
                      <button
                        key={producto.id}
                        onClick={() => {
                          agregarProductoAFactura(producto, 1);
                          setBusquedaProducto('');
                          setProductosEncontrados([]);
                        }}
                        className="w-full text-left p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-medium">{producto.name}</p>
                            <p className="text-sm text-gray-600">Código: {getReference(producto.reference)}</p>
                            {producto.price && (
                              <p className="text-sm text-green-600">₡{producto.price.toLocaleString()}</p>
                            )}
                          </div>
                          <Plus className="text-blue-600" size={20} />
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
        <div className="space-y-6">
          
          {/* Configuración de Factura */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText size={20} />
              Configuración
            </h3>

            <div className="space-y-4">
              {/* Fecha */}
              <div>
                <label className="label">Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="input w-full"
                />
              </div>

              {/* Método de Pago */}
              <div>
                <label className="label">Método de Pago</label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value)}
                  className="input w-full"
                >
                  {metodosPago.map((metodo) => (
                    <option key={metodo.id} value={metodo.id}>
                      {metodo.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Descuento Global */}
              <div>
                <label className="label">Descuento Global %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={descuentoGlobal}
                  onChange={(e) => setDescuentoGlobal(parseFloat(e.target.value) || 0)}
                  className="input w-full"
                />
              </div>

              {/* Factura Electrónica */}
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <input
                  type="checkbox"
                  id="factura-electronica"
                  checked={esElectronica}
                  onChange={(e) => setEsElectronica(e.target.checked)}
                  className="w-5 h-5"
                />
                <label htmlFor="factura-electronica" className="flex-1 cursor-pointer">
                  <p className="font-medium text-blue-900">Factura Electrónica</p>
                  <p className="text-xs text-blue-700">
                    {esElectronica ? 'Se enviará a Hacienda' : 'Factura simple sin envío a Hacienda'}
                  </p>
                </label>
              </div>

              {/* Observaciones */}
              <div>
                <label className="label">Observaciones</label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows="3"
                  placeholder="Notas o comentarios adicionales..."
                  className="input w-full"
                />
              </div>
            </div>
          </div>

          {/* Resumen de Totales */}
          <div className="card bg-gradient-to-br from-blue-50 to-purple-50">
            <h3 className="text-lg font-semibold mb-4">Resumen</h3>

            <div className="space-y-2 mb-4">
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
                <span>Impuestos ({impuestos[0]?.percentage || 0}%):</span>
                <span className="font-medium">₡{calcularImpuestos().toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="border-t-2 border-gray-300 pt-2 flex justify-between text-xl font-bold text-gray-900">
                <span>TOTAL:</span>
                <span className="text-green-600">₡{calcularTotal().toLocaleString('es-CR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Botones de acción */}
            <div className="space-y-2">
              <button
                onClick={finalizarFactura}
                disabled={!clienteSeleccionado || items.length === 0 || loading}
                className={`btn btn-primary w-full flex items-center justify-center gap-2 ${isMobile ? 'py-3 text-base' : ''}`}
              >
                <Check size={isMobile ? 24 : 20} />
                {loading ? 'Procesando...' : 'Finalizar Factura'}
              </button>

              <button
                onClick={limpiarFactura}
                className={`btn btn-outline w-full flex items-center justify-center gap-2 ${isMobile ? 'py-3 text-base' : ''}`}
              >
                <X size={isMobile ? 24 : 20} />
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

