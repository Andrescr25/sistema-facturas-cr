const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Necesario para Render
});

async function setupDatabase() {
  const client = await pool.connect();

  try {
    console.log('🔄 Iniciando configuración de la base de datos...');

    // Verificar conexión
    const result = await client.query('SELECT NOW()');
    console.log('✅ Conexión exitosa:', result.rows[0].now);

    // ============================================
    // 🗑️ ELIMINAR TODO (TEMPORAL)
    // ============================================
    console.log('🗑️ ELIMINANDO TODAS LAS TABLAS...');

    // Eliminar en orden correcto (por dependencias)
    await client.query('DROP TABLE IF EXISTS rotacion_productos CASCADE');
    await client.query('DROP TABLE IF EXISTS orden_compra_temporal CASCADE');
    await client.query('DROP TABLE IF EXISTS faltantes_ajustes CASCADE');
    await client.query('DROP TABLE IF EXISTS facturas_reimpresion CASCADE');
    await client.query('DROP TABLE IF EXISTS procesamientos CASCADE');
    await client.query('DROP TABLE IF EXISTS configuracion_semanal CASCADE');
    await client.query('DROP TABLE IF EXISTS faltantes CASCADE');
    await client.query('DROP TABLE IF EXISTS factura_items CASCADE');
    await client.query('DROP TABLE IF EXISTS facturas CASCADE');
    await client.query('DROP TABLE IF EXISTS productos CASCADE');
    await client.query('DROP TABLE IF EXISTS proveedores CASCADE');

    // Eliminar función si existe
    await client.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE');

    console.log('✅ Todas las tablas eliminadas');

    // ============================================
    // 📋 CREAR TABLAS DESDE CERO
    // ============================================

    // Crear tabla de proveedores
    console.log('📋 Creando tabla proveedores...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS proveedores (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(255) NOT NULL,
          contacto VARCHAR(255),
          telefono VARCHAR(50),
          email VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de productos
    console.log('📋 Creando tabla productos...');
    await client.query(`
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

    // Crear tabla de facturas
    console.log('📋 Creando tabla facturas...');
    await client.query(`
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
          procesada BOOLEAN DEFAULT FALSE,
          estado_procesamiento VARCHAR(20) DEFAULT 'pendiente' CHECK (estado_procesamiento IN ('pendiente', 'procesado')),
          observaciones_adicionales TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de items de factura
    console.log('📋 Creando tabla factura_items...');
    await client.query(`
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

    // Crear tabla de faltantes
    console.log('📋 Creando tabla faltantes...');
    await client.query(`
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

    // Crear tabla de configuración semanal
    console.log('📋 Creando tabla configuracion_semanal...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS configuracion_semanal (
          id SERIAL PRIMARY KEY,
          semana INTEGER NOT NULL,
          mes INTEGER NOT NULL,
          ano INTEGER NOT NULL,
          fecha_inicio DATE NOT NULL,
          fecha_fin DATE NOT NULL,
          activa BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de procesamientos
    console.log('📋 Creando tabla procesamientos...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS procesamientos (
          id SERIAL PRIMARY KEY,
          fecha_procesamiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          total_facturas INTEGER NOT NULL,
          facturas_para_historial INTEGER NOT NULL,
          facturas_para_reimpresion INTEGER NOT NULL,
          procesado_por VARCHAR(100),
          detalles JSONB
      )
    `);

    // Crear tabla de facturas_reimpresion
    console.log('📋 Creando tabla facturas_reimpresion...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_reimpresion (
          id SERIAL PRIMARY KEY,
          factura_id INTEGER REFERENCES facturas(id),
          ajustes_realizados JSONB NOT NULL,
          estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesada')),
          fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          fecha_procesamiento TIMESTAMP
      )
    `);

    // Crear tabla de ajustes temporales para faltantes
    console.log('📋 Creando tabla faltantes_ajustes...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS faltantes_ajustes (
          id SERIAL PRIMARY KEY,
          faltante_id INTEGER REFERENCES faltantes(id) UNIQUE,
          cantidad_entregada INTEGER NOT NULL,
          estado VARCHAR(20) NOT NULL CHECK (estado IN ('completo', 'parcial', 'no_llego')),
          requiere_actualizacion BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla para facturas marcadas como pendientes manualmente
    console.log('📋 Creando tabla facturas_pendientes...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas_pendientes (
          id SERIAL PRIMARY KEY,
          factura_id INTEGER REFERENCES facturas(id) UNIQUE,
          alegra_id INTEGER NOT NULL,
          motivo TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla para cantidades modificadas de órdenes de compra
    console.log('📋 Creando tabla orden_compra_temporal...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS orden_compra_temporal (
          id SERIAL PRIMARY KEY,
          proveedor_nombre VARCHAR(255) NOT NULL,
          producto_codigo VARCHAR(100) NOT NULL,
          producto_nombre VARCHAR(255) NOT NULL,
          cantidad_original INTEGER NOT NULL,
          cantidad_modificada INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(proveedor_nombre, producto_codigo)
      )
    `);

    // Crear tabla para rotación histórica de productos
    console.log('📋 Creando tabla rotacion_productos...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS rotacion_productos (
          id SERIAL PRIMARY KEY,
          producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
          producto_codigo VARCHAR(100) NOT NULL,
          producto_nombre VARCHAR(255) NOT NULL,
          proveedor_id INTEGER REFERENCES proveedores(id),
          proveedor_nombre VARCHAR(255),
          semana INTEGER NOT NULL,
          ano INTEGER NOT NULL,
          fecha_inicio_semana DATE NOT NULL,
          faltantes_registrados INTEGER DEFAULT 0,
          cantidad_faltante_total INTEGER DEFAULT 0,
          costo_total NUMERIC(18,2) DEFAULT 0,
          venta_total NUMERIC(18,2) DEFAULT 0,
          margen_total NUMERIC(18,2) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (producto_id, semana, ano)
      )
    `);

    // Crear función para actualizar updated_at automáticamente
    console.log('📋 Creando función para updated_at...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
         NEW.updated_at = CURRENT_TIMESTAMP;
         RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    // Crear triggers para updated_at
    console.log('📋 Creando triggers para updated_at...');
    await client.query(`
      CREATE TRIGGER update_faltantes_updated_at 
        BEFORE UPDATE ON faltantes 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query(`
      CREATE TRIGGER update_faltantes_ajustes_updated_at 
        BEFORE UPDATE ON faltantes_ajustes 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query(`
      CREATE TRIGGER update_facturas_pendientes_updated_at
        BEFORE UPDATE ON facturas_pendientes
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query(`
      CREATE TRIGGER update_orden_compra_temporal_updated_at 
        BEFORE UPDATE ON orden_compra_temporal 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);
    await client.query(`
      CREATE TRIGGER update_rotacion_productos_updated_at
        BEFORE UPDATE ON rotacion_productos
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    // Crear índices
    console.log('📋 Creando índices...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_facturas_semana_mes_ano ON facturas(semana, mes, ano)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_facturas_numero ON facturas(numero_factura)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_facturas_cliente ON facturas(cliente_nombre)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON productos(proveedor_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_faltantes_factura ON faltantes(factura_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_faltantes_producto ON faltantes(producto_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_faltantes_ajustes_faltante ON faltantes_ajustes(faltante_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orden_compra_proveedor ON orden_compra_temporal(proveedor_nombre)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orden_compra_producto ON orden_compra_temporal(producto_codigo)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_facturas_pendientes_factura ON facturas_pendientes(factura_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_facturas_pendientes_alegra ON facturas_pendientes(alegra_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rotacion_productos_producto ON rotacion_productos(producto_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rotacion_productos_semana ON rotacion_productos(ano, semana)
    `);

    // Insertar datos de ejemplo
    console.log('📋 Insertando datos de ejemplo...');

    // Proveedores de ejemplo
    await client.query(`
      INSERT INTO proveedores (nombre, contacto, telefono, email) VALUES
      ('Proveedor A', 'Juan Pérez', '555-0001', 'juan@proveedora.com'),
      ('Proveedor B', 'María González', '555-0002', 'maria@proveedorb.com'),
      ('Proveedor C', 'Carlos Rodríguez', '555-0003', 'carlos@proveedorc.com')
    `);

    // Productos de ejemplo
    await client.query(`
      INSERT INTO productos (nombre, codigo, descripcion, proveedor_id, precio_unitario) VALUES
      ('Producto 1', 'P001', 'Descripción del producto 1', 1, 10.50),
      ('Producto 2', 'P002', 'Descripción del producto 2', 1, 15.75),
      ('Producto 3', 'P003', 'Descripción del producto 3', 2, 8.25),
      ('Producto 4', 'P004', 'Descripción del producto 4', 2, 12.00),
      ('Producto 5', 'P005', 'Descripción del producto 5', 3, 20.00)
    `);

    console.log('✅ Datos de ejemplo insertados');

    // Verificar que todo esté bien
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📋 Tablas creadas:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    console.log('🎉 ¡Base de datos reiniciada y configurada exitosamente!');

  } catch (error) {
    console.error('❌ Error configurando la base de datos:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar el setup
setupDatabase()
  .then(() => {
    console.log('✅ Setup completado - BD completamente limpia');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error en setup:', error);
    process.exit(1);
  });