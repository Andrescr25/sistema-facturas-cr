/**
 * Verificar el mapping real de UNION LISA
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function verificarMapping() {
  console.log('🔍 Buscando mappings de UNION LISA con proveedor Plastimex\n');
  
  // Buscar por nombre del producto
  const result = await query(`
    SELECT 
      id,
      supplier_name as "supplierName",
      supplier_cedula as "supplierCedula",
      supplier_code as "supplierCode",
      supplier_desc as "supplierDesc",
      alegra_reference as "alegraReference",
      alegra_name as "alegraName",
      alegra_item_id as "alegraItemId",
      confidence,
      origen
    FROM supplier_product_mapping
    WHERE supplier_name ILIKE '%Plastimex%'
    AND (alegra_name ILIKE '%UNION LISA%' OR supplier_desc ILIKE '%UNION LISA%')
    ORDER BY created_date DESC
  `);
  
  console.log(`📊 Encontrados ${result.rows.length} mappings\n`);
  
  for (const mapping of result.rows) {
    console.log('─'.repeat(70));
    console.log(`📦 Producto Alegra:`);
    console.log(`   ID: ${mapping.alegraItemId}`);
    console.log(`   Reference: "${mapping.alegraReference}"`);
    console.log(`   Nombre: "${mapping.alegraName}"`);
    console.log(`\n🏢 Proveedor:`);
    console.log(`   Nombre: ${mapping.supplierName}`);
    console.log(`   Cédula: ${mapping.supplierCedula}`);
    console.log(`   Código: "${mapping.supplierCode}"`);
    console.log(`   Descripción: "${mapping.supplierDesc}"`);
    console.log(`\n📋 Mapping ID: ${mapping.id}`);
    console.log(`   Origen: ${mapping.origen}`);
    console.log(`   Confianza: ${mapping.confidence}%`);
    
    // Verificar si son datos reales
    const sonDatosReales = mapping.supplierCode !== mapping.alegraReference || 
                          mapping.supplierDesc !== mapping.alegraName;
    
    if (sonDatosReales) {
      console.log(`   ✅ DATOS REALES DEL PROVEEDOR`);
    } else {
      console.log(`   ⚠️ DATOS DE ALEGRA`);
    }
    console.log();
  }
  
  // También buscar por código 1084
  console.log('\n' + '='.repeat(70));
  console.log('🔍 Buscando específicamente por referencia "1084":\n');
  
  const result1084 = await query(`
    SELECT 
      id,
      supplier_code as "supplierCode",
      supplier_desc as "supplierDesc",
      alegra_reference as "alegraReference",
      alegra_name as "alegraName",
      supplier_name as "supplierName"
    FROM supplier_product_mapping
    WHERE alegra_reference = '1084'
    AND supplier_name ILIKE '%Plastimex%'
  `);
  
  if (result1084.rows.length > 0) {
    console.log(`✅ Encontrado mapping para referencia "1084":`);
    result1084.rows.forEach(m => {
      console.log(`   Código proveedor: "${m.supplierCode}"`);
      console.log(`   Descripción proveedor: "${m.supplierDesc}"`);
    });
  } else {
    console.log(`❌ NO se encontró mapping para referencia "1084" con Plastimex`);
    console.log(`   Esto explica por qué el PDF no encuentra los datos del proveedor`);
  }
  
  process.exit(0);
}

verificarMapping().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
