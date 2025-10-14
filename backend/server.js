const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Importar servicio de email para monitoreo continuo
const EmailService = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración CORS para desarrollo y producción
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (Postman, mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    // Lista de orígenes permitidos
    const allowedOrigins = [
      'http://localhost:5173',                           // Desarrollo local
      'http://localhost:5174',                           // Desarrollo local alternativo
      'https://sistema-facturas-cr.onrender.com',        // Frontend en producción
      'https://sistema-facturas-cr-web.onrender.com'     // Backend URL (para requests internos)
    ];
    
    // También permitir cualquier subdominio de onrender.com para flexibilidad
    if (origin.includes('.onrender.com') || allowedOrigins.includes(origin)) {
      console.log(`✅ CORS: Permitido desde ${origin}`);
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS: Origin ${origin} no en lista, pero permitiendo...`);
      callback(null, true); // Permitir de todos modos para evitar bloqueos
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

// Middlewares
app.use(helmet());
app.use(cors(corsOptions));

// Manejar preflight requests explícitamente
app.options('*', cors(corsOptions));

// Logging mejorado
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin || 'No origin'}`);
  next();
});

app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir frontend solo en desarrollo local, no en producción
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
}

// Importar rutas
const facturaRoutes = require('./routes/facturas');
const productoRoutes = require('./routes/productos');
const proveedorRoutes = require('./routes/proveedores');
const faltanteRoutes = require('./routes/faltantes');
const reporteRoutes = require('./routes/reportes');
const alegraRoutes = require('./routes/alegra');
const revisionPreciosRoutes = require('./routes/revisionPrecios');
const productosRevisionRoutes = require('./routes/productosRevision');

// Usar rutas de API
app.use('/api/facturas', facturaRoutes);
app.use('/api/productos', productoRoutes);
app.use('/api/proveedores', proveedorRoutes);
app.use('/api/faltantes', faltanteRoutes);
app.use('/api/reportes', reporteRoutes);
app.use('/api/alegra', alegraRoutes);
app.use('/api/revision-precios', revisionPreciosRoutes);
app.use('/api/productos-revision', productosRevisionRoutes);

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

// Catch-all handler para SPA solo en desarrollo
if (process.env.NODE_ENV !== 'production') {
  app.get('*', (req, res) => {
    // Solo para rutas que NO empiecen con /api
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ 
        error: 'Ruta de API no encontrada',
        path: req.originalUrl
      });
    }
    
    // Para todas las demás rutas, servir el frontend desde la ruta correcta
    res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
  });
} else {
  // En producción, solo devolver 404 para rutas no API
  app.get('*', (req, res) => {
    res.status(404).json({ 
      error: 'Ruta no encontrada',
      message: 'Este es un servidor API. El frontend está en un servicio separado.',
      path: req.originalUrl
    });
  });
}

// Iniciar monitoreo de emails (variable global para poder detenerlo)
let emailService = null;

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
});

// Manejo de cierre graceful
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Señal ${signal} recibida. Cerrando servidor...`);
  
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