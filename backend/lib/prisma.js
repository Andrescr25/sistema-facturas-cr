const { PrismaClient } = require('@prisma/client');

/**
 * Singleton de PrismaClient
 *
 * En desarrollo, reutiliza la misma instancia para evitar agotamiento del connection pool.
 * En producción, crea una sola instancia global.
 *
 * Esto es especialmente importante cuando el límite de conexiones es bajo (ej: Supabase free tier = 1)
 */

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // En desarrollo, reutilizar la instancia en hot-reloading
  if (!global.prisma) {
    global.prisma = new PrismaClient();
  }
  prisma = global.prisma;
}

module.exports = prisma;
