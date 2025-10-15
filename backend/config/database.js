const { Pool } = require('pg');
require('dotenv').config();

// Configuración de la conexión a PostgreSQL usando DATABASE_URL
const sslConfig = process.env.NODE_ENV === 'production' 
  ? {
      rejectUnauthorized: false,
      require: true
    }
  : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig
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
      AND table_name IN ('proveedores', 'productos', 'facturas', 'faltantes', 'factura_items')
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
      
      await query(`
        CREATE TABLE IF NOT EXISTS facturas (
          id SERIAL PRIMARY KEY,
          numero_factura VARCHAR(100) NOT NULL UNIQUE,
          alegra_id INTEGER NOT NULL,
          cliente_nombre VARCHAR(255) NOT NULL,
          cliente_email VARCHAR(100),
          fecha_emision DATE NOT NULL,
          semana INTEGER NOT NULL,
          mes INTEGER NOT NULL,
          ano INTEGER NOT NULL,
          total DECIMAL(10,2),
          estado_procesamiento VARCHAR(50) DEFAULT 'listo',
          observaciones_adicionales TEXT,
          procesada BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await query(`
        CREATE TABLE IF NOT EXISTS factura_items (
          id SERIAL PRIMARY KEY,
          factura_id INTEGER REFERENCES facturas(id),
          producto_id INTEGER REFERENCES productos(id),
          cantidad_original INTEGER NOT NULL,
          cantidad_entregada INTEGER DEFAULT 0,
          precio_unitario DECIMAL(10,2),
          subtotal DECIMAL(10,2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await query(`
        CREATE TABLE IF NOT EXISTS faltantes (
          id SERIAL PRIMARY KEY,
          factura_id INTEGER REFERENCES facturas(id),
          producto_id INTEGER REFERENCES productos(id),
          cantidad_faltante INTEGER NOT NULL,
          tipo_faltante VARCHAR(20) NOT NULL CHECK (tipo_faltante IN ('total', 'parcial')),
          observaciones TEXT,
          registrado_por VARCHAR(100),
          estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesado', 'en_reimpresion')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await query(`
        CREATE TABLE IF NOT EXISTS faltantes_ajustes (
          id SERIAL PRIMARY KEY,
          faltante_id INTEGER REFERENCES faltantes(id),
          cantidad_entregada INTEGER NOT NULL,
          estado VARCHAR(20) DEFAULT 'pendiente',
          requiere_actualizacion BOOLEAN DEFAULT FALSE,
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