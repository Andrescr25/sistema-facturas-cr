// prisma/client.js
const { PrismaClient } = require('@prisma/client');

// Singleton - una sola instancia global
const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;