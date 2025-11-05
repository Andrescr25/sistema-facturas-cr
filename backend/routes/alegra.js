const express = require('express');
const router = express.Router();
const AlegraService = require('../services/alegraService');
const alegraService = new AlegraService(); // Instanciar la clase
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// DEBUG: Test simple de conexión
router.get('/debug/test-simple', async (req, res) => {
  const tests = [];
  
  try {
    // Test 1: Conexión básica
    tests.push({ test: 'Conexión básica', status: 'OK', result: 'Endpoint alcanzado' });
    
    // Test 2: Verificar DATABASE_URL
    tests.push({ 
      test: 'DATABASE_URL configurada', 
      status: process.env.DATABASE_URL ? 'OK' : 'ERROR',
      result: process.env.DATABASE_URL ? 'Sí existe' : 'NO EXISTE'
    });
    
    // Test 3: Prisma
    try {
      const prismaTest = await prisma.$queryRaw`SELECT 1 as test`;
      tests.push({ test: 'Prisma conexión', status: 'OK', result: prismaTest });
    } catch (e) {
      tests.push({ test: 'Prisma conexión', status: 'ERROR', error: e.message, code: e.code });
    }
    
    // Test 4: Query SQL directa
    try {
      const { query } = require('../config/database');
      const sqlTest = await query('SELECT NOW() as time');
      tests.push({ test: 'SQL Query directa', status: 'OK', result: sqlTest.rows[0] });
    } catch (e) {
      tests.push({ test: 'SQL Query directa', status: 'ERROR', error: e.message, code: e.code });
    }
    
    // Test 5: Contar tabla productos
    try {
      const { query } = require('../config/database');
      const productosTest = await query('SELECT COUNT(*) FROM productos');
      tests.push({ test: 'COUNT productos', status: 'OK', result: productosTest.rows[0].count });
    } catch (e) {
      tests.push({ test: 'COUNT productos', status: 'ERROR', error: e.message, code: e.code });
    }
    
    // Test 6: Contar tabla proveedores
    try {
      const { query } = require('../config/database');
      const proveedoresTest = await query('SELECT COUNT(*) FROM proveedores');
      tests.push({ test: 'COUNT proveedores', status: 'OK', result: proveedoresTest.rows[0].count });
    } catch (e) {
      tests.push({ test: 'COUNT proveedores', status: 'ERROR', error: e.message, code: e.code });
    }
    
    // Test 7: Contar tabla faltantes
    try {
      const { query } = require('../config/database');
      const faltantesTest = await query('SELECT COUNT(*) FROM faltantes');
      tests.push({ test: 'COUNT faltantes', status: 'OK', result: faltantesTest.rows[0].count });
    } catch (e) {
      tests.push({ test: 'COUNT faltantes', status: 'ERROR', error: e.message, code: e.code });
    }
    
    // Test 8: Prisma AlegraProduct
    try {
      const alegraTest = await prisma.alegraProduct.count();
      tests.push({ test: 'Prisma AlegraProduct.count()', status: 'OK', result: alegraTest });
    } catch (e) {
      tests.push({ test: 'Prisma AlegraProduct.count()', status: 'ERROR', error: e.message, code: e.code });
    }
    
    // Test 9: Prisma Factura
    try {
      const facturaTest = await prisma.factura.count();
      tests.push({ test: 'Prisma Factura.count()', status: 'OK', result: facturaTest });
    } catch (e) {
      tests.push({ test: 'Prisma Factura.count()', status: 'ERROR', error: e.message, code: e.code });
    }
    
    // Test 10: Buscar facturas (query compleja)
    try {
      const { query } = require('../config/database');
      const facturaQuery = await query(`
        SELECT 
          p.codigo as producto_codigo,
          p.nombre as producto_nombre,
          SUM(f.cantidad_faltante) as total_faltante
        FROM faltantes f
        JOIN productos p ON f.producto_id = p.id
        WHERE f.estado = 'pendiente'
        GROUP BY p.codigo, p.nombre
        LIMIT 5
      `);
      tests.push({ test: 'Query compleja faltantes', status: 'OK', result: `${facturaQuery.rows.length} registros` });
    } catch (e) {
      tests.push({ test: 'Query compleja faltantes', status: 'ERROR', error: e.message, code: e.code });
    }
    
    res.json({
      success: true,
      total_tests: tests.length,
      passed: tests.filter(t => t.status === 'OK').length,
      failed: tests.filter(t => t.status === 'ERROR').length,
      tests: tests,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        has_database_url: !!process.env.DATABASE_URL
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      tests: tests
    });
  }
});

// DEBUG: Verificar estado de la base de datos
router.get('/debug/database', async (req, res) => {
  try {
    const { query } = require('../config/database');
    
    // Test 1: Verificar conexión
    const timeResult = await query('SELECT NOW() as time');
    
    // Test 2: Listar todas las tablas
    const tablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    const allTables = tablesResult.rows.map(r => r.table_name);
    
    // Test 3: Obtener estructura de cada tabla
    const tableStructures = {};
    for (const tableName of allTables) {
      try {
        const columnsResult = await query(`
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length
          FROM information_schema.columns
          WHERE table_schema = 'public' 
            AND table_name = $1
          ORDER BY ordinal_position
        `, [tableName]);
        
        tableStructures[tableName] = columnsResult.rows;
      } catch (e) {
        tableStructures[tableName] = 'ERROR: ' + e.message;
      }
    }
    
    // Test 4: Contar registros en todas las tablas
    const counts = {};
    for (const tableName of allTables) {
      try {
        const countResult = await query(`SELECT COUNT(*) FROM "${tableName}"`);
        counts[tableName] = countResult.rows[0].count;
      } catch (e) {
        counts[tableName] = 'ERROR: ' + e.message;
      }
    }
    
    // Test 5: Verificar tablas esperadas del sistema de faltantes
    const expectedTables = [
      'proveedores',
      'productos', 
      'facturas',
      'factura_items',
      'faltantes',
      'faltantes_ajustes',
      'procesamientos',
      'facturas_reimpresion',
      'configuracion_semanal'
    ];
    
    const missingTables = expectedTables.filter(t => !allTables.includes(t));
    const existingExpectedTables = expectedTables.filter(t => allTables.includes(t));
    
    // Test 6: Verificar tablas de Prisma
    const prismaTables = [
      'facturas_proveedores',
      'productos_factura', 
      'supplier_product_mapping',
      'alegra_product'
    ];
    
    const existingPrismaTables = prismaTables.filter(t => allTables.includes(t));
    const missingPrismaTables = prismaTables.filter(t => !allTables.includes(t));
    
    res.json({
      success: true,
      database_time: timeResult.rows[0].time,
      summary: {
        total_tables: allTables.length,
        sistema_faltantes: {
          expected: expectedTables.length,
          existing: existingExpectedTables.length,
          missing: missingTables.length,
          missing_tables: missingTables
        },
        sistema_imap_prisma: {
          expected: prismaTables.length,
          existing: existingPrismaTables.length,
          missing: missingPrismaTables.length,
          missing_tables: missingPrismaTables
        }
      },
      all_tables: allTables,
      table_structures: tableStructures,
      record_counts: counts,
      message: 'Database debug info completo'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      message: 'Error en debug de base de datos'
    });
  }
});

// Probar conexión con Alegra
router.get('/test', async (req, res) => {
  try {
    const result = await alegraService.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error probando conexión con Alegra'
    });
  }
});

// Test específico para verificar que el endpoint de proveedores existe
router.get('/test-proveedores', async (req, res) => {
  res.json({
    success: true,
    message: 'El endpoint de proveedores EXISTE en este código',
    endpoint: '/api/alegra/proveedores disponible',
    alegraServiceHasMethod: typeof alegraService.getProveedores === 'function',
    timestamp: new Date().toISOString()
  });
});

// Buscar facturas por número
router.get('/facturas/buscar/numero/:numero', async (req, res) => {
  try {
    const { numero } = req.params;

    console.log(`🔍 Buscando facturas con número: ${numero}`);

    const result = await alegraService.searchInvoicesByNumber(numero);

    console.log(`✅ Búsqueda completada: ${result.data?.length || 0} facturas encontradas`);

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        searchTerm: numero,
        searchType: 'numero'
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('❌ Error buscando facturas por número:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error buscando facturas por número'
    });
  }
});


// Obtener el siguiente número de consecutivo
router.get('/facturas/siguiente-consecutivo', async (req, res) => {
  try {
    console.log('🔢 Obteniendo siguiente consecutivo de factura...');

    // Obtener la última factura
    const result = await alegraService.api.get('/invoices', {
      params: {
        order_field: 'numberTemplate.number',
        order_direction: 'DESC',
        limit: 1
      }
    });

    if (result.data && result.data.length > 0) {
      const ultimaFactura = result.data[0];
      const ultimoNumero = ultimaFactura.numberTemplate?.fullNumber || '001000012979';
      
      console.log(`📋 Última factura: ${ultimoNumero}`);
      
      // Extraer el número y sumar 1
      const match = ultimoNumero.match(/(\d+)$/);
      if (match) {
        const numeroActual = parseInt(match[1]);
        const siguienteNumero = (numeroActual + 1).toString().padStart(match[1].length, '0');
        
        console.log(`✅ Siguiente consecutivo: ${siguienteNumero}`);
        
        res.json({
          success: true,
          ultimoNumero: ultimoNumero,
          siguienteNumero: siguienteNumero,
          siguienteConsecutivo: siguienteNumero
        });
      } else {
        res.json({
          success: true,
          ultimoNumero: ultimoNumero,
          siguienteNumero: '001000012980',
          siguienteConsecutivo: '001000012980'
        });
      }
    } else {
      res.json({
        success: true,
        ultimoNumero: '001000012979',
        siguienteNumero: '001000012980',
        siguienteConsecutivo: '001000012980'
      });
    }
  } catch (error) {
    console.error('❌ Error obteniendo consecutivo:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo consecutivo'
    });
  }
});

// Visualizar PDF de factura desde Alegra
router.get('/facturas/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📄 Obteniendo URL del PDF oficial para factura ID: ${id}...`);

    // Usar el parámetro fields=pdf para obtener la URL del PDF oficial
    // IMPORTANTE: Solo funciona con facturas que tienen status 'open', no 'draft'
    const invoiceResponse = await alegraService.api.get(`/invoices/${id}`, {
      params: {
        fields: 'pdf'  // Este parámetro devuelve la URL del PDF oficial
      }
    });
    
    const invoiceData = invoiceResponse.data;
    
    console.log(`📋 Factura ${id}: ${invoiceData.numberTemplate?.fullNumber}`);
    console.log(`📋 Cliente: ${invoiceData.client?.name}`);
    console.log(`📋 Status: ${invoiceData.status}`);
    console.log(`📋 Total: ${invoiceData.total}`);
    
    // Verificar que la factura tenga el campo 'pdf'
    if (!invoiceData.pdf) {
      // Si no hay PDF, probablemente es porque está en borrador
      if (invoiceData.status === 'draft') {
        throw new Error('Las facturas en borrador no pueden generar PDF. La factura debe tener status "open".');
      }
      throw new Error('No se pudo obtener la URL del PDF de la factura');
    }
    
    const pdfUrl = invoiceData.pdf;
    console.log(`✅ URL del PDF oficial obtenida: ${pdfUrl}`);
    
    // Devolver la URL para que el frontend la abra
    res.json({
      success: true,
      url: pdfUrl,
      invoiceNumber: invoiceData.numberTemplate?.fullNumber,
      invoiceId: id,
      status: invoiceData.status
    });
    
  } catch (error) {
    console.error(`❌ Error obteniendo PDF de factura ${req.params.id}:`);
    console.error(`   - Mensaje: ${error.message}`);
    console.error(`   - Status: ${error.response?.status}`);
    console.error(`   - Status Text: ${error.response?.statusText}`);
    console.error(`   - URL: ${error.config?.url}`);
    
    if (error.response?.data) {
      console.error(`   - Response Data:`, JSON.stringify(error.response.data, null, 2));
    }
    
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message,
      details: error.response?.statusText,
      message: `Error obteniendo PDF de Alegra para factura ${req.params.id}`,
      invoiceId: req.params.id
    });
  }
});

// Buscar facturas por cliente
router.get('/facturas/buscar/cliente/:cliente', async (req, res) => {
  try {
    const { cliente } = req.params;

    console.log(`🔍 Buscando facturas del cliente: ${cliente}`);

    const result = await alegraService.searchInvoicesByClient(cliente);

    console.log(`✅ Búsqueda completada: ${result.data?.length || 0} facturas encontradas`);

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        client: result.client,
        searchTerm: cliente,
        searchType: 'cliente'
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('❌ Error buscando facturas por cliente:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error buscando facturas por cliente'
    });
  }
});

// Obtener todas las facturas de un mes completo
// IMPORTANTE: Esta ruta debe estar ANTES de /:semana para que Express la matchee correctamente
router.get('/facturas/:ano/:mes/todas', async (req, res) => {
  try {
    const { ano, mes } = req.params;

    // Convertir a números para evitar errores de tipo
    const anoNum = parseInt(ano, 10);
    const mesNum = parseInt(mes, 10);

    // Calcular primer y último día del mes
    // JavaScript Date usa meses 0-11, entonces mes-1 es correcto
    const firstDay = new Date(anoNum, mesNum - 1, 1);
    const lastDay = new Date(anoNum, mesNum, 0); // Día 0 del siguiente mes = último día del mes actual

    const startDate = firstDay.toISOString().split('T')[0];
    const endDate = lastDay.toISOString().split('T')[0];

    console.log(`📅 Buscando todas las facturas del mes ${mes}/${ano} desde ${startDate} hasta ${endDate}`);

    // Buscar facturas en Alegra usando el rango de fechas con paginación
    let todasLasFacturas = [];
    let start = 0;
    const limit = 30; // Máximo permitido por Alegra
    let hasMore = true;

    while (hasMore && todasLasFacturas.length < 100) { // Máximo 100 facturas (para proteger)
      const response = await alegraService.api.get('/invoices', {
        params: {
          start_date: startDate,
          end_date: endDate,
          start: start,
          limit: limit,
          metadata: true,
          order_field: 'date',
          order_direction: 'DESC'
        }
      });

      // Alegra devuelve: { metadata: {...}, data: [...] }
      const facturas = response.data.data || response.data || [];

      if (facturas.length === 0) {
        hasMore = false;
      } else {
        todasLasFacturas = todasLasFacturas.concat(facturas);
        start += limit;

        // Si obtuvo menos facturas que el límite, es la última página
        if (facturas.length < limit) {
          hasMore = false;
        }
      }
    }

    console.log(`✅ ${todasLasFacturas.length} facturas encontradas para ${mes}/${ano}`);

    // Devolver las facturas SIN transformar (formato original de Alegra)
    // El frontend espera client como objeto, date, etc.
    res.json({
      success: true,
      data: todasLasFacturas, // Datos originales de Alegra
      total: todasLasFacturas.length,
      filters: { ano, mes, startDate, endDate },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error obteniendo todas las facturas del mes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo facturas de Alegra'
    });
  }
});

