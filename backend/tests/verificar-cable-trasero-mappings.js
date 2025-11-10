/**
 * Verificar TODOS los mappings del producto CABLE TRASERO P/ MOTO SIN FORRO
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function verificarMappings() {
  console.log('🔍 Buscando TODOS los mappings de CABLE TRASERO P/ MOTO SIN FORRO\n');
  
  // Buscar por código 705
  const mappingsPorCodigo = await query(`
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
      created_date as "createdDate",
      last_used_date as "lastUsedDate",
      times_used
    FROM supplier_product_mapping
    WHERE alegra_reference = '705'
    OR alegra_item_id::text = '705'
    ORDER BY created_date DESC
  `);
  
  console.log(`📊 Mappings encontrados por código 705: ${mappingsPorCodigo.rows.length}\n`);
  
  // Buscar por nombre
  const mappingsPorNombre = await query(`
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
    WHERE alegra_name ILIKE '%CABLE TRASERO%MOTO%'
    OR supplier_desc ILIKE '%CABLE TRASERO%MOTO%'
    ORDER BY created_date DESC
  `);
  
  console.log(`📊 Mappings encontrados por nombre: ${mappingsPorNombre.rows.length}\n`);
  
  // Combinar y deduplicar
  const todosMappings = new Map();
  
  [...mappingsPorCodigo.rows, ...mappingsPorNombre.rows].forEach(m => {
    if (!todosMappings.has(m.id)) {
      todosMappings.set(m.id, m);
    }
  });
  
  console.log(`📊 TOTAL mappings únicos: ${todosMappings.size}\n`);
  console.log('='.repeat(70));
  
  for (const m of todosMappings.values()) {
    console.log(`\n📦 Mapping ID: ${m.id}`);
    console.log(`   Producto Alegra:`);
    console.log(`      ID: ${m.alegraItemId}`);
    console.log(`      Reference: "${m.alegraReference}"`);
    console.log(`      Nombre: "${m.alegraName}"`);
    console.log(`   Proveedor:`);
    console.log(`      Nombre: ${m.supplierName}`);
    console.log(`      Cédula: ${m.supplierCedula}`);
    console.log(`      Código: "${m.supplierCode}"`);
    console.log(`      Descripción: "${m.supplierDesc}"`);
    console.log(`   Metadata:`);
    console.log(`      Origen: ${m.origen}`);
    console.log(`      Confianza: ${m.confidence}%`);
    console.log(`      Veces usado: ${m.times_used || 0}`);
    console.log(`      Creado: ${m.createdDate}`);
    if (m.lastUsedDate) {
      console.log(`      Último uso: ${m.lastUsedDate}`);
    }
    
    const sonDatosReales = m.supplierCode !== m.alegraReference || 
                          m.supplierDesc !== m.alegraName;
    
    if (sonDatosReales) {
      console.log(`   ✅ DATOS REALES DEL PROVEEDOR`);
    } else {
      console.log(`   ⚠️ DATOS DE ALEGRA (posible relación incorrecta)`);
    }
    
    // Verificar si es el mapping correcto mencionado por el usuario
    if (m.id === 'e6a7e809-51f3-4929-bda0-f7cfc7a89e51') {
      console.log(`   ✅ ESTE ES EL MAPPING CORRECTO MENCIONADO`);
    }
  }
  
  // Verificar relaciones duplicadas o incorrectas
  console.log('\n' + '='.repeat(70));
  console.log('🔍 Análisis de relaciones:\n');
  
  const proveedores = new Map();
  todosMappings.values().forEach(m => {
    const key = `${m.supplierName}-${m.supplierCedula}`;
    if (!proveedores.has(key)) {
      proveedores.set(key, []);
    }
    proveedores.get(key).push(m);
  });
  
  console.log(`📊 Proveedores únicos: ${proveedores.size}\n`);
  
  for (const [proveedor, mappings] of proveedores.entries()) {
    console.log(`🏢 ${proveedor}: ${mappings.length} mapping(s)`);
    if (mappings.length > 1) {
      console.log(`   ⚠️ MÚLTIPLES MAPPINGS PARA EL MISMO PROVEEDOR (posible duplicado)`);
    }
    mappings.forEach(m => {
      console.log(`      - ID: ${m.id}, Reference: "${m.alegraReference}", Código proveedor: "${m.supplierCode}"`);
    });
  }
  
  process.exit(0);
}

verificarMappings().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
