const { Pool } = require('pg');
require('dotenv').config();

// Configuración de la conexión a PostgreSQL usando DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
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

// Función para inicializar la base de datos (crear tablas si no existen)
const initializeDatabase = async () => {
  try {
    console.log('🔄 Inicializando base de datos...');
    
    // Verificar si las tablas existen
    const tableCheck = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('proveedores', 'productos', 'facturas')
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log('📋 Creando tablas...');
      
      // Crear tablas básicas (el SQL completo está en database.sql)
      await query(`
        CREATE TABLE IF NOT EXISTS proveedores (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(255) NOT NULL,
          contacto VARCHAR(255),
          telefono VARCHAR(50),
          email VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await query(`
        CREATE TABLE IF NOT EXISTS productos (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(255) NOT NULL,
          codigo VARCHAR(100),
          descripcion TEXT,
          proveedor_id INTEGER REFERENCES proveedores(id),
          precio_unitario DECIMAL(10,2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      console.log('✅ Tablas creadas correctamente');
    } else {
      console.log('✅ Tablas ya existen');
    }
    
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error.message);
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