// Obtener facturas por semana y mes
router.get('/facturas/:ano/:mes/:semana', async (req, res) => {
  try {
    const { ano, mes, semana } = req.params;

    // Calcular fechas de la semana
    const startDate = calculateWeekStartDate(ano, mes, semana);
    const endDate = calculateWeekEndDate(ano, mes, semana);

    console.log(`📅 Buscando facturas desde ${startDate} hasta ${endDate}`);

    const result = await alegraService.getInvoicesByDateRange(startDate, endDate);

    if (result.success) {
      // Procesar facturas con información de semana
      const processedInvoices = alegraService.processInvoicesWithWeekInfo(result.data);

      res.json({
        success: true,
        data: processedInvoices,
        pagination: result.pagination,
        filters: { ano, mes, semana, startDate, endDate }
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error obteniendo facturas por semana:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo facturas de Alegra'
    });
  }
});

// Obtener facturas pendientes de reimpresión
// IMPORTANTE: Esta ruta debe estar ANTES de /facturas/:id para evitar conflictos
router.get('/facturas/pendientes-reimpresion', async (req, res) => {
  try {
    console.log('📋 Obteniendo facturas pendientes de reimpresión...');

    const { query } = require('../config/database');

    const result = await query(`
      SELECT
        fr.id as reimpresion_id,
        fr.ajustes_realizados,
        fr.estado as estado_reimpresion,
        fr.fecha_creacion,
        fa.id as factura_id,
        fa.numero_factura,
        fa.alegra_id,
        fa.cliente_nombre,
        fa.cliente_email,
        fa.fecha_emision,
        fa.total
      FROM facturas_reimpresion fr
      JOIN facturas fa ON fr.factura_id = fa.id
      WHERE fr.estado = 'pendiente'
      ORDER BY fr.fecha_creacion DESC
    `);

    // Procesar los ajustes JSONB para mejor visualización
    const facturasConAjustes = result.rows.map(factura => {
      const ajustes = typeof factura.ajustes_realizados === 'string'
        ? JSON.parse(factura.ajustes_realizados)
        : factura.ajustes_realizados;

      return {
        ...factura,
        ajustes_realizados: ajustes,
        total_ajustes: ajustes?.length || 0,
        requiere_actualizacion: ajustes?.some(aj => aj.requiere_actualizacion) || false
      };
    });

    res.json({
      success: true,
      data: facturasConAjustes,
      total_pendientes: facturasConAjustes.length,
      resumen: {
        facturas_pendientes: facturasConAjustes.length,
        facturas_con_cambios: facturasConAjustes.filter(f => f.requiere_actualizacion).length,
        facturas_resueltas: facturasConAjustes.filter(f => !f.requiere_actualizacion).length
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo facturas pendientes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo facturas pendientes de reimpresión'
    });
  }
});

// Obtener facturas procesadas (recuperables últimos 7 días)
// IMPORTANTE: Esta ruta debe estar ANTES de /facturas/:id para evitar conflictos
router.get('/facturas/procesadas-reimpresion', async (req, res) => {
  try {
    console.log('📋 Obteniendo facturas procesadas (últimos 7 días)...');

    const { query } = require('../config/database');

    const result = await query(`
      SELECT
        fr.id as reimpresion_id,
        fr.ajustes_realizados,
        fr.estado as estado_reimpresion,
        fr.fecha_creacion,
        fr.fecha_procesamiento,
        fa.id as factura_id,
        fa.numero_factura,
        fa.alegra_id,
        fa.cliente_nombre,
        fa.cliente_email,
        fa.fecha_emision,
        fa.total,
        EXTRACT(DAY FROM (NOW() - fr.fecha_procesamiento)) as dias_desde_procesamiento
      FROM facturas_reimpresion fr
      JOIN facturas fa ON fr.factura_id = fa.id
      WHERE fr.estado = 'procesada'
        AND fr.fecha_procesamiento >= NOW() - INTERVAL '7 days'
      ORDER BY fr.fecha_procesamiento DESC
    `);

    // Procesar los ajustes JSONB
    const facturasConAjustes = result.rows.map(factura => {
      const ajustes = typeof factura.ajustes_realizados === 'string'
        ? JSON.parse(factura.ajustes_realizados)
        : factura.ajustes_realizados;

      return {
        ...factura,
        ajustes_realizados: ajustes,
        total_ajustes: ajustes?.length || 0,
        dias_restantes_recuperacion: Math.ceil(7 - factura.dias_desde_procesamiento),
        puede_recuperar: factura.dias_desde_procesamiento <= 7
      };
    });

    res.json({
      success: true,
      data: facturasConAjustes,
      total: facturasConAjustes.length,
      resumen: {
        facturas_procesadas: facturasConAjustes.length,
        recuperables: facturasConAjustes.filter(f => f.puede_recuperar).length
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo facturas procesadas:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo facturas procesadas'
    });
  }
});

// Obtener una factura específica
router.get('/facturas/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📄 Obteniendo factura ID: ${id}`);

    const result = await alegraService.getInvoiceById(id);

    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Factura no encontrada'
      });
    }
  } catch (error) {
    console.error('Error obteniendo factura:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo factura'
    });
  }
});

// Editar factura completa
router.put('/facturas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const datosEdicion = req.body;

    console.log(`✏️ Editando factura ID: ${id}`);
    console.log('📝 Datos de edición:', JSON.stringify(datosEdicion, null, 2));

    const result = await alegraService.updateInvoice(id, datosEdicion);

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        message: 'Factura actualizada exitosamente'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message || 'Error actualizando factura'
      });
    }
  } catch (error) {
    console.error('Error editando factura:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error editando factura'
    });
  }
});

// Actualizar factura (eliminar producto)
router.delete('/facturas/:id/items/:itemId', async (req, res) => {
  try {
    const { id, itemId } = req.params;

    console.log(`🗑️ Eliminando item ${itemId} de factura ${id}`);

    const result = await alegraService.removeItemFromInvoice(id, itemId);

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        message: 'Producto eliminado de la factura'
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error eliminando item de factura:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error eliminando producto de la factura'
    });
  }
});

// Actualizar cantidad de producto en factura
router.put('/facturas/:id/items/:itemId', async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { cantidad } = req.body;

    if (!cantidad || cantidad < 0) {
      return res.status(400).json({
        success: false,
        message: 'Cantidad debe ser un número positivo'
      });
    }

    console.log(`✏️ Actualizando cantidad de item ${itemId} en factura ${id} a ${cantidad}`);

    const result = await alegraService.updateItemQuantity(id, itemId, cantidad);

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        message: `Cantidad actualizada a ${cantidad}`
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error actualizando cantidad de item:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error actualizando cantidad del producto'
    });
  }
});

// Obtener productos de Alegra
router.get('/productos', async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;

    console.log(`📦 Obteniendo productos página ${page}`);

    const result = await alegraService.getProducts(page, limit);

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error obteniendo productos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo productos de Alegra'
    });
  }
});

// ✅ NUEVO: Buscar productos de Alegra por query
router.get('/productos/buscar', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.json({
        success: true,
        data: []
      });
    }

    console.log(`🔍 Buscando productos con query: "${query}"`);

    const result = await alegraService.searchProducts(query);

    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error buscando productos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error buscando productos en Alegra'
    });
  }
});

// Obtener contactos de Alegra
router.get('/contactos', async (req, res) => {
  try {
    const { page = 1, limit = 30, type } = req.query;

    console.log(`👥 Obteniendo contactos página ${page}, tipo: ${type || 'todos'}`);

    const result = await alegraService.getContacts(page, limit, type);

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error obteniendo contactos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo contactos de Alegra'
    });
  }
});

// Sincronización híbrida de productos
router.post('/sincronizar/productos', async (req, res) => {
  try {
    console.log('🔄 Iniciando sincronización híbrida de productos...');

    const { query } = require('../config/database');
    const {
      maxProducts = 100,
      soloNuevos = false,
      crearProveedores = true
    } = req.body;

    let totalSincronizados = 0;
    let totalActualizados = 0;
    let proveedoresCreados = 0;
    let productosSinProveedor = [];
    let page = 1;
    const limit = 30;

    // Obtener productos ya sincronizados para comparar
    const productosExistentes = await query(`
      SELECT codigo, nombre, precio_unitario 
      FROM productos 
      WHERE codigo IS NOT NULL
    `);

    const productosExistentesMap = new Map();
    productosExistentes.rows.forEach(p => {
      productosExistentesMap.set(p.codigo, p);
    });

    while (totalSincronizados < maxProducts) {
      const result = await alegraService.getProducts(page, limit);

      if (!result.success || result.data.length === 0) {
        break;
      }

      for (const producto of result.data) {
        if (totalSincronizados >= maxProducts) break;

        try {
          const codigoProducto = producto.referencia || producto.codigo_producto || `ALG-${producto.alegra_id}`;
          const productoExistente = productosExistentesMap.get(codigoProducto);

          // Si solo queremos nuevos y ya existe, saltar
          if (soloNuevos && productoExistente) {
            continue;
          }

          // Determinar proveedor automáticamente
          let proveedorId = 1; // Por defecto
          let proveedorCreado = false;

          if (crearProveedores && producto.categoria) {
            // Buscar proveedor existente por categoría
            const proveedorExistente = await query(
              'SELECT id FROM proveedores WHERE nombre ILIKE $1 OR nombre ILIKE $2',
              [`%${producto.categoria}%`, `Proveedor ${producto.categoria}`]
            );

            if (proveedorExistente.rows.length > 0) {
              proveedorId = proveedorExistente.rows[0].id;
            } else {
              // Crear nuevo proveedor basado en categoría
              const nuevoProveedor = await query(`
                INSERT INTO proveedores (nombre, contacto, telefono, email)
                VALUES ($1, $2, $3, $4)
                RETURNING id
              `, [
                `Proveedor ${producto.categoria}`,
                'Sincronizado automáticamente desde Alegra',
                null,
                null
              ]);

              proveedorId = nuevoProveedor.rows[0].id;
              proveedoresCreados++;
              proveedorCreado = true;

              console.log(`✅ Proveedor creado: ${producto.categoria}`);
            }
          }

          if (productoExistente) {
            // Actualizar producto existente
            await query(`
              UPDATE productos 
              SET precio_unitario = $1, 
                  descripcion = $2,
                  proveedor_id = CASE 
                    WHEN proveedor_id = 1 THEN $3 
                    ELSE proveedor_id 
                  END
              WHERE codigo = $4
            `, [
              producto.precio || 0,
              producto.descripcion || `${producto.categoria || 'Producto'} - Actualizado desde Alegra`,
              proveedorId,
              codigoProducto
            ]);
            totalActualizados++;
          } else {
            // Crear producto nuevo
            const nuevoProducto = await query(`
              INSERT INTO productos (nombre, codigo, descripcion, proveedor_id, precio_unitario)
              VALUES ($1, $2, $3, $4, $5)
              RETURNING id
            `, [
              producto.nombre,
              codigoProducto,
              producto.descripcion || `${producto.categoria || 'Producto'} sincronizado desde Alegra`,
              proveedorId,
              producto.precio || 0
            ]);

            totalSincronizados++;

            // Si no tiene categoría, agregar a lista de revisión
            if (!producto.categoria || proveedorId === 1) {
              productosSinProveedor.push({
                id: nuevoProducto.rows[0].id,
                nombre: producto.nombre,
                codigo: codigoProducto,
                categoria: producto.categoria || 'Sin categoría',
                precio: producto.precio || 0,
                proveedor_asignado: proveedorId === 1 ? 'Proveedor A (Por defecto)' : 'Automático'
              });
            }
          }
        } catch (productError) {
          console.error(`❌ Error sincronizando producto ${producto.nombre}:`, productError.message);
        }
      }

      page++;
      if (result.data.length < limit) break;
    }

    // Registrar sincronización en log
    await query(`
      INSERT INTO configuracion_semanal (semana, mes, ano, fecha_inicio, fecha_fin, activa)
      VALUES (0, 0, 0, CURRENT_DATE, CURRENT_DATE, false)
      ON CONFLICT DO NOTHING
    `);

    res.json({
      success: true,
      message: `Sincronización híbrida completada`,
      data: {
        productos_nuevos: totalSincronizados,
        productos_actualizados: totalActualizados,
        proveedores_creados: proveedoresCreados,
        productos_sin_proveedor: productosSinProveedor.length,
        limite_aplicado: maxProducts,
        modo: soloNuevos ? 'solo_nuevos' : 'completo'
      },
      productos_para_revisar: productosSinProveedor.slice(0, 10), // Primeros 10
      total_para_revisar: productosSinProveedor.length
    });
  } catch (error) {
    console.error('❌ Error en sincronización híbrida:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error en sincronización híbrida'
    });
  }
});

// Sincronización automática (solo nuevos)
router.post('/sincronizar/automatica', async (req, res) => {
  try {
    console.log('🤖 Ejecutando sincronización automática...');

    // Llamar a la sincronización híbrida en modo "solo nuevos"
    const result = await fetch('http://localhost:3000/api/alegra/sincronizar/productos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        maxProducts: 50,
        soloNuevos: true,
        crearProveedores: true
      })
    });

    const data = await result.json();

    res.json({
      success: true,
      message: 'Sincronización automática completada',
      data: data.data,
      tipo: 'automatica'
    });
  } catch (error) {
    console.error('❌ Error en sincronización automática:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error en sincronización automática'
    });
  }
});

