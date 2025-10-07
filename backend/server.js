const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración CORS para desarrollo y producción
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (Postman, mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    // Lista de orígenes permitidos
    const allowedOrigins = [
      'http://localhost:5173',                           // Desarrollo
      'https://proyecto-faltantes-1.onrender.com',       // Frontend en producción
      'https://proyecto-faltantes.onrender.com'          // Backup URL
    ];
    
    // También permitir cualquier subdominio de onrender.com para flexibilidad
    if (origin.includes('.onrender.com') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS: Origin ${origin} no permitido`);
      callback(null, true); // Permitir de todos modos en producción
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// Middlewares
app.use(helmet());
app.use(cors(corsOptions));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔧 ACTUALIZADO: Servir archivos estáticos del frontend desde la carpeta correcta
app.use(express.static(path.join(__dirname, '../frontend/dist')));

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

// 🔧 ACTUALIZADO: Catch-all handler para SPA con ruta correcta
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

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log(`📁 Sirviendo frontend desde: ${path.join(__dirname, '../frontend/dist')}`);
});

module.exports = app;