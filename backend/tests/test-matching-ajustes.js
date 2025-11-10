/**
 * TEST: Verificar matching de ajustes con items de factura
 * 
 * Simula el escenario exacto del problema:
 * - Factura con 4 items
 * - 3 ajustes (no_llego, parcial, no_llego)
 * - Verificar que el matching funciona correctamente
 * 
 * ELIMINAR después de aprobación
 */

function testMatchingAjustes() {
  console.log('🧪 TEST: Verificar matching de ajustes\n');
  
  // Simular items de la factura (como vienen de Alegra)
  const facturaItems = [
    {
      id: 1084,
      reference: null, // En Alegra reference puede ser null
      description: 'UNION LISA 1/2 PVC.',
      quantity: 6,
      price: 84.0708,
      tax: []
    },
    {
      id: 1082,
      reference: null,
      description: 'TE LISA 1/2 PVC.',
      quantity: 6,
      price: 155,
      tax: []
    },
    {
      id: 376,
      reference: null,
      description: 'EJE CENTRO UNIVERSAL',
      quantity: 1,
      price: 597,
      tax: []
    },
    {
      id: 2792,
      reference: null,
      description: 'TAPE SECURITY PEQUENO 1X10 NEGRO',
      quantity: 1,
      price: 1726,
      tax: []
    }
  ];
  
  // Simular ajustes (como vienen del frontend)
  const ajustes = [
    {
      producto_codigo: '1084',
      producto_nombre: 'UNION LISA 1/2 PVC.',
      cantidad_faltante: 3,
      cantidad_entregada: 0,
      estado: 'no_llego',
      requiere_actualizacion: true
    },
    {
      producto_codigo: '1082',
      producto_nombre: 'TE LISA 1/2 PVC.',
      cantidad_faltante: 6,
      cantidad_entregada: 3,
      estado: 'parcial',
      requiere_actualizacion: true
    },
    {
      producto_codigo: '376',
      producto_nombre: 'EJE CENTRO UNIVERSAL',
      cantidad_faltante: 1,
      cantidad_entregada: 0,
      estado: 'no_llego',
      requiere_actualizacion: true
    }
  ];
  
  console.log('📋 Factura original:');
  facturaItems.forEach((item, index) => {
    console.log(`   ${index + 1}. ${item.description} - ${item.quantity} unidades`);
    console.log(`      ID: ${item.id}, Reference: ${item.reference}`);
  });
  
  console.log('\n📋 Ajustes recibidos:');
  ajustes.forEach((ajuste, index) => {
    console.log(`   ${index + 1}. ${ajuste.producto_nombre}`);
    console.log(`      Código: "${ajuste.producto_codigo}", Estado: ${ajuste.estado}, Faltante: ${ajuste.cantidad_faltante}`);
  });
  
  console.log('\n🔍 Verificando matching:');
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  const itemsActualizados = [];
  
  for (const item of facturaItems) {
    // Lógica actual de matching
    const ajuste = ajustes.find(a =>
      a.producto_codigo === item.id.toString() ||
      a.producto_codigo === item.reference ||
      a.producto_codigo === item.reference?.reference
    );
    
    console.log(`\n   Item: ${item.description}`);
    console.log(`      item.id: ${item.id} (tipo: ${typeof item.id})`);
    console.log(`      item.reference: ${item.reference}`);
    
    if (ajuste) {
      console.log(`      ✅ Ajuste encontrado`);
      console.log(`         ajuste.producto_codigo: "${ajuste.producto_codigo}" (tipo: ${typeof ajuste.producto_codigo})`);
      console.log(`         Match por: ${ajuste.producto_codigo === item.id.toString() ? 'item.id.toString()' : 'otro'}`);
      
      // Calcular cantidad final
      let cantidadFinal = item.quantity;
      
      if (ajuste.estado === 'no_llego') {
        const cantidadFaltante = ajuste.cantidad_faltante || 0;
        cantidadFinal = item.quantity - cantidadFaltante;
        console.log(`         Cálculo: ${item.quantity} - ${cantidadFaltante} = ${cantidadFinal}`);
      } else if (ajuste.estado === 'parcial') {
        const cantidadQueAunFalta = ajuste.cantidad_faltante - (ajuste.cantidad_entregada || 0);
        cantidadFinal = item.quantity - cantidadQueAunFalta;
        console.log(`         Cálculo: ${item.quantity} - (${ajuste.cantidad_faltante} - ${ajuste.cantidad_entregada}) = ${cantidadFinal}`);
      }
      
      // Incluir item
      if (cantidadFinal > 0) {
        itemsActualizados.push({
          id: item.id,
          description: item.description,
          quantity: cantidadFinal,
          price: item.price,
          tax: item.tax
        });
        console.log(`         ✅ Item incluido con cantidad ${cantidadFinal}`);
        testsPassed++;
      } else {
        console.log(`         🗑️ Item eliminado (cantidad = 0)`);
        testsPassed++;
      }
    } else {
      console.log(`      ℹ️ Sin ajuste - mantener original`);
      itemsActualizados.push({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        price: item.price,
        tax: item.tax
      });
      testsPassed++;
    }
  }
  
  console.log('\n📊 RESULTADO:');
  console.log(`   Items originales: ${facturaItems.length}`);
  console.log(`   Ajustes aplicados: ${ajustes.length}`);
  console.log(`   Items en itemsActualizados: ${itemsActualizados.length}`);
  
  console.log('\n📋 Items finales:');
  itemsActualizados.forEach((item, index) => {
    console.log(`   ${index + 1}. ${item.description} - ${item.quantity} unidades`);
  });
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESUMEN');
  console.log('='.repeat(50));
  
  const esperado = {
    'UNION LISA 1/2 PVC.': 3,
    'TE LISA 1/2 PVC.': 3,
    'TAPE SECURITY PEQUENO 1X10 NEGRO': 1
  };
  
  const resultado = {};
  itemsActualizados.forEach(item => {
    resultado[item.description] = item.quantity;
  });
  
  console.log('\nEsperado:');
  Object.entries(esperado).forEach(([desc, qty]) => {
    console.log(`   ${desc}: ${qty} unidades`);
  });
  
  console.log('\nObtenido:');
  Object.entries(resultado).forEach(([desc, qty]) => {
    console.log(`   ${desc}: ${qty} unidades`);
  });
  
  let todoCorrecto = true;
  for (const [desc, qtyEsperada] of Object.entries(esperado)) {
    if (resultado[desc] !== qtyEsperada) {
      console.log(`\n❌ ERROR: ${desc} esperaba ${qtyEsperada}, obtuvo ${resultado[desc] || 'ELIMINADO'}`);
      todoCorrecto = false;
      testsFailed++;
    }
  }
  
  if (todoCorrecto) {
    console.log('\n🎉 TODOS LOS TESTS PASARON');
    process.exit(0);
  } else {
    console.log('\n⚠️ ALGUNOS TESTS FALLARON');
    process.exit(1);
  }
}

// Ejecutar test
testMatchingAjustes();

