/**
 * TEST: Probar edición de factura con API de Alegra
 * 
 * Este test verifica cómo funciona la edición de facturas en Alegra
 * para entender el formato correcto antes de aplicar la lógica
 * 
 * ELIMINAR después de aprobación
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const AlegraService = require('../services/alegraService');

const alegraService = new AlegraService();

async function testEditarFacturaAlegra() {
  console.log('🧪 TEST: Probar edición de factura en Alegra\n');
  
  try {
    // Obtener una factura de ejemplo
    const facturaId = '3474'; // Factura 3122
    
    console.log(`📄 Paso 1: Obtener factura ${facturaId} de Alegra`);
    const facturaActual = await alegraService.getInvoiceById(facturaId);
    
    if (!facturaActual.success) {
      console.error('❌ No se pudo obtener la factura');
      return;
    }
    
    console.log('✅ Factura obtenida:');
    console.log(`   Número: ${facturaActual.data.numberTemplate.fullNumber}`);
    console.log(`   Items originales: ${facturaActual.data.items.length}`);
    
    facturaActual.data.items.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.description}`);
      console.log(`      ID: ${item.id}`);
      console.log(`      Reference: ${JSON.stringify(item.reference)}`);
      console.log(`      Quantity: ${item.quantity}`);
      console.log(`      Price: ${item.price}`);
    });
    
    console.log('\n📝 Paso 2: Probar estructura de items para edición');
    console.log('Según documentación de Alegra, cada item debe incluir:');
    console.log('  - id (number, obligatorio)');
    console.log('  - price (double, obligatorio)');
    console.log('  - quantity (obligatorio)');
    console.log('  - reference (string, opcional)');
    console.log('  - description (string, opcional)');
    console.log('  - tax (objeto, array de impuestos)');
    
    // Construir array de items de prueba
    const itemsPrueba = facturaActual.data.items.map(item => {
      return {
        id: item.id,
        price: item.price,
        quantity: item.quantity,
        description: item.description,
        tax: item.tax || []
      };
    });
    
    console.log('\n📋 Items para enviar (formato correcto):');
    itemsPrueba.forEach((item, index) => {
      console.log(`   ${index + 1}. ID: ${item.id}, Quantity: ${item.quantity}, Price: ${item.price}`);
    });
    
    console.log('\n⚠️ NOTA: No haremos la actualización real en este test');
    console.log('Solo verificamos que el formato sea correcto');
    
    console.log('\n✅ Test completado');
    
  } catch (error) {
    console.error('❌ Error en test:', error);
  }
}

// Ejecutar test
testEditarFacturaAlegra().catch(console.error);

