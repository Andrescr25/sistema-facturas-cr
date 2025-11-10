/**
 * Investigar diferencia entre alegra_id y alegra_reference para productos con código 705
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query } = require('../config/database');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function investigar() {
  console.log('🔍 Investigando productos con código 705\n');
  
  // 1. Buscar en productos locales
  console.log('1️⃣ PRODUCTOS LOCALES (tabla productos):\n');
  const productosLocales = await query(`
    SELECT id, codigo, nombre 
    FROM productos 
    WHERE codigo = '705' OR nombre ILIKE '%ENVASE%' OR nombre ILIKE '%CABLE TRASERO%'
    ORDER BY nombre
  `);
  
  productosLocales.rows.forEach(p => {
    console.log(`   ID: ${p.id}, Código: "${p.codigo}", Nombre: "${p.nombre}"`);
  });
  
  // 2. Buscar en mappings
  console.log('\n2️⃣ MAPPINGS (supplier_product_mapping):\n');
  const mappings = await query(`
    SELECT 
      id,
      alegra_reference as "alegraReference",
      alegra_item_id as "alegraItemId",
      alegra_name as "alegraName",
      supplier_code as "supplierCode",
      supplier_desc as "supplierDesc"
    FROM supplier_product_mapping
    WHERE alegra_reference = '705' 
    OR alegra_item_id::text = '705'
    OR alegra_name ILIKE '%ENVASE%'
    OR alegra_name ILIKE '%CABLE TRASERO%'
    ORDER BY alegra_name
  `);
  
  mappings.rows.forEach(m => {
    console.log(`   Mapping ID: ${m.id}`);
    console.log(`      Reference: "${m.alegraReference}", Item ID: ${m.alegraItemId}`);
    console.log(`      Nombre Alegra: "${m.alegraName}"`);
    console.log(`      Código Proveedor: "${m.supplierCode}"`);
    console.log();
  });
  
  // 3. Buscar en productos de Alegra (cache)
  console.log('3️⃣ PRODUCTOS ALEGRA (cache - alegra_products):\n');
  try {
    const productosAlegra = await prisma.alegraProduct.findMany({
      where: {
        OR: [
          { reference: '705' },
          { alegraId: '705' },
          { name: { contains: 'ENVASE', mode: 'insensitive' } },
          { name: { contains: 'CABLE TRASERO', mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        alegraId: true,
        reference: true,
        name: true
      }
    });
    
    productosAlegra.forEach(p => {
      console.log(`   ID Cache: ${p.id}`);
      console.log(`      Alegra ID: ${p.alegraId}, Reference: "${p.reference}"`);
      console.log(`      Nombre: "${p.name}"`);
      console.log();
    });
  } catch (err) {
    console.log(`   ⚠️ Error accediendo a cache: ${err.message}`);
  }
  
  // 4. Verificar qué se está enviando desde el frontend
  console.log('4️⃣ ANÁLISIS:\n');
  console.log('   Cuando se registra faltante:');
  console.log('   - item_id: "705" (esto viene de Alegra)');
  console.log('   - nombre_producto: "ENVASE PLASTICO 1/2 LTRO"');
  console.log('\n   Preguntas clave:');
  console.log('   - ¿item_id es el alegra_id o la reference?');
  console.log('   - ¿Qué se guarda en productos.codigo cuando se crea un producto?');
  console.log('   - ¿Hay confusión entre alegra_id y reference?');
  
  await prisma.$disconnect();
  process.exit(0);
}

investigar().catch(async err => {
  console.error('❌ Error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
