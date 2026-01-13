/**
 * Admin Module - Service
 * Lógica de negocio para operaciones administrativas y de debug
 */

const { query } = require('../../../config/database');
const { PrismaClient } = require('@prisma/client');

let prisma = null;
try {
  prisma = new PrismaClient();
} catch (e) {
  console.log('⚠️ Prisma no disponible para módulo admin');
}

/**
 * Test simple de conexión a la base de datos
 */
async function testSimpleConnection() {
  const tests = [];

  // Test 1: Conexión básica
  tests.push({ test: 'Conexión básica', status: 'OK', result: 'Endpoint alcanzado' });

  // Test 2: Verificar DATABASE_URL
  tests.push({
    test: 'DATABASE_URL configurada',
    status: process.env.DATABASE_URL ? 'OK' : 'ERROR',
    result: process.env.DATABASE_URL ? 'Sí existe' : 'NO EXISTE'
  });

  // Test 3: Prisma
  if (prisma) {
    try {
      const prismaTest = await prisma.$queryRaw`SELECT 1 as test`;
      tests.push({ test: 'Prisma conexión', status: 'OK', result: prismaTest });
    } catch (e) {
      tests.push({ test: 'Prisma conexión', status: 'ERROR', error: e.message, code: e.code });
    }
  } else {
    tests.push({ test: 'Prisma conexión', status: 'SKIP', result: 'Prisma no disponible' });
  }

  // Test 4: Query SQL directa
  try {
    const sqlTest = await query('SELECT NOW() as time');
    tests.push({ test: 'SQL Query directa', status: 'OK', result: sqlTest.rows[0] });
  } catch (e) {
    tests.push({ test: 'SQL Query directa', status: 'ERROR', error: e.message, code: e.code });
  }

  // Test 5-7: Contar tablas principales
  const tablesToCount = ['productos', 'proveedores', 'faltantes'];
  for (const table of tablesToCount) {
    try {
      const countTest = await query(`SELECT COUNT(*) FROM ${table}`);
      tests.push({ test: `COUNT ${table}`, status: 'OK', result: countTest.rows[0].count });
    } catch (e) {
      tests.push({ test: `COUNT ${table}`, status: 'ERROR', error: e.message, code: e.code });
    }
  }

  return {
    success: true,
    total_tests: tests.length,
    passed: tests.filter(t => t.status === 'OK').length,
    failed: tests.filter(t => t.status === 'ERROR').length,
    tests: tests,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      has_database_url: !!process.env.DATABASE_URL
    }
  };
}

/**
 * Obtiene información detallada de la base de datos
 */
async function getDatabaseInfo() {
  // Test 1: Verificar conexión
  const timeResult = await query('SELECT NOW() as time');

  // Test 2: Listar todas las tablas
  const tablesResult = await query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `);

  const allTables = tablesResult.rows.map(r => r.table_name);

  // Test 3: Obtener estructura de cada tabla
  const tableStructures = {};
  for (const tableName of allTables) {
    try {
      const columnsResult = await query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      tableStructures[tableName] = columnsResult.rows;
    } catch (e) {
      tableStructures[tableName] = 'ERROR: ' + e.message;
    }
  }

  // Test 4: Contar registros en todas las tablas
  const counts = {};
  for (const tableName of allTables) {
    try {
      const countResult = await query(`SELECT COUNT(*) FROM "${tableName}"`);
      counts[tableName] = countResult.rows[0].count;
    } catch (e) {
      counts[tableName] = 'ERROR: ' + e.message;
    }
  }

  // Test 5: Verificar tablas esperadas
  const expectedTables = [
    'proveedores', 'productos', 'facturas', 'factura_items',
    'faltantes', 'faltantes_ajustes', 'procesamientos',
    'facturas_reimpresion', 'configuracion_semanal'
  ];

  const missingTables = expectedTables.filter(t => !allTables.includes(t));
  const existingExpectedTables = expectedTables.filter(t => allTables.includes(t));

  return {
    success: true,
    database_time: timeResult.rows[0].time,
    summary: {
      total_tables: allTables.length,
      sistema_faltantes: {
        expected: expectedTables.length,
        existing: existingExpectedTables.length,
        missing: missingTables.length,
        missing_tables: missingTables
      }
    },
    all_tables: allTables,
    table_structures: tableStructures,
    record_counts: counts,
    message: 'Database debug info completo'
  };
}

module.exports = {
  testSimpleConnection,
  getDatabaseInfo
};
