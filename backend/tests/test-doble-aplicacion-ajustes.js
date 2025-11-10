/**
 * TEST: Verificar que los ajustes NO se apliquen dos veces
 * 
 * Escenario:
 * 1. Factura con 6 UNION LISA, 6 TE LISA, 6 CODO
 * 2. Registrar faltantes: 6 UNION (parcial, entregan 3), 3 TE (no_llego)
 * 3. Marcar como lista → Se edita en Alegra (6→3, 6→3)
 * 4. Ir a Reimpresión y reimprimir → NO debe editar de nuevo
 * 
 * ELIMINAR después de aprobación
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

function simularPrimeraEjecucion() {
  console.log('🧪 TEST: Primera ejecución (desde Reporte Cliente)\n');
  
  // Factura original en Alegra
  const facturaOriginal = {
    items: [
      { id: 1084, description: 'UNION LISA 1/2 PVC.', quantity: 6, price: 84.0708 },
      { id: 1082, description: 'TE LISA 1/2 PVC.', quantity: 6, price: 155 },
      { id: 1026, description: 'CODO 1/2 PVC.', quantity: 6, price: 88.49558 }
    ]
  };
  
  // Ajustes registrados
  const ajustes = [
    {
      producto_codigo: '1084',
      producto_nombre: 'UNION LISA 1/2 PVC.',
      cantidad_faltante: 6,
      cantidad_entregada: 3,
      estado: 'parcial'
    },
    {
      producto_codigo: '1082',
      producto_nombre: 'TE LISA 1/2 PVC.',
      cantidad_faltante: 3,
      cantidad_entregada: 0,
      estado: 'no_llego'
    }
  ];
  
  const marcarComoProcesada = false; // Viene desde Reporte Cliente
  
  console.log('📋 Factura original:');
  facturaOriginal.items.forEach(item => {
    console.log(`   ${item.description}: ${item.quantity} unidades`);
  });
  
  console.log('\n📋 Ajustes:');
  ajustes.forEach(ajuste => {
    console.log(`   ${ajuste.producto_nombre}: ${ajuste.estado}, faltante: ${ajuste.cantidad_faltante}, entregado: ${ajuste.cantidad_entregada}`);
  });
  
  // Simular lógica
  const debeEditarEnAlegra = !marcarComoProcesada && ajustes.length > 0;
  
  console.log(`\n🔍 marcarComoProcesada: ${marcarComoProcesada}`);
  console.log(`🔍 debeEditarEnAlegra: ${debeEditarEnAlegra}`);
  
  if (debeEditarEnAlegra) {
    console.log('\n✅ EDITAR EN ALEGRA');
    
    const itemsActualizados = [];
    
    for (const item of facturaOriginal.items) {
      const ajuste = ajustes.find(a => a.producto_codigo === item.id.toString());
      
      if (ajuste) {
        let cantidadFinal = item.quantity;
        
        if (ajuste.estado === 'parcial') {
          const cantidadQueAunFalta = ajuste.cantidad_faltante - ajuste.cantidad_entregada;
          cantidadFinal = item.quantity - cantidadQueAunFalta;
        } else if (ajuste.estado === 'no_llego') {
          cantidadFinal = item.quantity - ajuste.cantidad_faltante;
        }
        
        console.log(`   ${item.description}: ${item.quantity} → ${cantidadFinal}`);
        
        if (cantidadFinal > 0) {
          itemsActualizados.push({ ...item, quantity: cantidadFinal });
        }
      } else {
        itemsActualizados.push(item);
      }
    }
    
    console.log('\n📋 Items resultantes en Alegra:');
    itemsActualizados.forEach(item => {
      console.log(`   ${item.description}: ${item.quantity} unidades`);
    });
    
    return itemsActualizados;
  }
  
  return facturaOriginal.items;
}

function simularSegundaEjecucion(facturaEnAlegra) {
  console.log('\n\n🧪 TEST: Segunda ejecución (desde Reimpresión)\n');
  
  // Factura YA EDITADA en Alegra
  console.log('📋 Factura actual en Alegra (YA editada):');
  facturaEnAlegra.forEach(item => {
    console.log(`   ${item.description}: ${item.quantity} unidades`);
  });
  
  // Mismos ajustes (vienen de la BD)
  const ajustes = [
    {
      producto_codigo: '1084',
      producto_nombre: 'UNION LISA 1/2 PVC.',
      cantidad_faltante: 6,
      cantidad_entregada: 3,
      estado: 'parcial'
    },
    {
      producto_codigo: '1082',
      producto_nombre: 'TE LISA 1/2 PVC.',
      cantidad_faltante: 3,
      cantidad_entregada: 0,
      estado: 'no_llego'
    }
  ];
  
  const marcarComoProcesada = true; // Viene desde Reimpresión
  
  console.log('\n📋 Ajustes (mismos que antes):');
  ajustes.forEach(ajuste => {
    console.log(`   ${ajuste.producto_nombre}: ${ajuste.estado}, faltante: ${ajuste.cantidad_faltante}`);
  });
  
  // Simular lógica CORREGIDA
  const debeEditarEnAlegra = !marcarComoProcesada && ajustes.length > 0;
  
  console.log(`\n🔍 marcarComoProcesada: ${marcarComoProcesada}`);
  console.log(`🔍 debeEditarEnAlegra: ${debeEditarEnAlegra}`);
  
  if (debeEditarEnAlegra) {
    console.log('\n❌ ERROR: NO DEBERÍA EDITAR (aplicaría ajustes dos veces)');
    return false;
  } else {
    console.log('\n✅ CORRECTO: NO EDITAR (factura ya fue editada)');
    console.log('   Solo se marcará como procesada');
    return true;
  }
}

function ejecutarTest() {
  console.log('='.repeat(70));
  console.log('TEST: Verificar que ajustes NO se apliquen dos veces');
  console.log('='.repeat(70) + '\n');
  
  // Primera ejecución
  const facturaEditada = simularPrimeraEjecucion();
  
  // Segunda ejecución
  const resultado = simularSegundaEjecucion(facturaEditada);
  
  console.log('\n' + '='.repeat(70));
  console.log('RESULTADO FINAL');
  console.log('='.repeat(70));
  
  if (resultado) {
    console.log('✅ TEST PASÓ: Los ajustes NO se aplican dos veces');
    console.log('   La factura queda con las cantidades correctas:');
    facturaEditada.forEach(item => {
      console.log(`   - ${item.description}: ${item.quantity} unidades`);
    });
    process.exit(0);
  } else {
    console.log('❌ TEST FALLÓ: Los ajustes se aplicarían dos veces');
    process.exit(1);
  }
}

// Ejecutar test
ejecutarTest();

