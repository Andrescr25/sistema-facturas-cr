// Script de prueba para endpoint /invoices/preview de Alegra
require('dotenv').config();
const axios = require('axios');

const alegraApi = axios.create({
  baseURL: 'https://api.alegra.com/api/v1',
  auth: {
    username: process.env.ALEGRA_USER || 'tachifacturas@gmail.com',
    password: process.env.ALEGRA_TOKEN || 'b3a84abb6897180d3889'
  },
  headers: {
    'Content-Type': 'application/json'
  }
});

async function testPDFPreview() {
  console.log('🧪 === INICIANDO PRUEBA DE PDF PREVIEW ===\n');
  
  try {
    // 1. Obtener un cliente existente
    console.log('👥 1. Obteniendo clientes...');
    const clientsResponse = await alegraApi.get('/contacts', {
      params: { type: 'client', limit: 1 }
    });
    const cliente = clientsResponse.data.data?.[0] || clientsResponse.data[0];
    
    if (!cliente) {
      throw new Error('No se encontraron clientes en Alegra');
    }
    
    console.log(`   ✅ Cliente encontrado: ${cliente.name} (ID: ${cliente.id})`);
    
    // 2. Obtener un producto existente
    console.log('\n📦 2. Obteniendo productos...');
    const productsResponse = await alegraApi.get('/items', {
      params: { limit: 1 }
    });
    const producto = productsResponse.data.data?.[0] || productsResponse.data[0];
    
    if (!producto) {
      throw new Error('No se encontraron productos en Alegra');
    }
    
    // Extraer el precio correcto (puede ser un array de precios o un número)
    let precioProducto = producto.price;
    if (Array.isArray(precioProducto)) {
      // Buscar el precio principal
      const precioPrincipal = precioProducto.find(p => p.main === true);
      precioProducto = precioPrincipal ? precioPrincipal.price : precioProducto[0].price;
    }
    
    console.log(`   ✅ Producto encontrado: ${producto.name} (ID: ${producto.id})`);
    console.log(`   💰 Precio: ${precioProducto}`);
    
    // 3. Crear una factura de prueba
    console.log('\n📄 3. Creando factura de prueba...');
    const fechaHoy = new Date().toISOString().split('T')[0];
    
    const facturaData = {
      date: fechaHoy,
      dueDate: fechaHoy,
      client: cliente.id,
      items: [
        {
          id: producto.id,
          quantity: 2,
          price: precioProducto,
          discount: 0
        }
      ],
      observations: '🧪 FACTURA DE PRUEBA - Generada automáticamente para testing',
      status: 'open' // Crear como factura activa para que el PDF no tenga marca de BORRADOR
    };
    
    console.log('   📋 Datos de la factura:');
    console.log(JSON.stringify(facturaData, null, 2));
    
    const facturaResponse = await alegraApi.post('/invoices', facturaData);
    const factura = facturaResponse.data;
    
    console.log(`   ✅ Factura creada: ${factura.numberTemplate?.fullNumber || 'Sin número'}`);
    console.log(`   🆔 ID: ${factura.id}`);
    console.log(`   💵 Total: ${factura.total}`);
    console.log(`   📊 Estado: ${factura.status}`);
    
    // 4. Obtener datos completos de la factura (como lo hace nuestro endpoint)
    console.log('\n🔍 4. Obteniendo datos completos de la factura...');
    const facturaCompletaResponse = await alegraApi.get(`/invoices/${factura.id}`);
    const facturaCompleta = facturaCompletaResponse.data;
    
    console.log('   ✅ Datos completos obtenidos');
    
    // 5. Preparar datos para preview (como lo hace nuestro endpoint)
    console.log('\n🎨 5. Preparando datos para preview...');
    const previewData = {
      client: facturaCompleta.client?.id || facturaCompleta.client,
      date: facturaCompleta.date,
      dueDate: facturaCompleta.dueDate,
      items: facturaCompleta.items.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description || '',
        price: item.price,
        quantity: item.quantity,
        discount: item.discount || 0,
        tax: item.tax || []
      })),
      observations: facturaCompleta.observations || '',
      termsConditions: facturaCompleta.termsConditions || '',
      status: 'open', // Forzar 'open' para que no aparezca marca de BORRADOR
      numberTemplate: facturaCompleta.numberTemplate
    };
    
    console.log('   📋 Datos para preview preparados');
    
    // 6. Llamar al endpoint /invoices/preview
    console.log('\n🚀 6. Llamando a /invoices/preview...');
    console.log('   📤 Enviando datos...');
    
    const previewResponse = await alegraApi.post('/invoices/preview', previewData);
    
    console.log('\n   📥 RESPUESTA DE PREVIEW:');
    console.log(JSON.stringify(previewResponse.data, null, 2));
    
    // 7. Verificar la URL del PDF (Alegra usa 'pdfUrl')
    const pdfUrl = previewResponse.data.pdfUrl || previewResponse.data.url;
    
    if (pdfUrl) {
      console.log('\n✅ ¡ÉXITO! URL del PDF obtenida:');
      console.log(`   🔗 ${pdfUrl}`);
      console.log('\n   💡 Esta URL puede abrirse directamente en el navegador');
      console.log('   💡 Es temporal y no requiere autenticación');
      console.log('   💡 Apunta directamente al CDN de Alegra');
    } else {
      console.log('\n❌ ERROR: La respuesta no contiene una URL del PDF');
      console.log('   Estructura de respuesta recibida:');
      console.log(JSON.stringify(previewResponse.data, null, 2));
    }
    
    // 8. Limpiar: Eliminar la factura de prueba
    console.log('\n🗑️  7. Limpiando: Eliminando factura de prueba...');
    try {
      await alegraApi.delete(`/invoices/${factura.id}`);
      console.log('   ✅ Factura de prueba eliminada');
    } catch (deleteError) {
      console.log('   ⚠️  No se pudo eliminar (puede que esté en borrador)');
    }
    
    console.log('\n🎉 === PRUEBA COMPLETADA EXITOSAMENTE ===');
    
  } catch (error) {
    console.error('\n❌ === ERROR EN LA PRUEBA ===');
    console.error('Mensaje:', error.message);
    
    if (error.response) {
      console.error('\n📋 Detalles de la respuesta de error:');
      console.error('   Status:', error.response.status);
      console.error('   Status Text:', error.response.statusText);
      console.error('   URL:', error.config?.url);
      console.error('   Método:', error.config?.method?.toUpperCase());
      console.error('\n   Datos de error:');
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('\n   Stack:', error.stack);
    }
    
    process.exit(1);
  }
}

// Ejecutar la prueba
testPDFPreview();

