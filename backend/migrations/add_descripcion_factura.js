const { query } = require('../config/database');

async function migrate() {
  try {
    console.log('📋 Agregando columna descripcion_factura a tabla faltantes...');

    await query(`
      ALTER TABLE faltantes
      ADD COLUMN IF NOT EXISTS descripcion_factura TEXT
    `);

    console.log('✅ Columna descripcion_factura agregada exitosamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  }
}

migrate();
