/**
 * Verificar TODOS los mappings relacionados con código 705 o producto similar
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function verificarTodos() {
  console.log('🔍 Buscando TODOS los mappings relacionados con código 705\n');
  
  // Buscar por item_id 705
  const porItemId = await query(`
    SELECT 
      id,
      supplier_name,
      supplier_code,
      supplier_desc,
      alegra_reference,
      alegra_name,
      alegra_item_id,
      confidence,
      origen
    FROM supplier_product_mapping
    WHERE alegra_item_id::text = '705'
    ORDER BY created_date DESC
  `);
  
  console.log(`📊 Mappings con item_id = 705: ${porItemId.rows.length}\n`);
  porItemId.rows.forEach(m => {
    console.log(`   ID: ${m.id}`);
    console.log(`   Reference: "${m.alegra_reference}"`);
    console.log(`   Nombre: "${m.alegra_name}"`);
    console.log(`   Proveedor: ${m.supplier_name}`);
    console.log(`   Código proveedor: "${m.supplier_code}"`);
    console.log(`   Descripción proveedor: "${m.supplier_desc}"`);
    console.log();
  });
  
  // Buscar productos similares en nombre
  const porNombre = await query(`
    SELECT 
      id,
      supplier_name,
      supplier_code,
      supplier_desc,
      alegra_reference,
      alegra_name,
      alegra_item_id,
      confidence,
      origen
    FROM supplier_product_mapping
    WHERE alegra_name ILIKE '%CABLE%TRASERO%'
    OR supplier_desc ILIKE '%CABLE%TRASERO%'
    ORDER BY alegra_name, supplier_name
  `);
  
  console.log(`\n📊 Mappings con nombre similar (CABLE TRASERO): ${porNombre.rows.length}\n`);
  porNombre.rows.forEach(m => {
    console.log(`   ID: ${m.id}`);
    console.log(`   Reference: "${m.alegra_reference}", Item ID: ${m.alegra_item_id}`);
    console.log(`   Nombre Alegra: "${m.alegra_name}"`);
    console.log(`   Proveedor: ${m.supplier_name}`);
    console.log(`   Código proveedor: "${m.supplier_code}"`);
    console.log(`   Descripción proveedor: "${m.supplier_desc}"`);
    console.log(`   Confianza: ${m.confidence}%`);
    console.log();
  });
  
  // Verificar si hay múltiples mappings para el mismo producto pero diferentes proveedores
  console.log('='.repeat(70));
  console.log('🔍 Verificando duplicados o relaciones incorrectas:\n');
  
  const agrupados = new Map();
  porItemId.rows.forEach(m => {
    const key = `${m.alegra_item_id}-${m.alegra_name}`;
    if (!agrupados.has(key)) {
      agrupados.set(key, []);
    }
    agrupados.get(key).push(m);
  });
  
  for (const [key, mappings] of agrupados.entries()) {
    if (mappings.length > 1) {
      console.log(`⚠️ MÚLTIPLES MAPPINGS para el mismo producto:`);
      console.log(`   Producto: ${key}`);
      mappings.forEach(m => {
        console.log(`      - ID: ${m.id}, Proveedor: ${m.supplier_name}, Código: "${m.supplier_code}"`);
      });
    }
  }
  
  process.exit(0);
}

verificarTodos().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
