process.env.TZ = 'America/Costa_Rica';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { urlParaRegistro } = require('./src/utils/urlParaRegistro');
const path = require('path');
const axios = require('axios');
require('dotenv').config();
// Rama independencia-alegra: .env.aislado gana sobre .env (base local,
// sincronizaciones apagadas). Tiene que ir antes de leer cualquier ENABLE_*.
require('./config/aislado');

// Importar servicio de email para monitoreo continuo
const EmailService = require('./services/emailService');
const { leerDias, debeMantenerDespierto, nombrarDias } = require('./src/utils/horarioPing');
const whatsapp = require('./src/integrations/whatsapp');

const app = express();
// La rama aislada corre en el 3002 para convivir con developer en el 3000.
// El 3001 quedó descartado: lo ocupa otro proyecto de la misma máquina
// (sistema-facilitadores-judiciales). MODO_AISLADO viene de .env.aislado y
// PORT en la terminal gana siempre.
const PORT = process.env.PORT || (process.env.MODO_AISLADO === 'true' ? 3002 : 3000);

// Configuración CORS para desarrollo y producción
const corsOptions = {
  origin: function (origin, callback) {
    console.log(`🔍 CORS: Request from origin: ${origin || 'No origin'}`);
    
    // Permitir requests sin origin (Postman, mobile apps, etc.)
    if (!origin) {
      console.log('✅ CORS: Sin origin - permitido');
      return callback(null, true);
    }
    
    // Lista de orígenes permitidos
    const allowedOrigins = [
      'http://localhost:5173',                           // Desarrollo local
      'http://localhost:5174',                           // Desarrollo local alternativo
      'https://sistema-facturas-cr.onrender.com',        // Frontend en producción
      'https://sistema-facturas-cr-web.onrender.com'     // Backend URL (para requests internos)
    ];
    
    // Permitir cualquier origen de onrender.com
    if (origin.includes('.onrender.com') || allowedOrigins.includes(origin)) {
      console.log(`✅ CORS: ${origin} - PERMITIDO`);
      callback(null, true);
    } else {
      console.log(`✅ CORS: ${origin} - Permitiendo de todos modos`);
      callback(null, true); // Permitir todos los orígenes para evitar problemas
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'Content-Type', 'X-Total-Count'],
  optionsSuccessStatus: 200,
  preflightContinue: false,
  maxAge: 86400 // Cache preflight por 24 horas
};

// Middleware CORS ANTES de helmet para evitar conflictos
app.use(cors(corsOptions));

// Manejar preflight requests explícitamente ANTES de otros middlewares
app.options('*', (req, res) => {
  console.log(`🔄 OPTIONS request from: ${req.headers.origin || 'No origin'}`);
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400'); // 24 horas
  res.sendStatus(200);
});

// Middleware adicional para asegurar headers CORS en todas las respuestas
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Permitir el origen específico o todos si no hay origen
  if (origin && (origin.includes('.onrender.com') || origin.includes('localhost'))) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  next();
});

// Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

// Logging mejorado
app.use((req, res, next) => {
  console.log(`${req.method} ${urlParaRegistro(req.path)} - Origin: ${req.headers.origin || 'No origin'}`);
  next();
});

