/**
 * Configuración de Alegra API
 * Centraliza credenciales y configuración base
 */

module.exports = {
  baseURL: 'https://api.alegra.com/api/v1',
  credentials: {
    user: process.env.ALEGRA_USER,
    token: process.env.ALEGRA_TOKEN
  },
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000
};
