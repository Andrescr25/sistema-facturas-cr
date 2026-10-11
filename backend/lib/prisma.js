// Rama independencia-alegra: solo contra la base local. Ver config/aislado.js.
require('../config/aislado').asegurarBaseLocal();
const { PrismaClient } = require('@prisma/client');

/**
 * Singleton de PrismaClient con configuración optimizada para Supabase free tier
 *
 * Supabase free tier limita a 1 conexión simultánea. Para evitar timeouts:
 * - connection_limit=1: Solo usar 1 conexión
 * - pool_timeout=10: Timeout de 10s esperando una conexión
 * - connect_timeout=30: Timeout de 30s para conectar inicialmente
 *
 * IMPORTANTE: Con 1 conexión, las operaciones deben ser rápidas y liberar la conexión inmediatamente
 */

let prisma;

const prismaConfig = {
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  // Log solo errores en producción para reducir overhead
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error']
};

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient(prismaConfig);
} else {
  // En desarrollo, reutilizar la instancia en hot-reloading
  if (!global.prisma) {
    global.prisma = new PrismaClient(prismaConfig);
  }
  prisma = global.prisma;
}

// Asegurar que las conexiones se liberen al cerrar el proceso
const cleanup = async () => {
  console.log('🔌 Cerrando conexiones Prisma...');
  await prisma.$disconnect();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('beforeExit', cleanup);

module.exports = prisma;
