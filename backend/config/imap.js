require('dotenv').config();
require('./aislado'); // la rama aislada no lee el buzón: ver config/aislado.js

const imapConfig = {
  user: process.env.IMAP_USER,
  password: process.env.IMAP_PASSWORD,
  host: process.env.IMAP_HOST || 'imap.gmail.com',
  port: parseInt(process.env.IMAP_PORT) || 993,
  tls: true,
  authTimeout: 10000,
  connTimeout: 15000,
  tlsOptions: {
    rejectUnauthorized: false
  }
};

console.log('🔧 Configuración IMAP:', {
  user: imapConfig.user ? `${imapConfig.user.substring(0, 5)}...` : 'NO CONFIGURADO',
  host: imapConfig.host,
  port: imapConfig.port,
  tls: imapConfig.tls
});

module.exports = imapConfig;

