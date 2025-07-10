const AlegraService = require('./services/alegraService');

async function testProductSync() {
    console.log('🚀 Iniciando sincronización de productos desde Alegra...\n');
    
    const alegraService = new AlegraService();
    
    try {
        // 1. Verificar conexión
        console.log('1️⃣ Verificando conexión con Alegra...');
        const company = await alegraService.testConnection();
        console.log(`✅ Conectado a: ${company.name}\n`);
        
        // 2. Verificar estado de BD local
        console.log('2️⃣ Verificando base de datos local...');
        const existingProducts = await alegraService.prisma.alegraProduct.count();
        console.log(`📦 Productos existentes en BD local: ${existingProducts}`);
        
        if (existingProducts > 0) {
            console.log('⚠️ Se encontraron productos existentes. Se limpiarán y reemplazarán.\n');
        }
        
        // 3. Sincronizar productos
        console.log('3️⃣ Sincronizando productos desde Alegra...');
        console.log('⏳ Esto puede tomar varios minutos dependiendo del número de productos...\n');
        
        const startTime = Date.now();
        const products = await alegraService.syncProductsFromAlegra();
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log(`\n✅ Sincronización completada en ${duration} segundos`);
        console.log(`📦 Total productos sincronizados: ${products.length}`);
        
        // 4. Verificar productos en BD local
        console.log('\n4️⃣ Verificando productos en base de datos local...');
        const localCount = await alegraService.prisma.alegraProduct.count();
        console.log(`📊 Productos en BD local: ${localCount}`);
        
        // 5. Mostrar muestra de productos sincronizados
        console.log('\n5️⃣ Muestra de productos sincronizados:');
        const sampleProducts = await alegraService.prisma.alegraProduct.findMany({
            take: 5,
            orderBy: { name: 'asc' }
        });
        
        sampleProducts.forEach((product, index) => {
            console.log(`   ${index + 1}. ${product.name} (ID Alegra: ${product.alegraId})`);
            console.log(`      Referencia: ${product.reference || 'N/A'}`);
            console.log(`      Precio: ₡${product.price.toFixed(2)}`);
            console.log(`      Costo: ₡${product.cost.toFixed(2)}`);
            console.log(`      Categoría: ${product.category || 'Sin categoría'}`);
            console.log('');
        });
        
        // 6. Estadísticas por categoría
        console.log('6️⃣ Estadísticas por categoría:');
        const categories = await alegraService.prisma.alegraProduct.groupBy({
            by: ['category'],
            _count: { category: true },
            orderBy: { _count: { category: 'desc' } }
        });
        
        categories.slice(0, 5).forEach(cat => {
            console.log(`   📂 ${cat.category || 'Sin categoría'}: ${cat._count.category} productos`);
        });
        
        // 7. Probar búsqueda inteligente
        console.log('\n7️⃣ Probando búsqueda inteligente...');
        const testSearches = [
            'alcohol liquido',
            'abanico techo',
            'galon'
        ];
        
        for (const searchTerm of testSearches) {
            console.log(`\n🔍 Buscando: "${searchTerm}"`);
            const similar = await alegraService.findSimilarProducts(searchTerm, '');
            
            if (similar.length > 0) {
                console.log(`   ✅ ${similar.length} productos encontrados:`);
                similar.slice(0, 3).forEach(product => {
                    console.log(`      • ${product.name} (Score: ${product.similarityScore}%)`);
                });
            } else {
                console.log(`   ❌ No se encontraron productos similares`);
            }
        }
        
        console.log('\n✅ ¡Sincronización completada exitosamente!');
        console.log('🎯 El sistema está listo para relacionado inteligente');
        console.log('\n📋 Próximos pasos:');
        console.log('   1. Probar recepción de facturas: node server.js');
        console.log('   2. Crear interfaz web para papá');
        console.log('   3. Implementar flujo completo');
        
    } catch (error) {
        console.error('\n❌ Error en sincronización:', error.message);
        
        if (error.response) {
            console.error('📄 Respuesta del servidor:', error.response.status);
            console.error('💬 Mensaje:', error.response.data);
        }
        
        console.log('\n🔧 Posibles soluciones:');
        console.log('   - Verificar conexión a internet');
        console.log('   - Revisar credenciales de Alegra');
        console.log('   - Verificar conexión a PostgreSQL');
        console.log('   - Revisar logs detallados arriba');
        
    } finally {
        await alegraService.disconnect();
        console.log('\n🔌 Conexión a base de datos cerrada');
    }
}

// Ejecutar sincronización
testProductSync();