// Obtener productos sin proveedor asignado
router.get('/productos/sin-proveedor', async (req, res) => {
  try {
    const { query } = require('../config/database');

    const result = await query(`
      SELECT p.id, p.nombre, p.codigo, p.descripcion, p.precio_unitario,
             pr.nombre as proveedor_nombre
      FROM productos p
      LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
      WHERE p.proveedor_id = 1 OR p.proveedor_id IS NULL
      ORDER BY p.created_at DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
      message: 'Productos que necesitan asignación de proveedor'
    });
  } catch (error) {
    console.error('❌ Error obteniendo productos sin proveedor:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo productos sin proveedor'
    });
  }
});

// Asignar proveedor a producto
router.put('/productos/:id/proveedor', async (req, res) => {
  try {
    const { id } = req.params;
    const { proveedor_id } = req.body;

    if (!proveedor_id) {
      return res.status(400).json({
        success: false,
        message: 'proveedor_id es requerido'
      });
    }

    const { query } = require('../config/database');

    // Verificar que el proveedor existe
    const proveedorCheck = await query('SELECT id, nombre FROM proveedores WHERE id = $1', [proveedor_id]);
    if (proveedorCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }

    // Actualizar producto
    const result = await query(`
      UPDATE productos 
      SET proveedor_id = $1
      WHERE id = $2
      RETURNING *
    `, [proveedor_id, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: `Proveedor asignado: ${proveedorCheck.rows[0].nombre}`
    });
  } catch (error) {
    console.error('❌ Error asignando proveedor:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error asignando proveedor'
    });
  }
});

// Funciones helper para calcular fechas de semana
function calculateWeekStartDate(year, month, week) {
  const firstDay = new Date(year, month - 1, 1);
  const startOfWeek = new Date(firstDay);

  // Ajustar al lunes de la primera semana
  const dayOfWeek = firstDay.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(firstDay.getDate() - daysToSubtract);

  // Agregar semanas
  startOfWeek.setDate(startOfWeek.getDate() + (week - 1) * 7);

  return startOfWeek.toISOString().split('T')[0];
}

function calculateWeekEndDate(year, month, week) {
  const startDate = new Date(calculateWeekStartDate(year, month, week));
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);

  return endDate.toISOString().split('T')[0];
}

// Obtener estadísticas de sincronización
router.get('/estadisticas/sincronizacion', async (req, res) => {
  try {
    const { query } = require('../config/database');

    console.log('📊 Obteniendo estadísticas de sincronización...');

    // Contar productos locales
    console.log('🔍 Consultando productos...');
    const localResult = await query('SELECT COUNT(*) FROM productos');
    console.log('✅ Productos:', localResult.rows[0].count);

    // Contar proveedores locales
    console.log('🔍 Consultando proveedores...');
    const proveedoresResult = await query('SELECT COUNT(*) FROM proveedores');
    console.log('✅ Proveedores:', proveedoresResult.rows[0].count);

    // Contar productos Alegra (Prisma)
    console.log('🔍 Consultando productos Alegra (Prisma)...');
    const alegraCount = await prisma.alegraProduct.count();
    console.log('✅ Productos Alegra:', alegraCount);

    res.json({
      success: true,
      data: {
        productos_alegra: alegraCount > 0 ? `${alegraCount}+` : "1400+",
        productos_locales: parseInt(localResult.rows[0].count),
        proveedores_locales: parseInt(proveedoresResult.rows[0].count),
        sincronizacion_pendiente: parseInt(localResult.rows[0].count) < 100
      }
    });
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      message: 'Error obteniendo estadísticas'
    });
  }
});

// Obtener una factura específica con detalles completos
// Sistema de FALTANTES - Obtiene factura directamente de Alegra API
router.get('/facturas/detalle/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📄 Obteniendo factura de Alegra ID: ${id}`);

    const result = await alegraService.getInvoiceById(id);

    if (result.success) {
      // Procesar la factura para el frontend (registro de faltantes)
      const facturaDetallada = {
        ...result.data,
        // Procesar items para el registro de faltantes
        items: result.data.items?.map(item => ({
          ...item,
          cantidad_faltante: 0,
          tipo_faltante: 'ninguno', // 'ninguno', 'parcial', 'total'
          observaciones: ''
        })) || []
      };

      return res.json({
        success: true,
        data: facturaDetallada
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'Factura no encontrada'
      });
    }
  } catch (error) {
    console.error('❌ Error obteniendo factura:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Registrar faltantes de una factura - CORREGIDO
router.post('/facturas/:id/faltantes', async (req, res) => {
  try {
    const { id: facturaId } = req.params;
    const { faltantes, registrado_por = 'Sistema', observaciones_adicionales } = req.body;

    console.log(`📝 Registrando faltantes para factura ${facturaId}:`, faltantes);

    if (!faltantes || !Array.isArray(faltantes) || faltantes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere al menos un faltante para registrar'
      });
    }

    const { query } = require('../config/database');

    // Verificar que la factura existe en Alegra
    const facturaAlegra = await alegraService.getInvoiceById(facturaId);
    if (!facturaAlegra.success) {
      return res.status(404).json({
        success: false,
        message: 'Factura no encontrada en Alegra'
      });
    }

    // Buscar factura local existente
    let facturaLocal = await query('SELECT id FROM facturas WHERE alegra_id = $1', [parseInt(facturaId)]);

    let facturaLocalId;
    if (facturaLocal.rows.length === 0) {
      // Crear nueva factura
      const nuevaFactura = await query(`
    INSERT INTO facturas (
      numero_factura, alegra_id, cliente_nombre, cliente_email, 
      fecha_emision, semana, mes, ano, total
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id
  `, [
        facturaAlegra.data.numberTemplate?.formattedNumber || facturaId,
        parseInt(facturaId),
        facturaAlegra.data.client?.name || 'Cliente no especificado',
        facturaAlegra.data.client?.email,
        facturaAlegra.data.date,
        parseInt(facturaAlegra.data.date?.split('-')[2]) || 1,
        parseInt(facturaAlegra.data.date?.split('-')[1]) || 1,
        parseInt(facturaAlegra.data.date?.split('-')[0]) || 2025,
        parseFloat(facturaAlegra.data.total || 0)
      ]);
      facturaLocalId = nuevaFactura.rows[0].id;
    } else {
      // Usar factura existente
      facturaLocalId = facturaLocal.rows[0].id;
    }

    const faltantesRegistrados = [];

    for (const faltante of faltantes) {
      const {
        item_id,
        nombre_producto,
        cantidad_faltante,
        tipo_faltante,
        observaciones
      } = faltante;

      if (!item_id || !cantidad_faltante || cantidad_faltante <= 0) {
        continue; // Saltar faltantes inválidos
      }

      // CORREGIDO: Buscar producto de forma más inteligente
      console.log(`🔍 Buscando producto: item_id="${item_id}", nombre="${nombre_producto}"`);

      let productoLocal = await query(`
        SELECT id, codigo, nombre FROM productos 
        WHERE codigo = $1 
           OR codigo = $2
           OR nombre ILIKE $3
        ORDER BY 
          CASE 
            WHEN codigo = $1 THEN 1    -- Coincidencia exacta con referencia
            WHEN codigo = $2 THEN 2    -- Coincidencia con ID (fallback)
            WHEN nombre ILIKE $3 THEN 3 -- Coincidencia por nombre
            ELSE 4 
          END
        LIMIT 1
      `, [item_id, item_id, `%${nombre_producto}%`]);

      // NUEVO: Si no encuentra, intentar buscar por nombre más específico
      if (productoLocal.rows.length === 0) {
        console.log(`⚠️ No encontrado por código, buscando por nombre exacto...`);
        productoLocal = await query(`
          SELECT id, codigo, nombre FROM productos 
          WHERE UPPER(nombre) = UPPER($1)
          LIMIT 1
        `, [nombre_producto]);
      }

      let productoId;
      if (productoLocal.rows.length === 0) {
        console.log(`➕ Creando nuevo producto: "${nombre_producto}" con código "${item_id}"`);

        // Crear producto con la referencia correcta
        const nuevoProducto = await query(`
          INSERT INTO productos (nombre, codigo, descripcion, proveedor_id, precio_unitario)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `, [
          nombre_producto || `Producto ${item_id}`,
          item_id, // CORREGIDO: Usar la referencia como código
          `Producto creado desde registro de faltantes - Referencia: ${item_id}`,
          1, // Proveedor por defecto
          0
        ]);
        productoId = nuevoProducto.rows[0].id;

        console.log(`✅ Producto creado con ID: ${productoId}`);
      } else {
        productoId = productoLocal.rows[0].id;
        console.log(`✅ Producto encontrado: ID=${productoId}, código="${productoLocal.rows[0].codigo}", nombre="${productoLocal.rows[0].nombre}"`);

        // NUEVO: Actualizar código si es necesario (para productos viejos)
        if (productoLocal.rows[0].codigo !== item_id) {
          console.log(`🔄 Actualizando código de "${productoLocal.rows[0].codigo}" a "${item_id}"`);
          await query(`
            UPDATE productos 
            SET codigo = $1, 
                descripcion = COALESCE(descripcion, '') || ' - Actualizado con referencia correcta'
            WHERE id = $2
          `, [item_id, productoId]);
        }
      }


      // Registrar el faltante
      const nuevoFaltante = await query(`
        INSERT INTO faltantes (
          factura_id, producto_id, cantidad_faltante, 
          tipo_faltante, observaciones, registrado_por
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        facturaLocalId,
        productoId,
        cantidad_faltante,
        tipo_faltante,
        observaciones || null,
        registrado_por
      ]);

      faltantesRegistrados.push({
        ...nuevoFaltante.rows[0],
        nombre_producto: nombre_producto
      });
    }

    if (observaciones_adicionales) {
      await query(`
      UPDATE facturas 
      SET observaciones_adicionales = $1
      WHERE alegra_id = $2
    `, [observaciones_adicionales, facturaId]);
      console.log(`📝 Observaciones adicionales guardadas: "${observaciones_adicionales}"`);
    }

    console.log(`✅ ${faltantesRegistrados.length} faltantes registrados exitosamente`);

    res.status(201).json({
      success: true,
      data: {
        factura_id: facturaLocalId,
        faltantes: faltantesRegistrados,
        total_registrados: faltantesRegistrados.length
      },
      message: `${faltantesRegistrados.length} faltantes registrados exitosamente`
    });

  } catch (error) {
    console.error('❌ Error registrando faltantes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error registrando faltantes'
    });
  }
});

// Reporte de faltantes por proveedor CON MAPPING EXTERNO
router.get('/reportes/faltantes/proveedor', async (req, res) => {
  try {
    const { query } = require('../config/database');

    console.log('📋 Generando reporte de faltantes por proveedor con mapping...');

    // PASO 1: Obtener faltantes de la BD local
    const faltantesResult = await query(`
      SELECT 
        p.codigo as producto_codigo,
        p.nombre as producto_nombre,
        SUM(f.cantidad_faltante) as total_faltante,
        COUNT(f.id) as facturas_afectadas,
        f.tipo_faltante,
        STRING_AGG(DISTINCT fa.cliente_nombre, ', ') as clientes_afectados
      FROM faltantes f
      JOIN productos p ON f.producto_id = p.id
      JOIN facturas fa ON f.factura_id = fa.id
      WHERE f.estado = 'pendiente'
      GROUP BY p.codigo, p.nombre, f.tipo_faltante
      ORDER BY total_faltante DESC
    `);

    console.log(`📊 Encontrados ${faltantesResult.rows.length} productos con faltantes`);

    if (faltantesResult.rows.length === 0) {
      return res.json({
        success: true,
        data: [],
        total_proveedores: 0,
        resumen: {
          total_productos_faltantes: 0,
          total_cantidad_faltante: 0
        }
      });
    }

    // PASO 2: Obtener códigos únicos para buscar mapping
    const codigosProductos = faltantesResult.rows.map(row => row.producto_codigo);
    console.log(`🔍 Buscando mapping para ${codigosProductos.length} códigos:`, codigosProductos);

    // PASO 3: Buscar mapping en Supabase (ya no en BD externa)
    const placeholders = codigosProductos.map((_, index) => `$${index + 1}`).join(',');
    const mappingResult = await query(`
      SELECT 
        supplier_name as "supplierName",
        supplier_cedula as "supplierCedula", 
        supplier_code as "supplierCode",
        supplier_desc as "supplierDesc",
        alegra_reference as "alegraReference",
        alegra_name as "alegraName",
        confidence
      FROM supplier_product_mapping 
      WHERE alegra_reference IN (${placeholders})
      ORDER BY supplier_name, supplier_code
    `, codigosProductos);

    console.log(`🔗 Encontrados ${mappingResult.rows.length} mappings en Supabase`);

    // PASO 4: Agrupar por proveedor
    const proveedoresMap = new Map();

    faltantesResult.rows.forEach(faltante => {
      // Buscar mapping para este producto
      const mapping = mappingResult.rows.find(m => m.alegraReference === faltante.producto_codigo);

      let proveedorNombre, proveedorCedula;

      if (mapping) {
        // Usar datos del mapping de Supabase
        proveedorNombre = mapping.supplierName;
        proveedorCedula = mapping.supplierCedula;
      } else {
        // ✅ NUEVO: Agrupar todos los productos sin mapping en un solo grupo
        proveedorNombre = 'Sin_Proveedor';
        proveedorCedula = 'SIN_PROVEEDOR';

        console.warn(`⚠️ No se encontró mapping para código: ${faltante.producto_codigo}`);
      }

      // Crear o obtener proveedor
      if (!proveedoresMap.has(proveedorNombre)) {
        proveedoresMap.set(proveedorNombre, {
          id: proveedorCedula, // Usar cédula como ID único
          nombre: proveedorNombre,
          contacto: proveedorCedula,
          productos_faltantes: [],
          total_productos: 0,
          total_cantidad: 0
        });
      }

      const proveedor = proveedoresMap.get(proveedorNombre);

      // Agregar producto faltante
      proveedor.productos_faltantes.push({
        nombre: faltante.producto_nombre,
        codigo: faltante.producto_codigo,
        codigo_proveedor: mapping ? mapping.supplierCode : 'N/A', // Código del proveedor
        cantidad_faltante: parseInt(faltante.total_faltante),
        facturas_afectadas: parseInt(faltante.facturas_afectadas),
        tipo_faltante: faltante.tipo_faltante,
        clientes_afectados: faltante.clientes_afectados,
        confianza_mapping: mapping ? mapping.confidence : 0 // Confianza del mapping
      });

      proveedor.total_productos++;
      proveedor.total_cantidad += parseInt(faltante.total_faltante);
    });

    const proveedoresArray = Array.from(proveedoresMap.values());

    // PASO 5: Estadísticas de mapping
    const totalProductos = faltantesResult.rows.length;
    const productosConMapping = mappingResult.rows.length;
    const productosInMapping = faltantesResult.rows.filter(f =>
      mappingResult.rows.some(m => m.alegraReference === f.producto_codigo)
    ).length;

    console.log(`✅ Reporte generado: ${proveedoresArray.length} proveedores, ${productosConMapping}/${totalProductos} productos mapeados`);

    res.json({
      success: true,
      data: proveedoresArray,
      total_proveedores: proveedoresArray.length,
      resumen: {
        total_productos_faltantes: totalProductos,
        total_cantidad_faltante: proveedoresArray.reduce((sum, p) => sum + p.total_cantidad, 0),
        productos_con_mapping: productosInMapping,
        productos_sin_mapping: totalProductos - productosInMapping,
        porcentaje_mapping: Math.round((productosInMapping / totalProductos) * 100)
      }
    });

  } catch (error) {
    console.error('❌ Error generando reporte por proveedor:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error generando reporte por proveedor con mapping de Supabase'
    });
  }
});

// Reporte de faltantes por cliente - MODIFICADO
router.get('/reportes/faltantes/cliente', async (req, res) => {
  try {
    const { query } = require('../config/database');

    const result = await query(`
      SELECT 
        fa.cliente_nombre,
        fa.cliente_email,
        fa.numero_factura,
        fa.fecha_emision,
        fa.alegra_id as factura_alegra_id,
        fa.estado_procesamiento,
        p.nombre as producto_nombre,
        p.codigo as producto_codigo,
        pr.nombre as proveedor_nombre,
        f.cantidad_faltante,
        f.tipo_faltante,
        f.observaciones,
        f.estado as faltante_estado,
        fa.observaciones_adicionales,
        f.created_at as fecha_registro,
        f.updated_at as fecha_procesamiento,
        -- NUEVO: Traer ajustes guardados
        aj.cantidad_entregada,
        aj.estado as ajuste_estado,
        aj.requiere_actualizacion
      FROM faltantes f
      JOIN productos p ON f.producto_id = p.id
      JOIN proveedores pr ON p.proveedor_id = pr.id
      JOIN facturas fa ON f.factura_id = fa.id
      LEFT JOIN faltantes_ajustes aj ON f.id = aj.faltante_id
      WHERE f.estado IN ('pendiente', 'procesado')
      ORDER BY fa.cliente_nombre, fa.fecha_emision DESC
    `);

    // Agrupar por cliente
    const clientesMap = new Map();

    result.rows.forEach(row => {
      if (!clientesMap.has(row.cliente_nombre)) {
        clientesMap.set(row.cliente_nombre, {
          nombre: row.cliente_nombre,
          email: row.cliente_email,
          facturas_con_faltantes: new Map(),
          total_productos: 0,
          total_cantidad: 0,
          ultima_actividad: null
        });
      }

      const cliente = clientesMap.get(row.cliente_nombre);

      // Agrupar por factura dentro del cliente
      const facturaKey = row.numero_factura;
      if (!cliente.facturas_con_faltantes.has(facturaKey)) {
        cliente.facturas_con_faltantes.set(facturaKey, {
          numero_factura: row.numero_factura,
          fecha_emision: row.fecha_emision,
          alegra_id: row.factura_alegra_id,
          estado_procesamiento: row.estado_procesamiento,
          fecha_procesamiento: row.fecha_procesamiento,
          observaciones_adicionales: row.observaciones_adicionales,
          productos_faltantes: []
        });
      }

      const factura = cliente.facturas_con_faltantes.get(facturaKey);
      factura.productos_faltantes.push({
        nombre: row.producto_nombre,
        codigo: row.producto_codigo,
        proveedor: row.proveedor_nombre,
        cantidad_faltante: parseInt(row.cantidad_faltante),
        tipo_faltante: row.tipo_faltante,
        observaciones: row.observaciones,
        fecha_registro: row.fecha_registro,
        estado: row.faltante_estado,
        // NUEVO: Ajustes guardados
        cantidad_entregada: row.cantidad_entregada || 0,
        ajuste_estado: row.ajuste_estado || 'pendiente',
        requiere_actualizacion: row.requiere_actualizacion || false
      });

      // Solo contar en totales si está pendiente
      if (row.faltante_estado === 'pendiente') {
        cliente.total_productos++;
        cliente.total_cantidad += parseInt(row.cantidad_faltante);
      }

      // Actualizar última actividad
      if (!cliente.ultima_actividad || new Date(row.fecha_registro) > new Date(cliente.ultima_actividad)) {
        cliente.ultima_actividad = row.fecha_registro;
      }
    });

    // Convertir Maps a Arrays
    const clientesArray = Array.from(clientesMap.values()).map(cliente => ({
      ...cliente,
      facturas_con_faltantes: Array.from(cliente.facturas_con_faltantes.values())
    }));

    res.json({
      success: true,
      data: clientesArray,
      total_clientes: clientesArray.length,
      resumen: {
        total_productos_faltantes: result.rows.filter(r => r.faltante_estado === 'pendiente').length,
        total_cantidad_faltante: clientesArray.reduce((sum, c) => sum + c.total_cantidad, 0),
        total_facturas_afectadas: Array.from(new Set(result.rows.map(r => r.numero_factura))).length
      }
    });

  } catch (error) {
    console.error('❌ Error generando reporte por cliente:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error generando reporte por cliente'
    });
  }
});

// Actualizar factura en Alegra según faltantes registrados
router.put('/facturas/:id/actualizar-alegra', async (req, res) => {
  try {
    const { id: facturaId } = req.params;
    const { ajustes } = req.body;

    console.log(`🔄 Actualizando factura ${facturaId} en Alegra según faltantes...`);
    console.log('📝 Ajustes recibidos:', ajustes);

    const { query } = require('../config/database');

    // Obtener faltantes de esta factura
    const faltantes = await query(`
      SELECT f.*, p.codigo as producto_codigo, p.nombre as producto_nombre
      FROM faltantes f
      JOIN productos p ON f.producto_id = p.id
      JOIN facturas fa ON f.factura_id = fa.id
      WHERE fa.alegra_id = $1
    `, [facturaId]);

    if (faltantes.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay faltantes registrados para esta factura'
      });
    }

    // Obtener factura actual de Alegra
    const facturaAlegra = await alegraService.getInvoiceById(facturaId);
    if (!facturaAlegra.success) {
      return res.status(404).json({
        success: false,
        message: 'Factura no encontrada en Alegra'
      });
    }

    // ✅ NUEVO: Procesar items con ELIMINAR → RE-AGREGAR para actualizar precios
    const cambiosRealizados = [];
    const itemsParaMantener = [];
    const itemsParaEliminarYReagregar = [];

    for (const item of facturaAlegra.data.items) {
      // Buscar si hay ajustes para este producto desde el frontend
      const ajuste = ajustes.find(a =>
        a.producto_codigo === item.id || a.producto_codigo === item.reference
      );

      if (ajuste) {
        // Calcular cantidad final según el ajuste
        let cantidadFinal = 0;
        let accionDescripcion = '';

        if (ajuste.estado === 'no_llego') {
          // No llegó nada - reducir toda la cantidad faltante
          cantidadFinal = item.quantity - ajuste.cantidad_faltante_original;
          accionDescripcion = 'reducido - no llegó nada';
        } else if (ajuste.estado === 'parcial') {
          // Llegó parcial - reducir por lo que aún falta
          const cantidadQueAunFalta = ajuste.cantidad_faltante_original - ajuste.cantidad_entregada;
          cantidadFinal = item.quantity - cantidadQueAunFalta;
          accionDescripcion = `reducido - entregado ${ajuste.cantidad_entregada}/${ajuste.cantidad_faltante_original}`;
        } else if (ajuste.estado === 'completo') {
          // Llegó completo - mantener cantidad original
          cantidadFinal = item.quantity;
          accionDescripcion = 'sin cambios - llegó completo';
        }

        // Si la cantidad final es mayor a 0, eliminar y re-agregar para actualizar precio
        if (cantidadFinal > 0) {
          itemsParaEliminarYReagregar.push({
            itemOriginal: item,
            cantidadFinal: cantidadFinal,
            ajuste: ajuste
          });

          cambiosRealizados.push({
            producto: ajuste.producto_nombre,
            accion: `${accionDescripcion} + precio actualizado`,
            cantidad_original: item.quantity,
            cantidad_nueva: cantidadFinal,
            precio_actualizado: true
          });
        } else {
          // Cantidad final es 0 o negativa - eliminar completamente
          cambiosRealizados.push({
            producto: ajuste.producto_nombre,
            accion: 'eliminado completamente',
            cantidad_original: item.quantity,
            cantidad_nueva: 0,
            precio_actualizado: false
          });
        }
      } else {
        // Sin ajustes, mantener el item igual
        itemsParaMantener.push({
          id: item.id,
          quantity: item.quantity,
          price: item.price,
          reference: item.reference,
          description: item.description,
          tax: item.tax || []
        });
      }
    }

    // ✅ PASO 1: Crear items base (los que no cambian)
    let itemsFinales = [...itemsParaMantener];

    // ✅ PASO 2: Para cada item que requiere cambio: ELIMINAR → RE-AGREGAR
    for (const itemParaProcesar of itemsParaEliminarYReagregar) {
      const { itemOriginal, cantidadFinal } = itemParaProcesar;

      console.log(`🔄 Procesando item: ${itemOriginal.description} - Cantidad: ${itemOriginal.quantity} → ${cantidadFinal}`);

      // PRIMERO: Eliminar el item original
      console.log(`🗑️ Eliminando item ${itemOriginal.id} de la factura`);
      const eliminarResult = await alegraService.removeItemFromInvoice(facturaId, itemOriginal.id);

      if (!eliminarResult.success) {
        console.error(`❌ Error eliminando item ${itemOriginal.id}:`, eliminarResult.message);
        continue; // Continuar con el siguiente item
      }

      // SEGUNDO: Re-agregar el item con nueva cantidad (precio se actualiza automáticamente)
      console.log(`➕ Re-agregando item con cantidad ${cantidadFinal} y precio actualizado`);
      const agregarResult = await alegraService.addItemToInvoice(facturaId, {
        reference: itemOriginal.reference,
        description: itemOriginal.description,
        quantity: cantidadFinal,
        tax: itemOriginal.tax || []
      });

      if (!agregarResult.success) {
        console.error(`❌ Error re-agregando item:`, agregarResult.message);
        // Si falla el re-agregar, intentar restaurar el item original
        await alegraService.addItemToInvoice(facturaId, {
          reference: itemOriginal.reference,
          description: itemOriginal.description,
          quantity: itemOriginal.quantity,
          tax: itemOriginal.tax || []
        });
      }
    }

    // ✅ PASO 3: Marcar faltantes como procesados
    await query(`
      UPDATE faltantes 
      SET observaciones = CONCAT(COALESCE(observaciones, ''), ' - Procesado en Alegra con precios actualizados')
      FROM productos p, facturas fa
      WHERE faltantes.producto_id = p.id 
      AND faltantes.factura_id = fa.id 
      AND fa.alegra_id = $1
    `, [facturaId]);

    console.log(`✅ Factura ${facturaId} actualizada con ${cambiosRealizados.length} cambios`);

    res.json({
      success: true,
      message: `Factura ${facturaId} actualizada en Alegra con precios actualizados`,
      cambios: cambiosRealizados,
      total_cambios: cambiosRealizados.length,
      items_procesados: itemsParaEliminarYReagregar.length,
      items_mantenidos: itemsParaMantener.length
    });

  } catch (error) {
    console.error('❌ Error actualizando factura en Alegra:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error actualizando factura en Alegra'
    });
  }
});

// Limpiar facturas y preparar para historial/reimpresión - CORREGIDO
router.post('/facturas/limpiar', async (req, res) => {
  try {
    const { facturas_historial, facturas_reimpresion, procesado_por = 'Sistema' } = req.body;

    console.log(`🧹 Procesando limpieza de facturas...`);

    const { query } = require('../config/database');

    // Registrar procesamiento
    const procesamiento = await query(`
      INSERT INTO procesamientos (
        total_facturas, facturas_para_historial, facturas_para_reimpresion, 
        procesado_por, detalles
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      facturas_historial.length,
      facturas_historial.length,
      facturas_reimpresion.length,
      procesado_por,
      JSON.stringify({ facturas_historial, facturas_reimpresion })
    ]);

    // Marcar faltantes como procesados
    const facturasIds = facturas_historial.map(f => f.alegra_id);
    if (facturasIds.length > 0) {
      await query(`
        UPDATE faltantes 
        SET estado = 'procesado'
        FROM facturas fa
        WHERE faltantes.factura_id = fa.id 
        AND fa.alegra_id = ANY($1::int[])
      `, [facturasIds]);
    }

    // 🔧 CORREGIDO: Guardar facturas para reimpresión sin duplicados
    for (const factura of facturas_reimpresion) {
      // Verificar si existe
      const existeReimpresion = await query(`
        SELECT fr.id FROM facturas_reimpresion fr
        JOIN facturas fa ON fr.factura_id = fa.id
        WHERE fa.alegra_id = $1
      `, [factura.alegra_id]);

      if (existeReimpresion.rows.length > 0) {
        // Actualizar existente
        await query(`
          UPDATE facturas_reimpresion 
          SET ajustes_realizados = $2,
              estado = 'pendiente',
              fecha_creacion = CURRENT_TIMESTAMP,
              fecha_procesamiento = NULL
          FROM facturas fa
          WHERE facturas_reimpresion.factura_id = fa.id
          AND fa.alegra_id = $1
        `, [factura.alegra_id, JSON.stringify(factura.ajustes)]);
      } else {
        // Insertar nuevo
        await query(`
          INSERT INTO facturas_reimpresion (factura_id, ajustes_realizados, estado, fecha_creacion)
          SELECT fa.id, $2, 'pendiente', CURRENT_TIMESTAMP
          FROM facturas fa 
          WHERE fa.alegra_id = $1
        `, [factura.alegra_id, JSON.stringify(factura.ajustes)]);
      }
    }

    console.log(`✅ Facturas procesadas sin duplicados: ${facturas_reimpresion.length} para reimpresión`);

    res.json({
      success: true,
      message: 'Facturas procesadas correctamente',
      data: {
        procesamiento_id: procesamiento.rows[0].id,
        facturas_procesadas: facturas_historial.length,
        facturas_reimpresion: facturas_reimpresion.length
      }
    });

  } catch (error) {
    console.error('❌ Error en limpieza de facturas:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error procesando limpieza'
    });
  }
});

// Limpiar faltantes por proveedor (borrar de BD)
router.delete('/reportes/faltantes/proveedor/limpiar', async (req, res) => {
  try {
    console.log('🗑️ Limpiando faltantes NO procesados de la BD...');

    const { query } = require('../config/database');

    // Obtener solo los faltantes pendientes (NO procesados)
    const faltantesABorrar = await query(`
      SELECT f.id, p.nombre as producto_nombre, pr.nombre as proveedor_nombre
      FROM faltantes f
      JOIN productos p ON f.producto_id = p.id
      JOIN proveedores pr ON p.proveedor_id = pr.id
      WHERE f.estado = 'pendiente'
    `);

    if (faltantesABorrar.rows.length === 0) {
      return res.json({
        success: true,
        message: 'No hay faltantes pendientes para limpiar. Los datos procesados se mantienen en el historial.',
        datos_borrados: 0
      });
    }

    // Borrar SOLO los faltantes pendientes (preservar procesados)
    const resultado = await query(`
      DELETE FROM faltantes 
      WHERE estado = 'pendiente'
      RETURNING id
    `);

    // Limpiar observaciones adicionales de facturas que ya no tienen faltantes pendientes
    await query(`
    UPDATE facturas 
    SET observaciones_adicionales = NULL
    WHERE observaciones_adicionales IS NOT NULL
    AND NOT EXISTS (
    SELECT 1 FROM faltantes f 
    WHERE f.factura_id = facturas.id 
    AND f.estado = 'pendiente'
     )
  `);

    console.log(`✅ ${resultado.rows.length} faltantes pendientes borrados. Historial preservado.`);
    console.log(`✅ Observaciones adicionales limpiadas de facturas sin faltantes pendientes.`); // ← AGREGAR ESTE LOG

    res.json({
      success: true,
      message: `${resultado.rows.length} faltantes pendientes eliminados. Los datos procesados se mantienen en el historial.`,
      datos_borrados: resultado.rows.length,
      historial_preservado: true,
      faltantes_eliminados: faltantesABorrar.rows
    });

  } catch (error) {
    console.error('❌ Error limpiando faltantes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error limpiando faltantes de la base de datos'
    });
  }
});

// Obtener facturas pendientes de reimpresión
router.get('/reimpresion/pendientes', async (req, res) => {
  try {
    console.log('📋 Obteniendo facturas pendientes de reimpresión...');

    const { query } = require('../config/database');

    const result = await query(`
      SELECT 
        fr.id as reimpresion_id,
        fr.ajustes_realizados,
        fr.estado as estado_reimpresion,
        fr.fecha_creacion,
        fa.id as factura_id,
        fa.numero_factura,
        fa.alegra_id,
        fa.cliente_nombre,
        fa.cliente_email,
        fa.fecha_emision,
        fa.total
      FROM facturas_reimpresion fr
      JOIN facturas fa ON fr.factura_id = fa.id
      WHERE fr.estado = 'pendiente'
      ORDER BY fr.fecha_creacion DESC
    `);

    // Procesar los ajustes JSONB para mejor visualización
    const facturasConAjustes = result.rows.map(factura => {
      const ajustes = typeof factura.ajustes_realizados === 'string'
        ? JSON.parse(factura.ajustes_realizados)
        : factura.ajustes_realizados;

      return {
        ...factura,
        ajustes_realizados: ajustes,
        total_ajustes: ajustes?.length || 0,
        requiere_actualizacion: ajustes?.some(aj => aj.requiere_actualizacion) || false
      };
    });

    res.json({
      success: true,
      data: facturasConAjustes,
      total_pendientes: facturasConAjustes.length,
      resumen: {
        facturas_pendientes: facturasConAjustes.length,
        facturas_con_cambios: facturasConAjustes.filter(f => f.requiere_actualizacion).length,
        facturas_resueltas: facturasConAjustes.filter(f => !f.requiere_actualizacion).length
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo facturas pendientes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo facturas pendientes de reimpresión'
    });
  }
});

// Obtener historial de procesamientos
router.get('/reimpresion/historial', async (req, res) => {

  try {
    console.log('📚 Obteniendo historial de procesamientos...');

    const { query } = require('../config/database');
    const { fecha_desde, fecha_hasta, procesado_por } = req.query;

    let sqlQuery = `
      SELECT 
        p.id,
        p.fecha_procesamiento,
        p.total_facturas,
        p.facturas_para_historial,
        p.facturas_para_reimpresion,
        p.procesado_por,
        p.detalles
      FROM procesamientos p
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (fecha_desde) {
      sqlQuery += ` AND p.fecha_procesamiento >= $${paramIndex}`;
      params.push(fecha_desde);
      paramIndex++;
    }

    if (fecha_hasta) {
      sqlQuery += ` AND p.fecha_procesamiento <= $${paramIndex}`;
      params.push(fecha_hasta);
      paramIndex++;
    }

    if (procesado_por) {
      sqlQuery += ` AND p.procesado_por ILIKE $${paramIndex}`;
      params.push(`%${procesado_por}%`);
      paramIndex++;
    }

    sqlQuery += ` ORDER BY p.fecha_procesamiento DESC LIMIT 100`;

    const result = await query(sqlQuery, params);

    // Procesar detalles JSONB
    const procesamientosConDetalles = result.rows.map(proc => {
      const detalles = typeof proc.detalles === 'string'
        ? JSON.parse(proc.detalles)
        : proc.detalles;

      return {
        ...proc,
        detalles_procesados: detalles
      };
    });

    res.json({
      success: true,
      data: procesamientosConDetalles,
      total: procesamientosConDetalles.length,
      filtros_aplicados: { fecha_desde, fecha_hasta, procesado_por }
    });

  } catch (error) {
    console.error('❌ Error obteniendo historial:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo historial de procesamientos'
    });
  }
});

// Obtener historial de procesamientos
router.get('/facturas/historial-procesamientos', async (req, res) => {
  try {
    console.log('📚 Obteniendo historial de procesamientos...');

    const { query } = require('../config/database');
    const { fecha_desde, fecha_hasta, procesado_por } = req.query;

    let sqlQuery = `
      SELECT 
        p.id,
        p.fecha_procesamiento,
        p.total_facturas,
        p.facturas_para_historial,
        p.facturas_para_reimpresion,
        p.procesado_por,
        p.detalles
      FROM procesamientos p
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (fecha_desde) {
      sqlQuery += ` AND p.fecha_procesamiento >= $${paramIndex}`;
      params.push(fecha_desde);
      paramIndex++;
    }

    if (fecha_hasta) {
      sqlQuery += ` AND p.fecha_procesamiento <= $${paramIndex}`;
      params.push(fecha_hasta);
      paramIndex++;
    }

    if (procesado_por) {
      sqlQuery += ` AND p.procesado_por ILIKE $${paramIndex}`;
      params.push(`%${procesado_por}%`);
      paramIndex++;
    }

    sqlQuery += ` ORDER BY p.fecha_procesamiento DESC LIMIT 100`;

    const result = await query(sqlQuery, params);

    // Procesar detalles JSONB
    const procesamientosConDetalles = result.rows.map(proc => {
      const detalles = typeof proc.detalles === 'string'
        ? JSON.parse(proc.detalles)
        : proc.detalles;

      return {
        ...proc,
        detalles_procesados: detalles
      };
    });

    res.json({
      success: true,
      data: procesamientosConDetalles,
      total: procesamientosConDetalles.length,
      filtros_aplicados: { fecha_desde, fecha_hasta, procesado_por }
    });

  } catch (error) {
    console.error('❌ Error obteniendo historial:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo historial de procesamientos'
    });
  }
});

// Procesar factura individual - CORREGIDO (Sin duplicación + Guarda ajustes)
router.post('/facturas/procesar-individual', async (req, res) => {
  try {
    console.log('📋 Procesando factura individual...');

    const { alegra_id, numero_factura, cliente_nombre, fecha_emision, ajustes, estado } = req.body;

    if (!alegra_id || !numero_factura) {
      return res.status(400).json({
        success: false,
        message: 'alegra_id y numero_factura son requeridos'
      });
    }

    const { query } = require('../config/database');

    // 1. Registrar en procesamientos (historial individual)
    const procesamiento = await query(`
      INSERT INTO procesamientos (
        total_facturas, facturas_para_historial, facturas_para_reimpresion, 
        procesado_por, detalles
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      1, // Una sola factura
      1, // Siempre va al historial
      estado.includes('requiere_reimpresion') ? 1 : 0,
      'Usuario Individual',
      JSON.stringify({
        factura_procesada: {
          alegra_id,
          numero_factura,
          cliente_nombre,
          fecha_emision,
          ajustes,
          estado
        }
      })
    ]);

    // 2. Si requiere reimpresión, guardar/actualizar en facturas_reimpresion
    if (estado.includes('requiere_reimpresion')) {
      // 🔧 CORREGIDO: Verificar si existe y actualizar, o insertar nuevo
      const existeReimpresion = await query(`
        SELECT fr.id FROM facturas_reimpresion fr
        JOIN facturas fa ON fr.factura_id = fa.id
        WHERE fa.alegra_id = $1
      `, [alegra_id]);

      if (existeReimpresion.rows.length > 0) {
        // Actualizar existente
        await query(`
          UPDATE facturas_reimpresion 
          SET ajustes_realizados = $2,
              estado = 'pendiente',
              fecha_creacion = CURRENT_TIMESTAMP,
              fecha_procesamiento = NULL
          FROM facturas fa
          WHERE facturas_reimpresion.factura_id = fa.id
          AND fa.alegra_id = $1
        `, [alegra_id, JSON.stringify(ajustes)]);

        console.log(`🔄 Factura ${numero_factura} actualizada en reimpresión`);
      } else {
        // Insertar nuevo
        await query(`
          INSERT INTO facturas_reimpresion (factura_id, ajustes_realizados, estado, fecha_creacion)
          SELECT fa.id, $2, 'pendiente', CURRENT_TIMESTAMP
          FROM facturas fa 
          WHERE fa.alegra_id = $1
        `, [alegra_id, JSON.stringify(ajustes)]);

        console.log(`➕ Factura ${numero_factura} agregada a reimpresión`);
      }
    }

    // 🔧 NUEVO: 2.5 Guardar ajustes en faltantes_ajustes ANTES de procesar
    console.log(`💾 Guardando ${ajustes.length} ajustes en base de datos...`);

    for (const ajuste of ajustes) {
      try {
        // Buscar el faltante_id correspondiente a este producto
        const faltanteResult = await query(`
          SELECT f.id as faltante_id
          FROM faltantes f
          JOIN productos p ON f.producto_id = p.id
          JOIN facturas fa ON f.factura_id = fa.id
          WHERE fa.alegra_id = $1 
          AND p.codigo = $2
          AND f.estado = 'pendiente'
          LIMIT 1
        `, [alegra_id, ajuste.producto_codigo]);

        if (faltanteResult.rows.length > 0) {
          const faltante_id = faltanteResult.rows[0].faltante_id;

          // Guardar/actualizar ajuste en faltantes_ajustes
          await query(`
            INSERT INTO faltantes_ajustes (faltante_id, cantidad_entregada, estado, requiere_actualizacion)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (faltante_id) 
            DO UPDATE SET 
              cantidad_entregada = $2,
              estado = $3,
              requiere_actualizacion = $4,
              updated_at = CURRENT_TIMESTAMP
          `, [
            faltante_id,
            ajuste.cantidad_entregada,
            ajuste.estado,
            ajuste.requiere_actualizacion
          ]);

          console.log(`💾 Ajuste guardado: ${ajuste.producto_codigo} → entregado ${ajuste.cantidad_entregada} (${ajuste.estado})`);
        } else {
          console.warn(`⚠️ No se encontró faltante para producto: ${ajuste.producto_codigo} en factura ${alegra_id}`);
        }
      } catch (ajusteError) {
        console.error(`❌ Error guardando ajuste para ${ajuste.producto_codigo}:`, ajusteError.message);
        // Continuar con los demás ajustes aunque uno falle
      }
    }

    // 3. Marcar faltantes como procesados
    await query(`
      UPDATE faltantes 
      SET estado = 'procesado'
      FROM facturas fa
      WHERE faltantes.factura_id = fa.id 
      AND fa.alegra_id = $1
    `, [alegra_id]);

    // 4. Actualizar estado de la factura como procesada
    await query(`
      UPDATE facturas 
      SET estado_procesamiento = 'procesado'
      WHERE alegra_id = $1
    `, [alegra_id]);

    console.log(`✅ Factura ${numero_factura} procesada individualmente:`);
    console.log(`   📋 Faltantes marcados como procesados`);
    console.log(`   💾 ${ajustes.length} ajustes guardados permanentemente`);
    console.log(`🔄 Estado: ${estado.includes('requiere_reimpresion') ? 'En reimpresión' : 'En historial'}`);

    res.json({
      success: true,
      message: `Factura ${numero_factura} procesada correctamente`,
      data: {
        procesamiento_id: procesamiento.rows[0].id,
        factura_procesada: numero_factura,
        estado: estado,
        requiere_reimpresion: estado === 'requiere_reimpresion',
        ajustes_realizados: ajustes.length,
        ajustes_guardados: ajustes.length
      }
    });

  } catch (error) {
    console.error('❌ Error procesando factura individual:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error procesando factura individual'
    });
  }
});

// Actualización masiva de facturas en Alegra - CORREGIDO COMPLETAMENTE
router.post('/facturas/actualizar-masivo', async (req, res) => {
  try {
    console.log('🖨️ Iniciando actualización masiva de facturas...');

    const { facturas } = req.body;

    if (!facturas || !Array.isArray(facturas) || facturas.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de facturas para procesar'
      });
    }

    const { query } = require('../config/database');
    const alegraService = require('../services/alegraService');

    let facturasActualizadas = 0;
    let facturasConError = 0;
    let errores = [];

    console.log(`📊 Procesando ${facturas.length} facturas...`);

    for (const factura of facturas) {
      let facturaExitosa = true;

      try {
        console.log(`🔄 Actualizando factura ${factura.numero_factura} en Alegra con precios actualizados...`);

        // Obtener factura actual de Alegra
        const facturaActual = await alegraService.getInvoiceById(factura.alegra_id);

        if (!facturaActual.success) {
          throw new Error('Factura no encontrada en Alegra');
        }

        // 🔧 NUEVO: Una sola operación - Construir items actualizados
        console.log(`🔧 Construyendo items actualizados en una sola operación...`);

        const itemsActualizados = [];
        let huboCambios = false;

        for (const item of facturaActual.data.items) {
          // Buscar ajustes para este item
          const ajuste = factura.ajustes_realizados.find(a =>
            a.producto_codigo === item.id.toString() ||
            a.producto_codigo === item.reference
          );

          if (ajuste) {
            // Calcular cantidad final
            let cantidadFinal = item.quantity;

            if (ajuste.estado === 'no_llego') {
              cantidadFinal = item.quantity - ajuste.cantidad_faltante;
            } else if (ajuste.estado === 'parcial') {
              const cantidadQueAunFalta = ajuste.cantidad_faltante - ajuste.cantidad_entregada;
              cantidadFinal = item.quantity - cantidadQueAunFalta;
            }

            // Solo procesar si la cantidad final es mayor a 0
            if (cantidadFinal > 0) {
              console.log(`🔍 Obteniendo precio actualizado para item ${item.reference}...`);

              // Obtener precio actualizado usando alegraService
              const precioActualizado = await alegraService.getUpdatedPrice(item.reference);

              console.log(`📊 Item ${item.reference}: cantidad ${item.quantity} → ${cantidadFinal}, precio ${item.price} → ${precioActualizado}`);

              // Agregar item actualizado
              itemsActualizados.push({
                id: item.id,  // ✅ MANTENER ID original
                reference: item.reference,
                quantity: cantidadFinal,
                price: precioActualizado,
                description: item.description,
                tax: item.tax || []
              });

              huboCambios = true;
            }
            // Si cantidadFinal <= 0, el item se elimina (no se agrega al array)
          } else {
            // Items sin ajustes - mantener igual
            itemsActualizados.push({
              id: item.id,
              reference: item.reference,
              quantity: item.quantity,
              price: item.price,
              description: item.description,
              tax: item.tax || []
            });
          }
        }

        // Solo actualizar si hubo cambios
        if (huboCambios) {
          console.log(`🔄 Enviando ${itemsActualizados.length} items actualizados a Alegra...`);

          const updateResult = await alegraService.updateInvoice(factura.alegra_id, {
            items: itemsActualizados
          });

          if (!updateResult.success) {
            throw new Error(`Error actualizando factura: ${updateResult.message || 'Actualización falló'}`);
          }

          console.log(`✅ Factura ${factura.numero_factura} actualizada exitosamente en una sola operación`);
        } else {
          console.log(`ℹ️ Factura ${factura.numero_factura} no requiere cambios`);
        }

        // Marcar como exitosa
        facturasActualizadas++;

        // Marcar como procesada en facturas_reimpresion
        await query(`
          UPDATE facturas_reimpresion 
          SET estado = 'procesada', fecha_procesamiento = NOW()
          WHERE id = $1
        `, [factura.reimpresion_id]);

      } catch (error) {
        console.error(`❌ Error procesando factura ${factura.numero_factura}:`, error.message);
        facturaExitosa = false;
        facturasConError++;
        errores.push(`Error en factura ${factura.numero_factura}: ${error.message}`);
      }
    }

    console.log(`📊 Procesamiento completado: ${facturasActualizadas} actualizadas, ${facturasConError} con errores`);

    res.json({
      success: true,
      message: 'Actualización masiva completada',
      facturas_actualizadas: facturasActualizadas,
      facturas_con_error: facturasConError,
      errores: errores
    });

  } catch (error) {
    console.error('❌ Error en actualización masiva:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error en actualización masiva'
    });
  }
});

// ❌ COMENTADO: Endpoint duplicado que estaba sobrescribiendo al endpoint principal
// Este endpoint no se usa actualmente - el flujo principal usa el endpoint en línea 2301
/*
// Procesar factura individual con actualización automática de precios
// Esta ruta borra y recrea los items para asegurar precios actualizados
router.post('/facturas/procesar-individual', async (req, res) => {
  try {
    console.log('🖨️ Procesando factura individual con actualización de precios...');

    const { factura, items_editados } = req.body;

    if (!factura || !factura.alegra_id) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere una factura con alegra_id para procesar'
      });
    }

    const { query } = require('../config/database');

    console.log(`🔄 Procesando factura ${factura.numero_factura} (ID: ${factura.alegra_id})...`);

    // 1. Obtener factura actual completa de Alegra
    const facturaActual = await alegraService.getInvoiceById(factura.alegra_id);

    if (!facturaActual.success) {
      throw new Error('Factura no encontrada en Alegra');
    }

    console.log(`📋 Factura actual obtenida: ${facturaActual.data.items.length} items`);

    // 2. Construir lista de items con precios actualizados
    // Si hay items_editados (usuario hizo cambios manuales), usar esos
    // Si no, aplicar ajustes automáticos por faltantes
    let itemsActualizados = [];

    if (items_editados && items_editados.length > 0) {
      // Usuario editó manualmente
      console.log('✏️ Usando items editados por el usuario');
      itemsActualizados = items_editados;
    } else {
      // Aplicar ajustes automáticos
      console.log('🔧 Aplicando ajustes automáticos por faltantes');

      for (const item of facturaActual.data.items) {
        // Buscar ajuste para este item
        const ajuste = factura.ajustes_realizados?.find(a =>
          a.producto_codigo === item.id.toString() ||
          a.producto_codigo === item.reference
        );

        let cantidadFinal = item.quantity;

        if (ajuste) {
          // Calcular cantidad final según estado del ajuste
          if (ajuste.estado === 'no_llego') {
            cantidadFinal = item.quantity - ajuste.cantidad_faltante;
          } else if (ajuste.estado === 'parcial') {
            const cantidadQueAunFalta = ajuste.cantidad_faltante - ajuste.cantidad_entregada;
            cantidadFinal = item.quantity - cantidadQueAunFalta;
          }
        }

        // Solo incluir si cantidad > 0
        if (cantidadFinal > 0) {
          // Obtener precio actualizado
          console.log(`💰 Obteniendo precio actualizado para ${item.reference}...`);
          const precioActualizado = await alegraService.getUpdatedPrice(item.reference);

          itemsActualizados.push({
            id: item.id,
            reference: item.reference,
            quantity: cantidadFinal,
            price: precioActualizado,
            description: item.description,
            tax: item.tax || []
          });

          console.log(`  ✅ ${item.reference}: ${item.quantity} → ${cantidadFinal} | ₡${item.price} → ₡${precioActualizado}`);
        } else {
          console.log(`  🗑️ ${item.reference}: cantidad = 0, se eliminará`);
        }
      }
    }

    // 3. Actualizar factura en Alegra con items reconstruidos
    console.log(`🔄 Actualizando factura en Alegra con ${itemsActualizados.length} items...`);

    const updateResult = await alegraService.updateInvoice(factura.alegra_id, {
      items: itemsActualizados
    });

    if (!updateResult.success) {
      throw new Error(`Error actualizando factura: ${updateResult.message || 'Actualización falló'}`);
    }

    console.log(`✅ Factura ${factura.numero_factura} actualizada exitosamente`);

    // 4. Marcar como procesada en facturas_reimpresion
    await query(`
      UPDATE facturas_reimpresion
      SET estado = 'procesada',
          fecha_procesamiento = NOW()
      WHERE id = $1
    `, [factura.reimpresion_id]);

    console.log(`✅ Registro de reimpresión marcado como procesado`);

    res.json({
      success: true,
      message: 'Factura procesada exitosamente',
      data: {
        factura_id: factura.alegra_id,
        numero_factura: factura.numero_factura,
        items_actualizados: itemsActualizados.length
      }
    });

  } catch (error) {
    console.error('❌ Error procesando factura individual:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error procesando factura individual'
    });
  }
});
*/

// Recuperar factura procesada - CORREGIDO (Preserva ajustes previos)
router.post('/facturas/:id/recuperar', async (req, res) => {
  try {
    const { id: facturaId } = req.params;

    console.log(`🔄 Recuperando factura ${facturaId} (preservando ajustes previos)...`);

    const { query } = require('../config/database');

    // 1. Cambiar estado de faltantes de 'procesado' a 'pendiente'
    const faltantesRecuperados = await query(`
      UPDATE faltantes 
      SET estado = 'pendiente'
      FROM facturas fa
      WHERE faltantes.factura_id = fa.id 
      AND fa.alegra_id = $1
      AND faltantes.estado = 'procesado'
      RETURNING faltantes.id
    `, [facturaId]);

    // 2. Cambiar estado de la factura de vuelta a 'pendiente'
    await query(`
      UPDATE facturas 
      SET estado_procesamiento = 'pendiente'
      WHERE alegra_id = $1
    `, [facturaId]);

    // 🔧 CORREGIDO: 3. NO eliminar ajustes - los conservamos para mostrar valores previos
    // Los ajustes se mantienen en faltantes_ajustes para que el usuario vea lo que había ingresado antes
    console.log(`💾 Conservando ajustes previos para facilitar re-edición`);

    // 4. Eliminar registro de reimpresión - SINTAXIS CORREGIDA
    const reimpresionEliminada = await query(`
      DELETE FROM facturas_reimpresion 
      WHERE facturas_reimpresion.factura_id IN (
        SELECT fa.id FROM facturas fa WHERE fa.alegra_id = $1
      )
      AND facturas_reimpresion.estado IN ('pendiente', 'procesada')
      RETURNING facturas_reimpresion.id
    `, [facturaId]);

    console.log(`✅ Factura ${facturaId} recuperada inteligentemente:`);
    console.log(`   📋 ${faltantesRecuperados.rows.length} faltantes restaurados`);
    console.log(`   💾 Ajustes previos conservados para re-edición`);
    console.log(`   🗑️ ${reimpresionEliminada.rows.length} registros de reimpresión eliminados (se recreará si se vuelve a procesar)`);

    res.json({
      success: true,
      message: `Factura ${facturaId} recuperada con ajustes previos conservados`,
      data: {
        factura_id: facturaId,
        faltantes_restaurados: faltantesRecuperados.rows.length,
        ajustes_conservados: true,
        reimpresion_eliminada: reimpresionEliminada.rows.length
      }
    });

  } catch (error) {
    console.error('❌ Error recuperando factura:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error recuperando factura'
    });
  }
});


// Eliminar faltantes procesados permanentemente (incluye observaciones adicionales)
router.post('/facturas/eliminar-procesadas', async (req, res) => {
  try {
    const { facturas_ids } = req.body;

    console.log(`🗑️ Eliminando faltantes procesados de facturas: ${facturas_ids}`);

    const { query } = require('../config/database');

    // 1. PRIMERO: Eliminar ajustes
    await query(`
      DELETE FROM faltantes_ajustes 
      USING faltantes f, facturas fa
      WHERE faltantes_ajustes.faltante_id = f.id 
      AND f.factura_id = fa.id 
      AND fa.alegra_id = ANY($1::int[])
      AND f.estado = 'procesado'
    `, [facturas_ids]);

    // 2. DESPUÉS: Eliminar faltantes
    const resultado = await query(`
      DELETE FROM faltantes 
      USING facturas fa
      WHERE faltantes.factura_id = fa.id 
      AND fa.alegra_id = ANY($1::int[])
      AND faltantes.estado = 'procesado'
      RETURNING faltantes.id
    `, [facturas_ids]);

    // ✅ 3. NUEVO: Limpiar observaciones adicionales
    const observacionesLimpiadas = await query(`
      UPDATE facturas 
      SET observaciones_adicionales = NULL
      WHERE alegra_id = ANY($1::int[])
      AND observaciones_adicionales IS NOT NULL
      RETURNING id, numero_factura
    `, [facturas_ids]);

    console.log(`✅ ${resultado.rows.length} faltantes eliminados permanentemente`);
    console.log(`🧹 ${observacionesLimpiadas.rows.length} observaciones adicionales limpiadas`);

    res.json({
      success: true,
      message: `${resultado.rows.length} faltantes eliminados y ${observacionesLimpiadas.rows.length} observaciones limpiadas`,
      data: {
        faltantes_eliminados: resultado.rows.length,
        observaciones_limpiadas: observacionesLimpiadas.rows.length,
        facturas_afectadas: observacionesLimpiadas.rows.map(f => f.numero_factura)
      }
    });

  } catch (error) {
    console.error('❌ Error eliminando faltantes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error eliminando faltantes procesados'
    });
  }
});

// Guardar ajustes temporales
router.post('/faltantes/ajustes', async (req, res) => {
  try {
    const { faltante_id, cantidad_entregada, estado, requiere_actualizacion } = req.body;

    const { query } = require('../config/database');

    // Insertar o actualizar ajuste
    await query(`
      INSERT INTO faltantes_ajustes (faltante_id, cantidad_entregada, estado, requiere_actualizacion)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (faltante_id) 
      DO UPDATE SET 
        cantidad_entregada = $2,
        estado = $3,
        requiere_actualizacion = $4,
        updated_at = CURRENT_TIMESTAMP
    `, [faltante_id, cantidad_entregada, estado, requiere_actualizacion]);

    res.json({ success: true, message: 'Ajuste guardado' });

  } catch (error) {
    console.error('❌ Error guardando ajuste:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// NUEVO: Limpiar historial de procesamientos
router.delete('/reimpresion/historial', async (req, res) => {
  try {
    console.log('🗑️ Limpiando historial de procesamientos...');

    const { query } = require('../config/database');

    // Contar registros antes de eliminar
    const countResult = await query('SELECT COUNT(*) FROM procesamientos');
    const totalRegistros = parseInt(countResult.rows[0].count);

    // Eliminar todos los procesamientos
    await query('DELETE FROM procesamientos');

    console.log(`✅ Historial limpiado: ${totalRegistros} registros eliminados`);

    res.json({
      success: true,
      message: 'Historial limpiado correctamente',
      registros_eliminados: totalRegistros
    });

  } catch (error) {
    console.error('❌ Error limpiando historial:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error limpiando historial'
    });
  }
});

router.get('/orden-compra/cantidades', async (req, res) => {
  try {
    console.log('📋 Obteniendo cantidades modificadas...');

    const { query } = require('../config/database');

    const result = await query(`
      SELECT 
        proveedor_nombre,
        producto_codigo,
        producto_nombre,
        cantidad_original,
        cantidad_modificada,
        accion,
        created_at,
        updated_at
      FROM orden_compra_temporal
      ORDER BY proveedor_nombre, producto_nombre
    `);

    // Separar por tipo de acción
    const modificadas = result.rows.filter(r => !r.accion || r.accion === 'modificado');
    const eliminadas = result.rows.filter(r => r.accion === 'eliminado');
    const agregadas = result.rows.filter(r => r.accion === 'agregado');

    console.log(`✅ Obtenidos: ${modificadas.length} modificadas, ${eliminadas.length} eliminadas, ${agregadas.length} agregadas`);

    res.json({
      success: true,
      data: result.rows,
      modificadas,
      eliminadas,
      agregadas,
      total: result.rows.length
    });

  } catch (error) {
    console.error('❌ Error obteniendo cantidades:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo cantidades modificadas'
    });
  }
});

// Guardar cantidades modificadas
router.post('/orden-compra/cantidades', async (req, res) => {
  try {
    console.log('💾 Guardando cantidades modificadas...');

    const { cantidades } = req.body;

    if (!cantidades || !Array.isArray(cantidades)) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de cantidades'
      });
    }

    const { query } = require('../config/database');

    let cantidadesGuardadas = 0;

    // Procesar cada cantidad
    for (const cantidad of cantidades) {
      const {
        proveedor_nombre,
        producto_codigo,
        producto_nombre,
        cantidad_original,
        cantidad_modificada
      } = cantidad;

      // Validar datos requeridos
      if (!proveedor_nombre || !producto_codigo || !producto_nombre ||
        cantidad_original === undefined || cantidad_modificada === undefined) {
        console.warn('⚠️ Datos incompletos para:', cantidad);
        continue;
      }

      // Insertar o actualizar cantidad
      await query(`
        INSERT INTO orden_compra_temporal (
          proveedor_nombre, producto_codigo, producto_nombre, 
          cantidad_original, cantidad_modificada
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (proveedor_nombre, producto_codigo) 
        DO UPDATE SET 
          producto_nombre = $3,
          cantidad_original = $4,
          cantidad_modificada = $5,
          updated_at = CURRENT_TIMESTAMP
      `, [proveedor_nombre, producto_codigo, producto_nombre, cantidad_original, cantidad_modificada]);

      cantidadesGuardadas++;
    }

    console.log(`✅ ${cantidadesGuardadas} cantidades guardadas correctamente`);

    res.json({
      success: true,
      message: `${cantidadesGuardadas} cantidades guardadas correctamente`,
      cantidades_guardadas: cantidadesGuardadas
    });

  } catch (error) {
    console.error('❌ Error guardando cantidades:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error guardando cantidades modificadas'
    });
  }
});

// Limpiar todas las cantidades modificadas
router.delete('/orden-compra/cantidades', async (req, res) => {
  try {
    console.log('🗑️ Limpiando cantidades modificadas...');

    const { query } = require('../config/database');

    // Contar registros antes de eliminar
    const countResult = await query('SELECT COUNT(*) FROM orden_compra_temporal');
    const totalRegistros = parseInt(countResult.rows[0].count);

    // Eliminar todas las cantidades modificadas
    await query('DELETE FROM orden_compra_temporal');

    console.log(`✅ ${totalRegistros} cantidades eliminadas`);

    res.json({
      success: true,
      message: 'Cantidades modificadas eliminadas correctamente',
      registros_eliminados: totalRegistros
    });

  } catch (error) {
    console.error('❌ Error eliminando cantidades:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error eliminando cantidades modificadas'
    });
  }
});

// ✅ NUEVO: Guardar producto eliminado
router.post('/orden-compra/producto-eliminado', async (req, res) => {
  try {
    const { proveedorNombre, productoCodigo, productoNombre, cantidadOriginal } = req.body;

    if (!proveedorNombre || !productoCodigo) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere proveedorNombre y productoCodigo'
      });
    }

    const { query } = require('../config/database');

    await query(`
      INSERT INTO orden_compra_temporal 
        (proveedor_nombre, producto_codigo, producto_nombre, cantidad_original, cantidad_modificada, accion)
      VALUES ($1, $2, $3, $4, 0, 'eliminado')
      ON CONFLICT (proveedor_nombre, producto_codigo)
      DO UPDATE SET 
        accion = 'eliminado',
        cantidad_original = EXCLUDED.cantidad_original,
        updated_at = CURRENT_TIMESTAMP
    `, [proveedorNombre, productoCodigo, productoNombre || productoCodigo, cantidadOriginal || 0]);

    console.log(`🗑️ Producto eliminado guardado: ${proveedorNombre} - ${productoCodigo} (cantidad: ${cantidadOriginal})`);

    res.json({
      success: true,
      message: 'Producto eliminado guardado'
    });
  } catch (error) {
    console.error('❌ Error guardando producto eliminado:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ NUEVO: Guardar producto agregado
router.post('/orden-compra/producto-agregado', async (req, res) => {
  try {
    const { proveedorNombre, productoCodigo, productoNombre, cantidad } = req.body;

    if (!proveedorNombre || !productoCodigo || !productoNombre || !cantidad) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere proveedorNombre, productoCodigo, productoNombre y cantidad'
      });
    }

    const { query } = require('../config/database');

    await query(`
      INSERT INTO orden_compra_temporal 
        (proveedor_nombre, producto_codigo, producto_nombre, cantidad_original, cantidad_modificada, accion)
      VALUES ($1, $2, $3, 0, $4, 'agregado')
      ON CONFLICT (proveedor_nombre, producto_codigo)
      DO UPDATE SET 
        producto_nombre = EXCLUDED.producto_nombre,
        cantidad_original = 0,
        cantidad_modificada = EXCLUDED.cantidad_modificada, 
        accion = 'agregado',
        updated_at = CURRENT_TIMESTAMP
    `, [proveedorNombre, productoCodigo, productoNombre, cantidad]);

    console.log(`➕ Producto agregado guardado: ${proveedorNombre} - ${productoCodigo} x${cantidad}`);

    res.json({
      success: true,
      message: 'Producto agregado guardado'
    });
  } catch (error) {
    console.error('❌ Error guardando producto agregado:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ NUEVO: Restaurar producto eliminado
router.delete('/orden-compra/producto-eliminado', async (req, res) => {
  try {
    const { proveedorNombre, productoCodigo } = req.body;

    if (!proveedorNombre || !productoCodigo) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere proveedorNombre y productoCodigo'
      });
    }

    const { query } = require('../config/database');

    await query(`
      DELETE FROM orden_compra_temporal 
      WHERE proveedor_nombre = $1 AND producto_codigo = $2 AND accion = 'eliminado'
    `, [proveedorNombre, productoCodigo]);

    console.log(`↩️ Producto restaurado: ${proveedorNombre} - ${productoCodigo}`);

    res.json({
      success: true,
      message: 'Producto restaurado'
    });
  } catch (error) {
    console.error('❌ Error restaurando producto:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ NUEVO: Eliminar producto agregado
router.delete('/orden-compra/producto-agregado', async (req, res) => {
  try {
    const { proveedorNombre, productoCodigo } = req.body;

    if (!proveedorNombre || !productoCodigo) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere proveedorNombre y productoCodigo'
      });
    }

    const { query } = require('../config/database');

    await query(`
      DELETE FROM orden_compra_temporal 
      WHERE proveedor_nombre = $1 AND producto_codigo = $2 AND accion = 'agregado'
    `, [proveedorNombre, productoCodigo]);

    console.log(`🗑️ Producto agregado eliminado: ${proveedorNombre} - ${productoCodigo}`);

    res.json({
      success: true,
      message: 'Producto agregado eliminado'
    });
  } catch (error) {
    console.error('❌ Error eliminando producto agregado:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generar PDF de orden de compra - CORREGIDO CON INFO DEL PROVEEDOR
router.post('/orden-compra/generar-pdf', async (req, res) => {
  try {
    console.log('📄 Generando PDF de orden de compra con datos del proveedor...');

    const { proveedor, productos } = req.body;

    if (!proveedor || !productos || !Array.isArray(productos)) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere proveedor y array de productos'
      });
    }

    // NUEVO: Enriquecer productos con información del proveedor desde Supabase
    const { query } = require('../config/database');
    // Eliminamos la línea de queryExternal
    // const { queryExternal } = require('../config/external-database');

    console.log(`🔍 Enriqueciendo ${productos.length} productos con datos del proveedor...`);

    const productosEnriquecidos = [];

    for (const producto of productos) {
      try {
        console.log(`🔍 Buscando mapping para: ${producto.codigo} con proveedor: "${proveedor}"`);
        
        // Buscar información del proveedor para este producto en Supabase
        const mappingResult = await query(`
          SELECT 
            supplier_code as "supplierCode",
            supplier_desc as "supplierDesc",
            supplier_name as "supplierName",
            alegra_reference as "alegraReference",
            alegra_name as "alegraName",
            confidence,
            origen
          FROM supplier_product_mapping 
          WHERE alegra_reference = $1 
          AND supplier_name = $2
          LIMIT 1
        `, [producto.codigo, proveedor]);
        
        console.log(`   Resultados encontrados: ${mappingResult.rows.length}`);
        if (mappingResult.rows.length > 0) {
          console.log(`   Mapping: origen="${mappingResult.rows[0].origen}", supplierName="${mappingResult.rows[0].supplierName}"`);
          console.log(`   Códigos: supplier="${mappingResult.rows[0].supplierCode}", alegra="${mappingResult.rows[0].alegraReference}"`);
        }

        let productoEnriquecido;

        if (mappingResult.rows.length > 0) {
          const mapping = mappingResult.rows[0];
          
          // ✅ NUEVA LÓGICA: Verificar si tiene datos del proveedor (independiente del origen)
          const tieneCodigoProveedor = mapping.supplierCode && mapping.supplierDesc;
          
          if (tieneCodigoProveedor) {
            // ✅ TIENE CÓDIGO DEL PROVEEDOR: Usar datos del PROVEEDOR
            productoEnriquecido = {
              codigo_pdf: mapping.supplierCode,           // Código del proveedor
              nombre_pdf: mapping.supplierDesc,           // Descripción del proveedor
              cantidad: producto.cantidad,
              codigo_interno: producto.codigo,
              nombre_interno: producto.nombre,
              confianza: mapping.confidence,
              origen: 'con_codigo_proveedor'              // Tiene código del proveedor
            };
            console.log(`✅ CON CÓDIGO PROVEEDOR: ${mapping.alegraReference} → "${mapping.supplierCode}" / "${mapping.supplierDesc}"`);
          } else {
            // ❌ NO TIENE CÓDIGO DEL PROVEEDOR: Usar datos de ALEGRA (locales)
            productoEnriquecido = {
              codigo_pdf: mapping.alegraReference,        // Código Alegra (local)
              nombre_pdf: mapping.alegraName,             // Nombre Alegra (local)
              cantidad: producto.cantidad,
              codigo_interno: producto.codigo,
              nombre_interno: producto.nombre,
              confianza: mapping.confidence,
              origen: 'sin_codigo_proveedor'              // No tiene código del proveedor
            };
            console.log(`📝 SIN CÓDIGO PROVEEDOR: ${mapping.alegraReference} (usando datos locales)`);
          }
        } else {
          // Fallback: usar datos originales si no hay mapping
          productoEnriquecido = {
            codigo_pdf: producto.codigo,
            nombre_pdf: producto.nombre,
            cantidad: producto.cantidad,
            codigo_interno: producto.codigo,
            nombre_interno: producto.nombre,
            confianza: 0,
            origen: 'sin_mapeo'
          };

          console.warn(`⚠️ Sin mapping para producto: ${producto.codigo} del proveedor ${proveedor}`);
        }

        productosEnriquecidos.push(productoEnriquecido);

      } catch (mappingError) {
        console.error(`❌ Error buscando mapping para ${producto.codigo}:`, mappingError.message);

        // Fallback en caso de error
        productosEnriquecidos.push({
          codigo_pdf: producto.codigo,
          nombre_pdf: producto.nombre,
          cantidad: producto.cantidad,
          codigo_interno: producto.codigo,
          nombre_interno: producto.nombre,
          confianza: 0,
          origen: 'error'
        });
      }
    }

    // ✅ SEPARAR productos según tengan o no código del proveedor
    const productosConCodigoProveedor = productosEnriquecidos.filter(p => p.origen === 'con_codigo_proveedor');
    const productosSinCodigoProveedor = productosEnriquecidos.filter(p => p.origen === 'sin_codigo_proveedor');
    const productosSinMapeo = productosEnriquecidos.filter(p => p.origen === 'sin_mapeo' || p.origen === 'error');

    console.log(`📊 Separación de productos: ${productosConCodigoProveedor.length} con código proveedor, ${productosSinCodigoProveedor.length} sin código proveedor, ${productosSinMapeo.length} sin mapeo`);

    // Importar PDFKit
    const PDFDocument = require('pdfkit');

    // Crear documento PDF
    const doc = new PDFDocument({ margin: 50 });

    // Buffer para almacenar el PDF
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));

    // Promesa para esperar a que termine la generación
    const pdfPromise = new Promise((resolve) => {
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });
    });

    // ============================================
    // CONTENIDO DEL PDF
    // ============================================

    // Header principal
    doc.fontSize(20)
      .font('Helvetica-Bold')
      .text('ORDEN DE COMPRA', 50, 50);

    // Información del proveedor
    doc.fontSize(16)
      .font('Helvetica-Bold')
      .text(`Proveedor: ${proveedor}`, 50, 100);

    // Fecha
    const fecha = new Date().toLocaleDateString('es-CR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    doc.fontSize(12)
      .font('Helvetica')
      .text(`Fecha: ${fecha}`, 50, 130);

    // Línea separadora
    doc.moveTo(50, 160)
      .lineTo(550, 160)
      .stroke();

    // Headers de la tabla
    let yPos = 180;
    doc.fontSize(12)
      .font('Helvetica-Bold')
      .text('Código', 50, yPos)
      .text('Descripción', 150, yPos)
      .text('Cantidad', 450, yPos);

    // Línea debajo del header
    yPos += 20;
    doc.moveTo(50, yPos)
      .lineTo(550, yPos)
      .stroke();

    // Productos
    yPos += 10;
    let totalUnidades = 0;

    doc.font('Helvetica');

    // ✅ PRIMERO: Productos con código del proveedor (DATOS DEL PROVEEDOR)
    productosConCodigoProveedor.forEach((producto, index) => {
      yPos += 20;

      // Verificar si necesitamos nueva página
      if (yPos > 700) {
        doc.addPage();
        yPos = 50;

        // Repetir headers en nueva página
        doc.fontSize(12)
          .font('Helvetica-Bold')
          .text('Código', 50, yPos)
          .text('Descripción', 150, yPos)
          .text('Cantidad', 450, yPos);

        yPos += 20;
      }

      // Mostrar CÓDIGO Y NOMBRE DEL PROVEEDOR
      doc.fontSize(11)
        .text(producto.codigo_pdf || 'N/A', 50, yPos)  // Código del proveedor
        .text(producto.nombre_pdf || 'Sin descripción', 150, yPos, { width: 280 })  // Nombre del proveedor
        .text(producto.cantidad?.toString() || '0', 450, yPos);

      totalUnidades += parseInt(producto.cantidad) || 0;
    });

    // ✅ SEGUNDO: Header sutil para productos sin código del proveedor (solo si hay con código antes)
    if (productosSinCodigoProveedor.length > 0 && productosConCodigoProveedor.length > 0) {
      yPos += 30; // Pequeño espacio

      // Verificar si necesitamos nueva página
      if (yPos > 680) {
        doc.addPage();
        yPos = 50;
      }

      // Header discreto
      doc.fontSize(10)
        .font('Helvetica-Oblique')
        .fillColor('#666666')
        .text('productos sin_codigo_provedor', 150, yPos);

      doc.fillColor('#000000'); // Volver a negro
      yPos += 10; // Pequeño espacio después del header
    }

    // ✅ TERCERO: Productos sin código del proveedor (DATOS LOCALES/ALEGRA)
    productosSinCodigoProveedor.forEach((producto, index) => {
      yPos += 20;

      // Verificar si necesitamos nueva página
      if (yPos > 700) {
        doc.addPage();
        yPos = 50;

        // Repetir headers en nueva página
        doc.fontSize(12)
          .font('Helvetica-Bold')
          .text('Código', 50, yPos)
          .text('Descripción', 150, yPos)
          .text('Cantidad', 450, yPos);

        yPos += 20;
      }

      // Mostrar CÓDIGO Y NOMBRE LOCAL (Alegra) - sin código del proveedor
      doc.fontSize(11)
        .font('Helvetica')
        .text(producto.codigo_pdf || 'N/A', 50, yPos)  // Código local (Alegra)
        .text(producto.nombre_pdf || 'Sin descripción', 150, yPos, { width: 280 })  // Nombre local (Alegra)
        .text(producto.cantidad?.toString() || '0', 450, yPos);

      totalUnidades += parseInt(producto.cantidad) || 0;
    });

    // ✅ CUARTO: Productos sin mapeo (fallback)
    productosSinMapeo.forEach((producto, index) => {
      yPos += 20;

      // Verificar si necesitamos nueva página
      if (yPos > 700) {
        doc.addPage();
        yPos = 50;

        // Repetir headers en nueva página
        doc.fontSize(12)
          .font('Helvetica-Bold')
          .text('Código', 50, yPos)
          .text('Descripción', 150, yPos)
          .text('Cantidad', 450, yPos);

        yPos += 20;
      }

      // Mostrar datos originales
      doc.fontSize(11)
        .text(producto.codigo_pdf || 'N/A', 50, yPos)
        .text(producto.nombre_pdf || 'Sin descripción', 150, yPos, { width: 280 })
        .text(producto.cantidad?.toString() || '0', 450, yPos);

      totalUnidades += parseInt(producto.cantidad) || 0;
    });

    // Línea separadora final
    yPos += 30;
    doc.moveTo(50, yPos)
      .lineTo(550, yPos)
      .stroke();

    // Totales
    yPos += 20;
    doc.fontSize(12)
      .font('Helvetica-Bold')
      .text(`Total productos: ${productosEnriquecidos.length}`, 50, yPos)
      .text(`Total unidades: ${totalUnidades}`, 300, yPos);

    // Footer
    yPos += 50;
    doc.fontSize(10)
      .font('Helvetica')
      .text(`Generado el ${new Date().toLocaleString('es-CR')}`, 50, yPos);

    // Finalizar el documento
    doc.end();

    // Esperar a que se complete la generación
    const pdfBuffer = await pdfPromise;

    console.log(`✅ PDF generado para ${proveedor} con ${productosEnriquecidos.length} productos`);

    // Enviar el PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="orden-compra-${proveedor.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('❌ Error generando PDF:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error generando PDF de orden de compra con datos del proveedor desde Supabase'
    });
  }
});

router.get('/reportes/encargos-especiales', async (req, res) => {
  try {
    const { query } = require('../config/database');

    const result = await query(`
      SELECT 
        fa.numero_factura,
        fa.cliente_nombre,
        fa.fecha_emision,
        fa.observaciones_adicionales
      FROM facturas fa
      WHERE fa.observaciones_adicionales IS NOT NULL 
      AND fa.observaciones_adicionales != ''
      ORDER BY fa.fecha_emision DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('❌ Error obteniendo encargos especiales:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener categorías de productos de Alegra (item-categories)
router.get('/categorias', async (req, res) => {
  try {
    console.log('📦 Obteniendo categorías de productos de Alegra...');

    const categorias = await alegraService.getItemCategories();

    if (categorias && categorias.length > 0) {
      console.log(`✅ ${categorias.length} categorías de productos encontradas`);
      res.json({
        success: true,
        categorias: categorias
      });
    } else {
      // Si no hay categorías, devolver array vacío para que el usuario vea el problema
      console.warn('⚠️ No se encontraron categorías de productos en Alegra');
      res.json({
        success: true,
        categorias: [],
        message: 'No se encontraron categorías. Crea categorías en Alegra primero.'
      });
    }
  } catch (error) {
    console.error('❌ Error obteniendo categorías de productos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo categorías de productos. Verifica tu configuración de Alegra.',
      categorias: []
    });
  }
});

// Redirigir cantidad sugerida al endpoint de reportes
router.get('/reportes/cantidad-sugerida', (req, res, next) => {
  console.log('🔄 Redirigiendo cantidad sugerida a /reportes/cantidad-sugerida');
  console.log('📋 Query params:', req.query);

  // Redirigir internamente al endpoint de reportes
  req.url = '/cantidad-sugerida' + (req.url.includes('?') ? req.url.split('?')[1] ? '?' + req.url.split('?')[1] : '' : '');

  // Importar y usar el router de reportes
  const reportesRouter = require('./reportes');
  reportesRouter(req, res, next);
});

// ========================================
// ENDPOINTS PARA GESTIÓN DE PROVEEDORES MANUALES
// ========================================

// Obtener lista de proveedores de Alegra
router.get('/proveedores', async (req, res) => {
  console.log('⚡ ENDPOINT /proveedores LLAMADO - método:', req.method, '- query:', req.query);
  try {
    const { busqueda } = req.query;
    
    console.log(`🏭 Obteniendo proveedores de Alegra${busqueda ? ` (búsqueda: "${busqueda}")` : ''}`);
    console.log('🔍 alegraService.getProveedores existe?', typeof alegraService.getProveedores === 'function');
    
    const result = await alegraService.getProveedores(busqueda);
    console.log('✅ Resultado obtenido:', result.success, '- cantidad:', result.data?.length);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('❌ Error obteniendo proveedores:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo proveedores'
    });
  }
});

// Crear nuevo proveedor en Alegra
router.post('/proveedores', async (req, res) => {
  try {
    const proveedorData = req.body;
    
    console.log(`➕ Creando proveedor:`, proveedorData.name);
    
    const result = await alegraService.createProveedor(proveedorData);
    
    if (result.success) {
      res.status(201).json({
        success: true,
        data: result.data,
        message: 'Proveedor creado exitosamente'
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('❌ Error creando proveedor:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error creando proveedor'
    });
  }
});

// Asignar proveedor manualmente a un producto
router.post('/faltantes/asignar-proveedor-manual', async (req, res) => {
  try {
    const { 
      alegraReference,  // Código del producto en Alegra (ej: "10053")
      alegraItemId,     // ID del producto en Alegra
      alegraName,       // Nombre del producto en Alegra
      proveedorId       // ID del proveedor en Alegra
    } = req.body;

    console.log(`🔗 Asignando proveedor manualmente:`, {
      producto: alegraName,
      codigo: alegraReference,
      proveedorId
    });

    // 1. Obtener información del proveedor de Alegra
    const prisma = require('../lib/prisma');

    const proveedorResponse = await alegraService.api.get(`/contacts/${proveedorId}`);
    const proveedor = proveedorResponse.data;

    console.log(`✅ Proveedor encontrado:`, proveedor.name);

    // 2. Crear o actualizar el mapping manual
    const mapping = await prisma.supplierProductMapping.upsert({
      where: {
        supplierCedula_supplierCode: {
          supplierCedula: proveedor.identification || 'SIN_CEDULA',
          supplierCode: alegraReference
        }
      },
      update: {
        supplierName: proveedor.name,
        alegraItemId: alegraItemId,
        alegraReference: alegraReference,
        alegraName: alegraName,
        origen: 'manual', // ✅ MARCAR COMO MANUAL
        lastUsedDate: new Date(),
        timesUsed: {
          increment: 1
        }
      },
      create: {
        supplierName: proveedor.name,
        supplierCedula: proveedor.identification || 'SIN_CEDULA',
        supplierCode: alegraReference,
        supplierDesc: alegraName,
        alegraItemId: alegraItemId,
        alegraReference: alegraReference,
        alegraName: alegraName,
        confidence: 100,
        origen: 'manual', // ✅ MARCAR COMO MANUAL
        timesUsed: 1
      }
    });

    console.log(`✅ Relación manual creada: ${alegraName} → ${proveedor.name}`);

    res.json({
      success: true,
      data: mapping,
      message: `Producto relacionado con ${proveedor.name}`
    });

  } catch (error) {
    console.error('❌ Error asignando proveedor manual:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error asignando proveedor manualmente'
    });
  }
});

// Reasignar proveedor de un producto que ya tiene proveedor
router.post('/faltantes/reasignar-proveedor', async (req, res) => {
  const prisma = require('../lib/prisma');

  try {
    const {
      alegraReference,  // Código del producto en Alegra (ej: "10053")
      alegraItemId,     // ID del producto en Alegra
      alegraName,       // Nombre del producto en Alegra
      nuevoProveedorId  // ID del nuevo proveedor en Alegra
    } = req.body;

    // Validar datos requeridos
    if (!alegraReference || !alegraName || !nuevoProveedorId) {
      console.error('❌ Datos faltantes:', { alegraReference, alegraName, nuevoProveedorId });
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: alegraReference, alegraName, nuevoProveedorId'
      });
    }

    console.log(`🔄 Reasignando proveedor:`, {
      producto: alegraName,
      codigo: alegraReference,
      nuevoProveedorId,
      body: req.body
    });

    // 1. Buscar TODOS los mappings existentes del producto (por alegraReference)
    console.log('🔍 Buscando mappings existentes...');
    const mappingsExistentes = await prisma.supplierProductMapping.findMany({
      where: {
        alegraReference: alegraReference
      }
    });

    console.log(`📋 Mappings existentes encontrados: ${mappingsExistentes.length}`);
    if (mappingsExistentes.length > 0) {
      mappingsExistentes.forEach(m => {
        console.log(`   - ${m.supplierName} (${m.supplierCedula})`);
      });
    }

    // 2. Obtener información del nuevo proveedor de Alegra
    console.log('🔍 Obteniendo información del proveedor de Alegra...');
    let nuevoProveedor;
    try {
      const proveedorResponse = await alegraService.api.get(`/contacts/${nuevoProveedorId}`);
      nuevoProveedor = proveedorResponse.data;
      console.log(`✅ Nuevo proveedor encontrado: ${nuevoProveedor.name} (${nuevoProveedor.identification || 'SIN_CEDULA'})`);
    } catch (alegraError) {
      console.error('❌ Error obteniendo proveedor de Alegra:', alegraError.message);
      throw new Error(`No se pudo obtener el proveedor ${nuevoProveedorId} de Alegra: ${alegraError.message}`);
    }

    const nuevaCedula = nuevoProveedor.identification || 'SIN_CEDULA';

    // 3. Verificar si el producto ya está asignado a este proveedor
    const mappingExistenteConMismoProveedor = mappingsExistentes.find(
      m => m.supplierCedula === nuevaCedula
    );

    if (mappingExistenteConMismoProveedor) {
      console.log('⚠️ El producto ya está asignado a este proveedor. Solo actualizando metadatos...');

      // Actualizar solo los metadatos sin cambiar el mapping
      const mappingActualizado = await prisma.supplierProductMapping.update({
        where: {
          id: mappingExistenteConMismoProveedor.id
        },
        data: {
          supplierName: nuevoProveedor.name,
          alegraItemId: alegraItemId || alegraReference,
          alegraName: alegraName,
          lastUsedDate: new Date(),
          timesUsed: {
            increment: 1
          }
        }
      });

      return res.json({
        success: true,
        data: {
          proveedorAnterior: nuevoProveedor.name,
          nuevoProveedor: nuevoProveedor.name,
          mapping: mappingActualizado,
          mensaje: 'Producto ya estaba asignado a este proveedor (metadatos actualizados)'
        },
        message: `Producto ya estaba asignado a ${nuevoProveedor.name}`
      });
    }

    // 4. Eliminar mappings antiguos y crear el nuevo (sin transacción para evitar timeout)
    console.log('🔄 Reasignando producto sin transacción explícita...');
    let nuevoMapping;

    // 4.1. Eliminar TODOS los mappings antiguos del producto
    if (mappingsExistentes.length > 0) {
      console.log('🗑️ Eliminando mappings antiguos...');
      console.log(`   Buscando por alegraReference: "${alegraReference}"`);
      try {
        const deleteResult = await prisma.supplierProductMapping.deleteMany({
          where: {
            alegraReference: alegraReference
          }
        });
        console.log(`✅ ${deleteResult.count} mapping(s) eliminado(s) de la BD`);

        if (deleteResult.count === 0) {
          console.warn(`⚠️ ADVERTENCIA: Se encontraron ${mappingsExistentes.length} mappings pero deleteMany eliminó 0`);
        }
      } catch (deleteError) {
        console.error('❌ Error eliminando mappings:', deleteError.message);
        throw new Error(`Error eliminando mappings: ${deleteError.message}`);
      }
    }

    // 4.2. Crear nuevo mapping con el nuevo proveedor
    console.log('➕ Creando nuevo mapping...');
    console.log(`   Datos: ${nuevoProveedor.name} (${nuevaCedula}) → código: ${alegraReference}`);
    try {
      nuevoMapping = await prisma.supplierProductMapping.create({
        data: {
          supplierName: nuevoProveedor.name,
          supplierCedula: nuevaCedula,
          supplierCode: alegraReference,
          supplierDesc: alegraName,
          alegraItemId: alegraItemId || alegraReference,
          alegraReference: alegraReference,
          alegraName: alegraName,
          confidence: 100,
          origen: 'manual', // Marcar como manual (reasignación)
          timesUsed: mappingsExistentes.length > 0 ? mappingsExistentes[0].timesUsed : 1
        }
      });
      console.log(`✅ Nuevo mapping creado con ID: ${nuevoMapping.id}`);
      console.log(`   Verificando: ${nuevoMapping.supplierName} → ${nuevoMapping.supplierCode}`);
    } catch (createError) {
      console.error('❌ Error creando mapping:', createError.message);
      console.error('Código Prisma:', createError.code);
      throw new Error(`Error creando mapping: ${createError.message}`);
    }

    console.log(`✅ Producto reasignado: ${alegraName} → ${nuevoProveedor.name}`);

    res.json({
      success: true,
      data: {
        proveedorAnterior: mappingsExistentes.length > 0 ? mappingsExistentes[0].supplierName : 'Sin_Proveedor',
        nuevoProveedor: nuevoProveedor.name,
        mapping: nuevoMapping,
        mappingsEliminados: mappingsExistentes.length
      },
      message: `Producto reasignado a ${nuevoProveedor.name}`
    });

  } catch (error) {
    console.error('❌ Error reasignando proveedor:', error);
    console.error('Tipo de error:', error.constructor.name);
    console.error('Mensaje:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error reasignando proveedor',
      errorType: error.constructor.name
    });
  }
});

// ============================================
// 🧾 ENDPOINTS PARA FACTURACIÓN RÁPIDA
// ============================================

/**
 * GET /alegra/facturacion/items
 * Obtener todos los productos de Alegra para cache offline
 */
router.get('/facturacion/items', async (req, res) => {
  try {
    console.log('📦 Obteniendo todos los productos de Alegra para cache...');
    
    const allItems = [];
    let page = 1;
    const limit = 30; // Alegra API límite por página
    let hasMore = true;

    // Obtener todos los productos paginados
    while (hasMore) {
      const response = await alegraService.makeRequest('GET', '/items', {
        start: (page - 1) * limit,
        limit: limit
      });

      if (response && response.length > 0) {
        allItems.push(...response);
        page++;
        
        // Si recibimos menos items que el límite, ya no hay más
        if (response.length < limit) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    console.log(`✅ ${allItems.length} productos obtenidos de Alegra`);

    res.json({
      success: true,
      data: allItems,
      total: allItems.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo items de Alegra:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo productos de Alegra'
    });
  }
});

/**
 * GET /alegra/facturacion/contacts
 * Obtener todos los clientes de Alegra para cache offline
 */
router.get('/facturacion/contacts', async (req, res) => {
  try {
    console.log('👥 Obteniendo todos los contactos (clientes y proveedores) de Alegra para cache...');
    
    const allContacts = [];
    let page = 1;
    const limit = 30;
    let hasMore = true;

    while (hasMore) {
      const response = await alegraService.makeRequest('GET', '/contacts', {
        start: (page - 1) * limit,
        limit: limit
        // NO filtrar por type para obtener clientes Y proveedores
      });

      if (response && response.length > 0) {
        allContacts.push(...response);
        page++;
        
        if (response.length < limit) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    console.log(`✅ ${allContacts.length} contactos obtenidos de Alegra (clientes y proveedores)`);

    res.json({
      success: true,
      data: allContacts,
      total: allContacts.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo contacts de Alegra:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo clientes de Alegra'
    });
  }
});

/**
 * POST /alegra/facturacion/invoices
 * Crear factura en Alegra
 * 
 * Body esperado según documentación Alegra:
 * {
 *   date: "2024-01-15",
 *   dueDate: "2024-01-30",
 *   client: 123, // ID del cliente
 *   items: [
 *     { id: 456, quantity: 2, price: 1000, tax: [{ id: 1 }] }
 *   ],
 *   observations: "Notas adicionales",
 *   termsConditions: "Términos y condiciones",
 *   status: "open",
 *   stamp: { generateStamp: true } // Para factura electrónica
 * }
 */
router.post('/facturacion/invoices', async (req, res) => {
  try {
    const invoiceData = req.body;
    
    console.log('🧾 Creando factura en Alegra:', {
      cliente: invoiceData.client,
      items: invoiceData.items?.length,
      electronica: invoiceData.stamp?.generateStamp
    });

    // Crear factura en Alegra
    const response = await alegraService.makeRequest('POST', '/invoices', invoiceData);

    console.log('✅ Factura creada exitosamente:', response.id);

    res.json({
      success: true,
      data: response,
      message: 'Factura creada exitosamente'
    });

  } catch (error) {
    console.error('❌ Error creando factura en Alegra:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error creando factura en Alegra',
      details: error.response?.data
    });
  }
});

/**
 * GET /alegra/facturacion/invoices/:id/pdf
 * Obtener PDF de una factura
 */
router.get('/facturacion/invoices/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`📄 Obteniendo PDF de factura ${id}...`);

    // Obtener PDF desde Alegra
    const pdfResponse = await alegraService.makeRequest('GET', `/invoices/${id}/pdf`);

    // Si Alegra devuelve el PDF como buffer o URL
    if (pdfResponse.pdf) {
      res.json({
        success: true,
        pdfUrl: pdfResponse.pdf,
        invoiceId: id
      });
    } else {
      // Si devuelve datos binarios, enviarlos directamente
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=factura-${id}.pdf`);
      res.send(pdfResponse);
    }

  } catch (error) {
    console.error('❌ Error obteniendo PDF de factura:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo PDF de factura'
    });
  }
});

/**
 * GET /alegra/facturacion/taxes
 * Obtener impuestos configurados (IVA 13% en CR, etc.)
 */
router.get('/facturacion/taxes', async (req, res) => {
  try {
    console.log('💰 Obteniendo impuestos de Alegra...');
    
    const taxes = await alegraService.makeRequest('GET', '/taxes');

    res.json({
      success: true,
      data: taxes
    });

  } catch (error) {
    console.error('❌ Error obteniendo impuestos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo impuestos de Alegra'
    });
  }
});

/**
 * GET /alegra/facturacion/payment-methods
 * Obtener métodos de pago disponibles
 */
router.get('/facturacion/payment-methods', async (req, res) => {
  try {
    console.log('💳 Obteniendo métodos de pago de Alegra...');
    
    // Métodos de pago comunes en Costa Rica según Alegra
    const paymentMethods = [
      { id: 'cash', name: 'Efectivo', type: 'cash' },
      { id: 'credit-card', name: 'Tarjeta de Crédito', type: 'credit-card' },
      { id: 'debit-card', name: 'Tarjeta de Débito', type: 'debit-card' },
      { id: 'transfer', name: 'Transferencia Bancaria', type: 'transfer' },
      { id: 'check', name: 'Cheque', type: 'check' }
    ];

    res.json({
      success: true,
      data: paymentMethods
    });

  } catch (error) {
    console.error('❌ Error obteniendo métodos de pago:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo métodos de pago'
    });
  }
});

module.exports = router;