/**
 * Verificar si existen mappings con datos REALES del proveedor
 * para los productos problemáticos
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function verificarMappings() {
  console.log('🔍 Buscando mappings para productos 1026 y 1084\n');
  
  const result = await query(`
    SELECT 
      id,
      supplier_name as "supplierName",
      supplier_cedula as "supplierCedula",
      supplier_code as "supplierCode",
      supplier_desc as "supplierDesc",
      alegra_reference as "alegraReference",
      alegra_name as "alegraName",
      confidence,
      origen,
      created_date as "createdDate"
    FROM supplier_product_mapping
    WHERE alegra_reference IN ('1026', '1084')
    ORDER BY supplier_name, created_date DESC
  `);
  
  console.log(`📊 Encontrados ${result.rows.length} mappings\n`);
  
  for (const mapping of result.rows) {
    console.log('─'.repeat(70));
    console.log(`📦 Producto Alegra: ${mapping.alegraReference} - ${mapping.alegraName}`);
    console.log(`🏢 Proveedor: ${mapping.supplierName}`);
    console.log(`   Cédula: ${mapping.supplierCedula}`);
    console.log(`   Origen: ${mapping.origen}`);
    console.log(`   Fecha: ${mapping.createdDate}`);
    console.log(`\n📋 Datos del proveedor:`);
    console.log(`   Código: "${mapping.supplierCode}"`);
    console.log(`   Descripción: "${mapping.supplierDesc}"`);
    
    // Verificar si son datos reales o de Alegra
    const sonDatosReales = mapping.supplierCode !== mapping.alegraReference || 
                          mapping.supplierDesc !== mapping.alegraName;
    
    if (sonDatosReales) {
      console.log(`   ✅ DATOS REALES DEL PROVEEDOR`);
    } else {
      console.log(`   ⚠️ DATOS DE ALEGRA (no reales del proveedor)`);
    }
    console.log();
  }
  
  process.exit(0);
}

verificarMappings().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
