require('dotenv').config();
const EmailService = require('./services/emailService');

console.log('🚀 Iniciando Sistema de Facturas CR');

// Crear servicio de email
const emailService = new EmailService();

// Conectar y revisar emails
emailService.connect();

// Revisar emails cada 5 minutos
setInterval(() => {
    console.log('\n⏰ Revisión automática...');
    if (emailService.imap.state === 'disconnected') {
        emailService.connect();
    } else {
        emailService.checkForNewEmails();
    }
}, 5 * 60 * 1000);

// Manejar cierre del sistema
process.on('SIGINT', async () => {
    console.log('\n🔌 Cerrando sistema...');
    try {
        await emailService.disconnect();
    } catch (error) {
        console.error('Error cerrando servicios:', error);
    }
    process.exit(0);
});

// Manejar errores no capturados
process.on('uncaughtException', async (error) => {
    console.error('❌ Error no capturado:', error);
    try {
        await emailService.disconnect();
    } catch (err) {
        console.error('Error cerrando servicios:', err);
    }
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('❌ Promesa rechazada:', reason);
    try {
        await emailService.disconnect();
    } catch (error) {
        console.error('Error cerrando servicios:', error);
    }
    process.exit(1);
});