// Nunca guardar enlaces de acceso ni contexto personal en URL o Referer.
morgan.token('url', req => urlParaRegistro(req.originalUrl || req.url));
morgan.token('referrer', req => urlParaRegistro(req.headers.referer || req.headers.referrer));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rama independencia-alegra: fotos propias (ver src/integrations/almacenamiento).
// Siempre montado, fuera de /api y fuera del bloque de desarrollo local: las
// fotos las ven los catálogos públicos, sin sesión, en cualquier ambiente.
// (Primero quedó dentro del bloque de LOCAL_DEV y respondía 404.)
app.use('/archivos', express.static(require('./src/integrations/almacenamiento').RAIZ, {
  index: false,
  dotfiles: 'deny',
  fallthrough: false,
  maxAge: '7d',
  setHeaders: (res) => {
    res.set('X-Content-Type-Options', 'nosniff');
    // En desarrollo el frontend corre en otro puerto; sin esto helmet bloquea la imagen.
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// ⚠️ NUNCA servir frontend desde el backend en Render
// El frontend debe estar en un servicio separado (Render Static Site)
// Solo servir en desarrollo local explícito
const isLocalDevelopment = process.env.LOCAL_DEV === 'true';
if (isLocalDevelopment) {
  console.log('📁 Sirviendo frontend desde backend (SOLO desarrollo local)');
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
} else {
  console.log('🚫 NO sirviendo frontend - Este es un servidor API puro');
}

// Importar rutas
const reporteRoutes = require('./src/modules/reports/report.routes');

// Módulos nuevos (arquitectura modular)
const warehouseModule = require('./src/modules/warehouse');
const missingItemsModule = require('./src/modules/missing-items');
const ordenesDeCompraRoutes = require('./src/modules/orders-whatsapp');
const reprintingModule = require('./src/modules/reprinting');
const adminModule = require('./src/modules/admin');
const revisionPreciosModule = require('./src/modules/revision-precios');
const productosRevisionModule = require('./src/modules/productos-revision');
const pagosProveedoresModule = require('./src/modules/pagos-proveedores');
const pagosRecurrentesModule = require('./src/modules/pagos-recurrentes');
const reporteContadorModule = require('./src/modules/reporte-contador');
const proveedoresModule = require('./src/modules/proveedores');
const inventarioAuditoriasModule = require('./src/modules/inventario-auditorias');
const catalogoAgenteModule = require('./src/modules/catalogo-agente');
const cotizacionesModule = require('./src/modules/cotizaciones');
const configuracionModule = require('./src/modules/configuracion');
const haciendaModule = require('./src/integrations/hacienda/rutas');
const productosModule = require('./src/modules/productos');
const clientesModule = require('./src/modules/clientes');
const facturacionModule = require('./src/modules/facturacion');
const { respuestaDeError } = require('./src/utils/manejadorErrores');
const enviosWhatsAppModule = require('./src/modules/envios-whatsapp');
const cuentasPorCobrarModule = require('./src/modules/cuentas-por-cobrar');
const comprasModule = require('./src/modules/compras');
const gastosOperativosModule = require('./src/modules/gastos-operativos/gastos.routes');
const rentabilidadModule = require('./src/modules/rentabilidad');
const authModule = require('./src/modules/auth');
const catalogoClientesModule = require('./src/modules/catalogo-clientes');
const portalClientesModule = require('./src/modules/portal-clientes');
const dashboardModule = require('./src/modules/dashboard');
const usuariosModule = require('./src/modules/usuarios');

// Autenticación. Va ANTES de montar cualquier ruta de API: protege por lista
// de excepciones (ver auth.middleware.js), así un módulo nuevo nace cerrado
// en vez de nacer abierto sin que nadie lo note.
app.use('/api', authModule.middleware.requireAuth);

// Autorización por módulo, justo después: requireAuth ya dijo QUIÉN es y este
// decide QUÉ puede tocar. Esconder opciones del menú no protege nada —quien
// sepa la URL la llama igual—; el permiso se hace valer acá.
app.use('/api', usuariosModule.requirePermiso);

app.use('/api/auth', authModule.routes);
app.use('/api/usuarios', usuariosModule.routes);
app.use('/api/catalogo-clientes', catalogoClientesModule.routes);
// Portal de clientes. Las rutas del CLIENTE van en /api/portal, fuera de
// requireAuth y protegidas por requireCliente con un secreto de firma
// distinto; las del PERSONAL van en /api/portal-clientes y quedan detrás de
// requireAuth como cualquier otra pantalla.
app.use('/api/portal', portalClientesModule.rutasCliente);
app.use('/api/portal-clientes', portalClientesModule.rutasPersonal);
app.use('/api/dashboard', dashboardModule.routes);

// Usar rutas de API (Rutas Legacy y Base)
// /api/facturas y /api/productos (los módulos viejos, sobre copias locales de
// Alegra) se retiraron el 2026-10-04: las facturas son las propias, en
// /api/facturacion, y los productos el maestro, en /api/maestro y
// /api/catalogos.
app.use('/api/proveedores', proveedoresModule.routes);
app.use('/api/reportes', reporteRoutes);
// /api/alegra ya no existe (2026-10-04). Era un router adaptador que montaba
// debajo de un mismo prefijo —compartido, sin permiso— módulos que hoy tienen
// cada uno su dirección: /api/bodega, /api/reportes, /api/faltantes y
// /api/orden-compra. Un prefijo nuevo se registra en usuarios/modulos.js.
app.use('/api/revision-precios', revisionPreciosModule.routes);
app.use('/api/compras', comprasModule.routes);
app.use('/api/gastos-operativos', gastosOperativosModule.routes);
app.use('/api/productos-revision', productosRevisionModule.routes);
app.use('/api/pagos-proveedores', pagosProveedoresModule.routes);
app.use('/api/pagos-recurrentes', pagosRecurrentesModule.routes);
app.use('/api/reporte-contador', reporteContadorModule.routes);
app.use('/api/cuentas-por-cobrar', cuentasPorCobrarModule.routes);
app.use('/api/rentabilidad', rentabilidadModule.routes);
app.use('/api/inventario-auditorias', inventarioAuditoriasModule.routes);
app.use('/api/catalogo-agente', catalogoAgenteModule.routes);
app.use('/api/cotizaciones', cotizacionesModule.routes);
// Rama independencia-alegra: configuración propia. Cambiar pide el módulo
// Configuración; leer lo activo es compartido (ver usuarios/modulos.js).
// Mismo módulo de permisos de cada pantalla, con implementación fiscal aparte.
app.use('/api/configuracion/hacienda', haciendaModule.configuracion);
app.use('/api/facturacion/hacienda', haciendaModule.ventas);
app.use('/api/compras/hacienda', haciendaModule.compras);
// Optativo y exclusivo: consulta estados, nunca envía comprobantes nuevos.
if (process.env.HACIENDA_TRABAJADOR === 'true') haciendaModule.iniciarSeguimiento();
app.use('/api/configuracion', configuracionModule.routes);
app.use('/api/catalogos', configuracionModule.rutasCompartidas);
// Rama independencia-alegra: maestro de productos propio.
app.use('/api/maestro', productosModule.routes);
app.use('/api/catalogos', productosModule.rutasCompartidas);
// Rama independencia-alegra: maestro de clientes propio. La ficha completa
// pide el módulo Clientes; buscar un cliente para facturarle es compartido.
app.use('/api/clientes', clientesModule.routes);
// Facturación va en su PROPIO prefijo. Colgaba de /api/alegra, que era un
// prefijo compartido: el permiso del módulo no se aplicaba y cualquiera con
// sesión podía llamar hasta el POST que crea la factura.
app.use('/api/facturacion', facturacionModule);
app.use('/api/catalogos', clientesModule.rutasCompartidas);
// La cotización que el cliente abre desde el enlace del WhatsApp. Sin login,
// protegida por el token firmado que lleva la URL (ver enlacePublico.js).
app.use('/api/cotizacion-publica', cotizacionesModule.rutasPublicas);
app.use('/api/envios-whatsapp', enviosWhatsAppModule.routes);

// Módulos nuevos (arquitectura modular)
app.use('/api/bodega', warehouseModule.routes);
app.use('/api/preventa', require('./src/modules/preventa/preventa.routes'));
app.use('/api/ingresos', require('./src/modules/ingresos/ingresos.routes'));
app.use('/api/empleados', require('./src/modules/empleados/empleados.routes'));
app.use('/api/entregas', require('./src/modules/entregas/entregas.routes'));
app.use('/api/reimpresion', reprintingModule.routes);
app.use('/api/admin', adminModule.routes);

// /api/faltantes: los ajustes de entrega del Reporte de Clientes. El módulo
// viejo `faltantes` (alta y consulta por el id de la tabla vieja, sin
// ninguna pantalla que lo llamara) se retiró el 2026-09-30 con la migración
// independencia/032.
app.use('/api/faltantes', missingItemsModule.routes);

// /api/orden-compra: la orden de compra del Reporte de Proveedores
// (cantidades, PDF, contacto del proveedor y envío por WhatsApp).
app.use('/api/orden-compra', ordenesDeCompraRoutes);

// Ruta para verificar estado de la API
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    database: 'Connected',
    timestamp: new Date().toISOString()
  });
});

