require('dotenv').config();

const imapConfig = {
  user: process.env.IMAP_USER,
  password: process.env.IMAP_PASSWORD,
  host: process.env.IMAP_HOST,
  port: 993,                 
  tls: true,                    
  authTimeout: 10000,
  connTimeout: 15000,
  tlsOptions: {
    rejectUnauthorized: false
  }
};

console.log('🔧 Configuración IMAP:', {
  user: imapConfig.user,
  host: imapConfig.host,
  port: imapConfig.port,
  tls: imapConfig.tls
});

module.exports = imapConfig;