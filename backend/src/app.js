/**
 * Configuración principal de la aplicación
 * Centraliza la configuración de Express y las rutas modulares
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

// Importar módulos
const invoiceRoutes = require('./modules/invoices');
const productRoutes = require('./modules/products');
const reportRoutes = require('./modules/reports');

// Importar rutas legacy (temporal hasta migración completa)
const legacyFacturaRoutes = require('../routes/facturas');
const legacyProveedorRoutes = require('../routes/proveedores');
const legacyFaltanteRoutes = require('../routes/faltantes');
const legacyRevisionPreciosRoutes = require('../routes/revisionPrecios');
const legacyProductosRevisionRoutes = require('../routes/productosRevision');

const app = express();

// ========== CONFIGURACIÓN CORS ==========
const corsOptions = {
  origin: function (origin, callback) {
    console.log(`🔍 CORS: Request from origin: ${origin || 'No origin'}`);

    if (!origin) {
      console.log('✅ CORS: Sin origin - permitido');
      return callback(null, true);
    }

    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://sistema-facturas-cr.onrender.com',
      'https://sistema-facturas-cr-web.onrender.com'
    ];

    if (origin.includes('.onrender.com') || allowedOrigins.includes(origin)) {
      console.log(`✅ CORS: ${origin} - PERMITIDO`);
      callback(null, true);
    } else {
      console.log(`✅ CORS: ${origin} - Permitiendo de todos modos`);
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'Content-Type', 'X-Total-Count'],
  optionsSuccessStatus: 200,
  preflightContinue: false,
  maxAge: 86400
};

// ========== MIDDLEWARE ==========
app.use(cors(corsOptions));

// Manejar preflight requests
app.options('*', (req, res) => {
  console.log(`🔄 OPTIONS request from: ${req.headers.origin || 'No origin'}`);
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(200);
});

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

// ========== SERVIR FRONTEND (SOLO EN DESARROLLO LOCAL) ==========
const isLocalDevelopment = process.env.LOCAL_DEV === 'true';
if (isLocalDevelopment) {
  console.log('📁 Sirviendo frontend desde backend (SOLO desarrollo local)');
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
} else {
  console.log('🚫 NO sirviendo frontend - Este es un servidor API puro');
}

// ========== RUTAS MODULARES (NUEVA ARQUITECTURA) ==========
console.log('📋 Configurando rutas modulares...');

// Módulo de Facturas (Invoices)
app.use('/api/alegra/facturas', invoiceRoutes);
console.log('   ✅ /api/alegra/facturas → Módulo Invoices');

// Módulo de Productos
app.use('/api/alegra/productos', productRoutes);
app.use('/api/alegra/sincronizar', productRoutes); // Ruta de sincronización
console.log('   ✅ /api/alegra/productos → Módulo Products');

// Módulo de Reportes
app.use('/api/alegra/reportes', reportRoutes);
console.log('   ✅ /api/alegra/reportes → Módulo Reports');

// ========== RUTAS LEGACY (TEMPORAL) ==========
console.log('📋 Configurando rutas legacy...');

app.use('/api/facturas', legacyFacturaRoutes);
app.use('/api/proveedores', legacyProveedorRoutes);
app.use('/api/faltantes', legacyFaltanteRoutes);
app.use('/api/revision-precios', legacyRevisionPreciosRoutes);
app.use('/api/productos-revision', legacyProductosRevisionRoutes);

console.log('   ⚠️  Rutas legacy activas (migración pendiente)');

// ========== RUTAS DE ESTADO ==========
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    database: 'Connected',
    architecture: 'Modular',
    timestamp: new Date().toISOString()
  });
});

app.get('/api', (req, res) => {
  res.json({
    message: 'API Sistema de Faltantes - Arquitectura Modular',
    version: '2.0.0',
    modules: [
      'invoices',
      'products',
      'reports'
    ],
    timestamp: new Date().toISOString()
  });
});

// ========== MANEJO DE ERRORES ==========
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno'
  });
});

// ========== CATCH-ALL HANDLER ==========
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      error: 'Ruta de API no encontrada',
      path: req.originalUrl,
      availableRoutes: [
        '/api/alegra/facturas/*',
        '/api/alegra/productos/*',
        '/api/alegra/reportes/*'
      ]
    });
  }

  if (isLocalDevelopment) {
    return res.sendFile(path.join(__dirname, '../../frontend/dist', 'index.html'));
  }

  res.status(404).json({
    error: 'Ruta no encontrada',
    message: 'Este es un servidor API puro. El frontend está en https://sistema-facturas-cr.onrender.com',
    path: req.originalUrl
  });
});

module.exports = app;
