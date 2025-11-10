/**
 * Verificar mappings del producto CABLE TRASERO P/ MOTO SIN FORRO
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function verificarProducto() {
  console.log('🔍 Buscando producto: CABLE TRASERO P/ MOTO SIN FORRO\n');
  
  // Buscar en productos de Alegra
  const productosAlegra = await query(`
    SELECT 
      id,
      alegra_id as "alegraId",
      reference,
      name
    FROM alegra_products
    WHERE name ILIKE '%CABLE TRASERO%'
    OR name ILIKE '%MOTO%'
    ORDER BY name
  `);
  
  console.log(`📦 Productos en Alegra encontrados: ${productosAlegra.rows.length}\n`);
  productosAlegra.rows.forEach(p => {
    console.log(`   ID: ${p.alegraId}, Reference: "${p.reference}", Nombre: "${p.name}"`);
  });
  
  // Buscar mappings
  console.log('\n' + '='.repeat(70));
  console.log('🔍 Buscando mappings:\n');
  
  const mappings = await query(`
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
      origen,
      created_date as "createdDate"
    FROM supplier_product_mapping
    WHERE alegra_name ILIKE '%CABLE TRASERO%'
    OR supplier_desc ILIKE '%CABLE TRASERO%'
    OR alegra_name ILIKE '%MOTO%'
    OR supplier_desc ILIKE '%MOTO%'
    ORDER BY created_date DESC
  `);
  
  console.log(`📊 Mappings encontrados: ${mappings.rows.length}\n`);
  
  for (const m of mappings.rows) {
    console.log('─'.repeat(70));
    console.log(`📦 Producto Alegra:`);
    console.log(`   ID: ${m.alegraItemId}`);
    console.log(`   Reference: "${m.alegraReference}"`);
    console.log(`   Nombre: "${m.alegraName}"`);
    console.log(`\n🏢 Proveedor:`);
    console.log(`   Nombre: ${m.supplierName}`);
    console.log(`   Cédula: ${m.supplierCedula}`);
    console.log(`   Código: "${m.supplierCode}"`);
    console.log(`   Descripción: "${m.supplierDesc}"`);
    console.log(`\n📋 Mapping:`);
    console.log(`   ID: ${m.id}`);
    console.log(`   Origen: ${m.origen}`);
    console.log(`   Confianza: ${m.confidence}%`);
    console.log(`   Fecha: ${m.createdDate}`);
    
    const sonDatosReales = m.supplierCode !== m.alegraReference || 
                          m.supplierDesc !== m.alegraName;
    
    if (sonDatosReales) {
      console.log(`   ✅ DATOS REALES DEL PROVEEDOR`);
    } else {
      console.log(`   ⚠️ DATOS DE ALEGRA`);
    }
    console.log();
  }
  
  // Verificar si aparece en productos relacionados
  console.log('='.repeat(70));
  console.log('🔍 Verificando si aparece en /relacionados:\n');
  
  // Simular la query de productos relacionados
  const productosRelacionados = await query(`
    SELECT DISTINCT
      spm.alegra_reference as "alegraReference",
      spm.alegra_name as "alegraName",
      spm.alegra_item_id as "alegraItemId"
    FROM supplier_product_mapping spm
    WHERE spm.alegra_name ILIKE '%CABLE TRASERO%'
    OR spm.alegra_name ILIKE '%MOTO%'
  `);
  
  console.log(`📊 Productos relacionados encontrados: ${productosRelacionados.rows.length}\n`);
  productosRelacionados.rows.forEach(p => {
    console.log(`   Reference: "${p.alegraReference}", ID: ${p.alegraItemId}, Nombre: "${p.alegraName}"`);
  });
  
  process.exit(0);
}

verificarProducto().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
