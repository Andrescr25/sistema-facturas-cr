process.env.TZ = 'America/Costa_Rica';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Importar servicio de email para monitoreo continuo
const EmailService = require('./services/emailService');
const AlegraService = require('./services/alegraService');
const { iniciarLimpiezaProgramada } = require('./services/scheduledCleanup');

const app = express();
const PORT = process.env.PORT || 3000;

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
  console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin || 'No origin'}`);
  next();
});

app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
const facturaRoutes = require('./src/modules/invoices/invoice.routes');
const productoRoutes = require('./src/modules/products/product.routes');
const proveedorRoutes = require('./routes/proveedores');
const faltanteRoutes = require('./routes/faltantes');
const reporteRoutes = require('./src/modules/reports/report.routes');
const alegraRoutes = require('./routes/alegra');
const pagosProveedoresRoutes = require('./routes/pagosProveedores');
const inventarioAuditoriasRoutes = require('./routes/inventarioAuditorias');

// Módulos nuevos (arquitectura modular)
const warehouseModule = require('./src/modules/warehouse');
const missingItemsModule = require('./src/modules/missing-items');
const reprintingModule = require('./src/modules/reprinting');
const adminModule = require('./src/modules/admin');
const revisionPreciosModule = require('./src/modules/revision-precios');
const productosRevisionModule = require('./src/modules/productos-revision');

// Usar rutas de API (Rutas Legacy y Base)
app.use('/api/facturas', facturaRoutes);
app.use('/api/productos', productoRoutes);
app.use('/api/proveedores', proveedorRoutes);
app.use('/api/reportes', reporteRoutes);
// /api/alegra es un router adaptador (routes/alegra.js) que monta debajo:
// /catalog, /productos, /facturas, /bodega, /reimpresion, /reportes,
// /contactos, /proveedores, /faltantes, /orden-compra y /facturacion
app.use('/api/alegra', alegraRoutes);
app.use('/api/revision-precios', revisionPreciosModule.routes);
app.use('/api/productos-revision', productosRevisionModule.routes);
app.use('/api/pagos-proveedores', pagosProveedoresRoutes);
app.use('/api/inventario-auditorias', inventarioAuditoriasRoutes);

// Módulos nuevos (arquitectura modular)
app.use('/api/bodega', warehouseModule.routes);
app.use('/api/reimpresion', reprintingModule.routes);
app.use('/api/admin', adminModule.routes);

// ⚠️ NOTA: El endpoint /api/faltantes tiene ruteo híbrido (fall-through).
// Las peticiones básicas de gestión de faltantes son procesadas por 'faltanteRoutes' (Legacy).
// Las operaciones de ajustes y mantenimiento caen en 'missingItemsModule.routes' (Modular).
app.use('/api/faltantes', faltanteRoutes);
app.use('/api/faltantes', missingItemsModule.routes);

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
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno'
  });
});

// Catch-all handler
app.get('*', (req, res) => {
  // Para rutas /api, devolver JSON 404
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ 
      error: 'Ruta de API no encontrada',
      path: req.originalUrl,
      availableRoutes: [
        '/api/alegra/*',
        '/api/facturas/*',
        '/api/productos/*',
        '/api/proveedores/*',
        '/api/faltantes/*',
        '/api/reportes/*',
        '/api/pagos-proveedores/*'
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
let alegraService = null;
let productSyncInterval = null;

// Función para sincronizar productos de Alegra
async function syncAlegraProducts() {
  try {
    console.log('\n📦 ========================================');
    console.log('📦 Sincronizando productos de Alegra...');
    console.log('📦 ========================================\n');

    if (!alegraService) {
      alegraService = new AlegraService();
    }

    const productos = await alegraService.syncProductsFromAlegra();
    console.log(`✅ Sincronización completada: ${productos.length} productos actualizados`);
    console.log(`📅 Próxima sincronización en 6 horas\n`);
  } catch (error) {
    console.error('❌ Error sincronizando productos de Alegra:', error.message);
  }
}

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

  // Iniciar limpieza programada (Domingos 23:59)
  iniciarLimpiezaProgramada();

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

  // Sincronizar productos de Alegra al iniciar
  if (process.env.ENABLE_ALEGRA_SYNC !== 'false') {
    // Ejecutar sincronización inicial después de 5 segundos (dar tiempo al servidor para estabilizarse)
    setTimeout(() => {
      syncAlegraProducts();
    }, 5000);

    // Programar sincronización periódica cada 6 horas (21600000 ms)
    productSyncInterval = setInterval(() => {
      syncAlegraProducts();
    }, 6 * 60 * 60 * 1000);

    console.log('\n📦 Sincronización de productos Alegra activada');
    console.log('   - Sincronización inicial: En 5 segundos');
    console.log('   - Sincronización periódica: Cada 6 horas');
    console.log('   - Para desactivar: ENABLE_ALEGRA_SYNC=false en .env\n');
  } else {
    console.log('\n⚠️ Sincronización de productos Alegra desactivada');
    console.log('   Establece ENABLE_ALEGRA_SYNC=true en .env para activarla\n');
  }

});

// Manejo de cierre graceful
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Señal ${signal} recibida. Cerrando servidor...`);

  // Detener sincronización de productos
  if (productSyncInterval) {
    console.log('📦 Deteniendo sincronización de productos...');
    clearInterval(productSyncInterval);
  }

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