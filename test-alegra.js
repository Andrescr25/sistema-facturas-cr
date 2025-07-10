const AlegraService = require('./services/alegraService');

async function testAlegraConnection() {
    console.log('🚀 Iniciando prueba de conexión con Alegra...\n');
    
    const alegraService = new AlegraService();
    
    try {
        // 1. Probar conexión básica
        console.log('1️⃣ Probando conexión básica...');
        const company = await alegraService.testConnection();
        console.log(`✅ Empresa conectada: ${company.name}`);
        console.log(`💰 Moneda: ${company.currency?.name || company.currency || 'N/A'}`);
        console.log(`🌍 País: ${company.country?.name || company.country || 'N/A'}\n`);
        
        // 2. Obtener estadísticas rápidas
        console.log('2️⃣ Obteniendo estadísticas...');
        const stats = await alegraService.getAccountStats();
        console.log(`📊 Estadísticas obtenidas:`);
        console.log(`   📦 Total productos: ${stats.totalProducts}`);
        console.log(`   💰 Total compras: ${stats.totalPurchases}`);
        console.log(`   📅 Última sync: ${stats.lastSync ? new Date(stats.lastSync).toLocaleString() : 'N/A'}\n`);
        
        // 3. Probar obtención de productos (solo primeros 5)
        console.log('3️⃣ Obteniendo muestra de productos...');
        const response = await alegraService.api.get('/items?limit=5');
        const sampleProducts = response.data;
        
        console.log(`📦 Muestra de productos (${sampleProducts.length}):`);
        sampleProducts.forEach((product, index) => {
            console.log(`   ${index + 1}. ${product.name} (ID: ${product.id})`);
            console.log(`      Referencia: ${product.reference || 'N/A'}`);
            console.log(`      Precio: ${product.price || 0} ${company.currency?.name || company.currency || 'CRC'}`);
            console.log(`      Costo: ${product.cost || 0} ${company.currency?.name || company.currency || 'CRC'}`);
            console.log(`      Categoría: ${product.category?.name || 'Sin categoría'}`);
            console.log(`      Estado: ${product.status || 'N/A'}`);
            console.log(''); // Línea en blanco entre productos
        });
        
        // 4. Información adicional útil
        console.log('4️⃣ Información adicional:');
        console.log(`   🏢 Empresa: ${company.name}`);
        console.log(`   📧 Email: ${company.email || 'N/A'}`);
        console.log(`   📞 Teléfono: ${company.phone || 'N/A'}`);
        console.log(`   🏠 Dirección: ${company.address || 'N/A'}`);
        console.log(`   🆔 Identificación: ${company.identification || 'N/A'}`);
        
        console.log('\n✅ ¡Conexión con Alegra funcionando perfectamente!');
        console.log('🎯 Listo para sincronizar productos completos');
        console.log('\n📋 Próximos pasos:');
        console.log('   1. Ejecutar: node test-sync.js');
        console.log('   2. Revisar sincronización de productos');
        console.log('   3. Probar relacionado inteligente');
        
    } catch (error) {
        console.error('❌ Error en prueba de conexión:', error.message);
        
        if (error.response) {
            console.error('📄 Respuesta del servidor:', error.response.status);
            console.error('💬 Mensaje:', error.response.data);
        }
        
        console.log('\n🔧 Verificar:');
        console.log('   - Credenciales en .env');
        console.log('   - Conexión a internet');
        console.log('   - Estado de API de Alegra');
        
    } finally {
        await alegraService.disconnect();
    }
}

// Ejecutar prueba
testAlegraConnection();