const { Pool } = require('pg');
require('dotenv').config();

// Deshabilitar verificación SSL para Supabase
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? {
    rejectUnauthorized: false
  } : false
});

async function applyMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Aplicando migración para columna accion...');
    
    // Agregar columna accion
    await client.query(`
      ALTER TABLE orden_compra_temporal 
      ADD COLUMN IF NOT EXISTS accion VARCHAR(20) DEFAULT 'modificado';
    `);
    console.log('✅ Columna accion agregada');
    
    // Actualizar registros existentes
    await client.query(`
      UPDATE orden_compra_temporal 
      SET accion = 'modificado' 
      WHERE accion IS NULL;
    `);
    console.log('✅ Registros existentes actualizados');
    
    // Agregar comentario
    await client.query(`
      COMMENT ON COLUMN orden_compra_temporal.accion IS 'Tipo de acción: modificado, eliminado, agregado';
    `);
    console.log('✅ Comentario agregado');
    
    // Crear índice
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orden_compra_accion ON orden_compra_temporal(accion);
    `);
    console.log('✅ Índice creado');
    
    console.log('🎉 Migración completada exitosamente');
    
  } catch (error) {
    console.error('❌ Error aplicando migración:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration()
  .then(() => {
    console.log('✅ Script completado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script falló:', error);
    process.exit(1);
  });

