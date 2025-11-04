/**
 * Servidor Principal - Arquitectura Modular
 * Punto de entrada de la aplicación con arquitectura limpia
 */

require('dotenv').config();

const app = require('./src/app');
const EmailService = require('./services/emailService');

const PORT = process.env.PORT || 3000;

// Variable global para el servicio de email
let emailService = null;

// ========== INICIAR SERVIDOR ==========
const server = app.listen(PORT, () => {
  console.log('\n');
  console.log('========================================');
  console.log('🚀 SERVIDOR INICIADO');
  console.log('========================================');
  console.log(`📍 Puerto: ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log('========================================');
  console.log('');
  console.log('📦 ARQUITECTURA MODULAR ACTIVA');
  console.log('   ✅ Módulo: Invoices (Facturas)');
  console.log('   ✅ Módulo: Products (Productos)');
  console.log('   ✅ Módulo: Reports (Reportes)');
  console.log('   ✅ Integración: Alegra API');
  console.log('   ✅ Utilidades: Database, Validators, Response');
  console.log('========================================');
  console.log('');

  // Iniciar monitoreo de emails si está configurado
  if (process.env.IMAP_USER && process.env.IMAP_PASSWORD && process.env.ENABLE_EMAIL_MONITORING !== 'false') {
    console.log('📧 ========================================');
    console.log('📧 INICIANDO MONITOREO DE EMAILS...');
    console.log('📧 ========================================');
    console.log('');

    emailService = new EmailService();
    emailService.startMonitoring();
  } else {
    console.log('⚠️  Monitoreo de emails desactivado');
    console.log('   Configura IMAP_USER e IMAP_PASSWORD en .env para activarlo');
    console.log('   O establece ENABLE_EMAIL_MONITORING=false para desactivar este mensaje');
    console.log('');
  }
});

// ========== GRACEFUL SHUTDOWN ==========
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
    console.error('⚠️  Forzando cierre del servidor...');
    process.exit(1);
  }, 10000);
};

// ========== SIGNAL HANDLERS ==========
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ========== ERROR HANDLERS ==========
process.on('uncaughtException', (error) => {
  console.error('❌ Excepción no capturada:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
});

module.exports = server;
