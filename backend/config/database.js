const { Pool } = require('pg');
require('dotenv').config();

// SOLUCIÓN CRÍTICA: Deshabilitar verificación SSL globalmente para Supabase
// Esto es necesario porque Supabase usa certificados que Node.js rechaza
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.log('⚠️ SSL verification disabled for Supabase connection');
}

// Configuración de la conexión a PostgreSQL usando DATABASE_URL
const isSupabase = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase');

// Para Supabase, configuración optimizada para PgBouncer
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isSupabase ? {
    rejectUnauthorized: false
  } : false,
  // Configuración adicional para Supabase con PgBouncer
  ...(isSupabase && {
    connectionTimeoutMillis: 60000, // Aumentado a 60s para soportar lentitud
    idleTimeoutMillis: 30000,
    // max: 10, // Eliminado para usar el valor de DATABASE_URL (connection_limit)
    // allowExitOnIdle: true // Comentado para mantener conexiones vivas
  })
});

// Manejo de errores inesperados en el pool de conexiones (PgBouncer/Supabase)
pool.on('error', (err) => {
  console.error(' Error inesperado en el pool de conexiones de base de datos:', err.message);
});

// Debug para verificar la conexión
console.log('🔍 Database: Conectando usando DATABASE_URL');
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  console.log('✅ Database config:', {
    host: url.hostname,
    port: url.port || 5432,
    database: url.pathname.slice(1),
    ssl: true
  });
} else {
  console.warn('⚠️ DATABASE_URL no está configurada');
}


// Función para verificar la conexión
const checkConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Conexión a PostgreSQL establecida correctamente');
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Error conectando a PostgreSQL:', error.message);
    return false;
  }
};

// Función helper para ejecutar queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', { text, error: error.message });
    throw error;
  }
};

// Función para obtener un cliente para transacciones
const getClient = async () => {
  return await pool.connect();
};

// Función para inicializar la base de datos (verificar conexión)
const initializeDatabase = async () => {
  try {
    console.log('🔄 Verificando conexión a base de datos...');

    // Solo verificar que la conexión funcione
    const result = await query(`SELECT NOW() as current_time`);
    console.log('✅ Conexión a base de datos establecida:', result.rows[0].current_time);

    // Las tablas ya existen en la BD (ambos sistemas usan la misma BD)
    // - Sistema de Faltantes: facturas, productos, proveedores, faltantes, etc.
    // - Sistema IMAP: facturas_proveedores, ProductoFactura, etc. (Prisma)

  } catch (error) {
    console.error('❌ Error conectando a base de datos:', error.message);
    throw error;
  }
};

// Cerrar todas las conexiones del pool
const closePool = async () => {
  try {
    await pool.end();
    console.log('🔌 Pool de conexiones cerrado');
  } catch (error) {
    console.error('❌ Error cerrando pool:', error.message);
  }
};

// Manejar el cierre del proceso
process.on('SIGINT', async () => {
  console.log('\n🛑 Cerrando aplicación...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Cerrando aplicación...');
  await closePool();
  process.exit(0);
});

module.exports = {
  pool,
  query,
  getClient,
  checkConnection,
  initializeDatabase,
  closePool
};