// Ruta de API root (específica para /api)
app.get('/api', (req, res) => {
  res.json({ 
    message: 'API Sistema de Faltantes funcionando correctamente',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Manejo de errores
// Un JSON mal formado es 400, no 500 (ver src/utils/manejadorErrores.js).
app.use((err, req, res, next) => {
  const { status, cuerpo } = respuestaDeError(err, { desarrollo: process.env.NODE_ENV === 'development' });
  if (status >= 500) console.error('Error:', err);
  res.status(status).json(cuerpo);
});

// Catch-all handler
app.get('*', (req, res) => {
  // Para rutas /api, devolver JSON 404
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ 
      error: 'Ruta de API no encontrada',
      path: req.originalUrl,
      availableRoutes: [
        '/api/proveedores/*',
        '/api/faltantes/*',
        '/api/orden-compra/*',
        '/api/reportes/*',
        '/api/pagos-proveedores/*',
        '/api/pagos-recurrentes/*',
        '/api/cuentas-por-cobrar/*',
        '/api/catalogo-agente/*',
        '/api/rentabilidad/*'
      ]
    });
  }
  
  // Para desarrollo local, servir index.html
  if (isLocalDevelopment) {
    return res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
  }
  
  // En producción/Render, devolver 404 en lugar de HTML
  res.status(404).json({ 
    error: 'Ruta no encontrada',
    message: 'Este es un servidor API puro. El frontend está en https://sistema-facturas-cr.onrender.com',
    path: req.originalUrl
  });
});

// Iniciar monitoreo de emails (variable global para poder detenerlo)
let emailService = null;
let whatsappPingInterval = null;

// Cada cuánto se toca Evolution API. Render duerme un servicio tras ~15
// minutos sin tráfico, así que 10 deja margen aunque se pierda un ping.
const WHATSAPP_PING_MINUTOS = Number(process.env.WHATSAPP_PING_MINUTOS) || 10;

// Solo ciertos días, para no gastar la cuota gratuita de Render. Ver
// src/utils/horarioPing.js.
const WHATSAPP_PING_DIAS = leerDias(process.env.WHATSAPP_PING_DIAS);

/** Última situación conocida, para no repetir el mismo aviso cada 10 min. */
let ultimoEstadoWhatsApp = null;

/**
 * Mantiene despierto el Evolution API y, de paso, vigila que el WhatsApp
 * siga vinculado.
 *
 * POR QUÉ
 * Evolution corre como su propio servicio en Render y se duerme sin tráfico.
 * Despertarlo toma entre 20 y 30 segundos —medido en vivo— y esa espera se
 * la come quien está mandando una orden de compra, sin entender por qué el
 * botón se quedó pensando.
 *
 * SE CONSULTA EL ESTADO, NO LA RAÍZ
 * Cuesta lo mismo y responde dos preguntas en vez de una: si contesta, está
 * despierto; y además dice si el teléfono sigue vinculado. Perder la
 * vinculación es silencioso —no falla nada hasta que alguien intenta
 * enviar— así que conviene enterarse antes. Sin la clave configurada se cae
 * a un GET de la raíz, que despierta igual.
 */
async function pingWhatsApp() {
  // Fuera de los días elegidos no se toca: el servicio duerme y no consume
  // horas de la cuota gratuita. Si alguien manda una orden ese día igual
  // funciona — Render lo despierta, tarda unos 30 segundos la primera vez.
  // Con WhatsApp conectado adentro del sistema, Evolution ya no manda nada:
  // no vale la pena gastarle horas gratuitas despertándolo.
  if (whatsapp.estado().conectado) return;

  if (!debeMantenerDespierto(new Date(), WHATSAPP_PING_DIAS)) {
    // Se olvida el estado para que al volver el día de ping se vuelva a
    // informar si el WhatsApp quedó desvinculado mientras tanto.
    ultimoEstadoWhatsApp = null;
    return;
  }

  const waUrl = process.env.WHATSAPP_API_URL;
  const waApiKey = process.env.WHATSAPP_API_KEY;
  const waInstance = process.env.WHATSAPP_INSTANCE_NAME || 'facturas_instance';

  const puedeConsultarEstado = Boolean(waApiKey);
  const url = puedeConsultarEstado
    ? `${waUrl}/instance/connectionState/${waInstance}`
    : waUrl;

  try {
    // 45 s: un arranque en frío de Render tarda unos 30 y no tiene sentido
    // desistir justo antes de que despierte.
    const { data } = await axios.get(url, {
      timeout: 45000,
      headers: puedeConsultarEstado ? { apikey: waApiKey } : {}
    });

    if (!puedeConsultarEstado) {
      ultimoEstadoWhatsApp = 'despierto';
      return;
    }

    const estado = (data?.instance || data)?.state || 'desconocido';

    // Solo se escribe cuando CAMBIA: un log cada 10 minutos durante meses
    // esconde justamente lo que uno quiere encontrar.
    if (estado !== ultimoEstadoWhatsApp) {
      if (estado === 'open') {
        console.log(`✅ WhatsApp (${waInstance}) conectado`);
      } else {
        console.warn(`⚠️ WhatsApp (${waInstance}) está "${estado}" — no se podrán enviar órdenes de compra hasta volver a vincular el teléfono escaneando el QR.`);
      }
      ultimoEstadoWhatsApp = estado;
    }
  } catch (error) {
    // Que Evolution esté caído no debe ensuciar el log cada 10 minutos ni
    // afectar al resto del sistema: se avisa solo al cambiar la situación.
    if (ultimoEstadoWhatsApp !== 'inalcanzable') {
      console.warn(`⚠️ No se pudo contactar Evolution API en ${waUrl}: ${error.message}`);
      ultimoEstadoWhatsApp = 'inalcanzable';
    }
  }
}

// El historial de ventas ya no se sincroniza: la rotación, las estadísticas de
// Rentabilidad y "lo que más compra" de cada cliente salen de las facturas
// propias (`venta_linea`, migración independencia/034). La tarea que lo traía
// de Alegra cada hora se retiró el 2026-10-03.

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log(`📁 Sirviendo frontend desde: ${path.join(__dirname, '../frontend/dist')}`);
  console.log(`🔓 CORS: Configurado para .onrender.com y localhost`);
  console.log(`📋 Orígenes permitidos:`);
  console.log(`   - http://localhost:5173`);
  console.log(`   - https://sistema-facturas-cr.onrender.com`);
  console.log(`   - Todos los subdominios *.onrender.com`);

  // La operación conserva cada ciclo; el archivo de recibidas se calcula
  // al consultar, sin limpieza global ni tareas que borren faltantes.

  // Iniciar monitoreo de emails solo si está configurado
  if (process.env.IMAP_USER && process.env.IMAP_PASSWORD && process.env.ENABLE_EMAIL_MONITORING !== 'false') {
    console.log('\n📧 ========================================');
    console.log('📧 Iniciando monitoreo de emails...');
    console.log('📧 ========================================\n');

    emailService = new EmailService();
    emailService.startMonitoring();
  } else {
    console.log('\n⚠️ Monitoreo de emails desactivado');
    console.log('   Configura IMAP_USER e IMAP_PASSWORD en .env para activarlo');
    console.log('   O establece ENABLE_EMAIL_MONITORING=false para desactivar este mensaje\n');
  }

  // Productos y existencias propios: no hay sincronización externa al iniciar.

  // Cuentas por cobrar YA NO SE SINCRONIZA. Se copiaba la cartera de Alegra
  // cada 30 minutos a la tabla `cuentas_por_cobrar`; ahora el saldo se calcula
  // de nuestras propias facturas y cobros cada vez que alguien pregunta, así
  // que no hay nada que copiar ni media hora de atraso que explicar.

  // Mantener despierto Evolution API (WhatsApp).
  //
  // Solo si apunta a un servidor de verdad: contra localhost no hay nada que
  // mantener despierto y en desarrollo llenaría la consola de avisos.
  const waUrlConfigurada = process.env.WHATSAPP_API_URL;
  const esRemoto = waUrlConfigurada && !/localhost|127\.0\.0\.1/.test(waUrlConfigurada);

  if (esRemoto && process.env.ENABLE_WHATSAPP_PING !== 'false') {
    // Al arrancar se toca de una: si el servicio estaba dormido, conviene
    // que despierte ahora y no cuando alguien mande la primera orden.
    setTimeout(pingWhatsApp, 12000);

    whatsappPingInterval = setInterval(pingWhatsApp, WHATSAPP_PING_MINUTOS * 60 * 1000);

    console.log('\n📱 Ping a Evolution API (WhatsApp) activado');
    console.log(`   - Servidor: ${waUrlConfigurada}`);
    console.log(`   - Días: ${nombrarDias(WHATSAPP_PING_DIAS)} (WHATSAPP_PING_DIAS para cambiarlo)`);
    console.log(`   - Cada ${WHATSAPP_PING_MINUTOS} minutos (WHATSAPP_PING_MINUTOS para cambiarlo)`);
    console.log(`   - Hoy ${debeMantenerDespierto(new Date(), WHATSAPP_PING_DIAS) ? 'SÍ se mantiene despierto' : 'NO se toca (el servicio duerme y ahorra horas)'}`);
    console.log('   - Para desactivar: ENABLE_WHATSAPP_PING=false en .env\n');
  } else if (!esRemoto) {
    console.log('\n📱 Ping a WhatsApp no aplica (WHATSAPP_API_URL apunta a este equipo o no está configurada)\n');
  }

  // WhatsApp adentro del sistema (Baileys): solo con WHATSAPP_PROVEEDOR=interno.
  // Sin esa variable no hace nada — el backend local, que usa la base de
  // producción, no le disputa la sesión al servidor de Render.
  whatsapp.iniciar().catch((e) => console.error('📱 No se pudo iniciar WhatsApp interno:', e.message));

});

// Manejo de cierre graceful
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Señal ${signal} recibida. Cerrando servidor...`);

  // Detener el ping a Evolution API
  if (whatsappPingInterval) {
    console.log('📱 Deteniendo ping a WhatsApp...');
    clearInterval(whatsappPingInterval);
  }

  // WhatsApp adentro: cerrar SIN desvincular y soltar el turno, para que la
  // copia nueva del servidor se conecte en segundos y no a los 60.
  await whatsapp.detener().catch(() => {});

  // Detener monitoreo de emails
  if (emailService) {
    console.log('📧 Deteniendo monitoreo de emails...');
    await emailService.disconnect();
  }

  // Cerrar servidor HTTP
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });

  // Forzar cierre después de 10 segundos
  setTimeout(() => {
    console.error('⚠️ Forzando cierre del servidor...');
    process.exit(1);
  }, 10000);
};

// Escuchar señales de terminación
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Excepción no capturada:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
});

module.exports = app;
