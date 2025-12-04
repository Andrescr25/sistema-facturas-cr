const express = require('express');
const router = express.Router();
// CORS headers for Alegra routes
router.use((req, res, next) => {
  const allowedOrigin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', allowedOrigin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', req.header('Access-Control-Request-Headers') || 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
const AlegraService = require('../services/alegraService');
const alegraService = new AlegraService(); // Instanciar la clase
const { obtenerRotacionProductos } = require('../services/rotacionProductosService');
const { registrarRotacionProducto } = require('../services/rotacionProductosAggregator');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MANUAL_MAPPING_CONFIDENCE = 999.99;

// Sistema de caché para facturas de bodega
const bodegaFacturasCache = {
  data: null,
  timestamp: null,
  TTL: 5 * 60 * 1000 // 5 minutos en milisegundos
};

const ensureReimpresionSchema = (() => {
  let ensured = false;
  return async (query) => {
    if (ensured) return;
    await query(`
      ALTER TABLE facturas_reimpresion 
      ADD COLUMN IF NOT EXISTS categoria VARCHAR(32) DEFAULT 'requiere_cambios'
    `);
    await query(`
      ALTER TABLE facturas_reimpresion 
      ADD COLUMN IF NOT EXISTS total_ajustes INTEGER DEFAULT 0
    `);
    ensured = true;
  };
})();

const determineReimpresionCategoria = (ajustesRaw = []) => {
  const ajustes = Array.isArray(ajustesRaw) ? ajustesRaw : [];
  if (ajustes.length === 0) return 'sin_cambios';

  const requiereCambios = ajustes.some((ajuste) => {
    if (!ajuste) return false;
    if (ajuste.requiere_actualizacion) return true;
    const estado = (ajuste.estado || '').toLowerCase();
    if (estado === 'parcial' || estado === 'no_llego') return true;
    const faltante = Number(ajuste.cantidad_faltante || 0);
    const entregada = Number(ajuste.cantidad_entregada || 0);
    return faltante > entregada;
  });

  return requiereCambios ? 'requiere_cambios' : 'sin_cambios';
};

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
    await ensureReimpresionSchema(query);
    
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

// Nuevo flujo: facturas para bodega (pendientes y listas) con sincronización automática
router.get('/bodega/facturas', async (req, res) => {
  const { query } = require('../config/database');

  try {
    const diasParam = parseInt(req.query.dias, 10);
    const limitParam = parseInt(req.query.limit, 10);
    const forceRefresh = req.query.force_refresh === 'true';

    const dias = Math.min(Math.max(diasParam || 30, 1), 365);
    const limit = Math.min(Math.max(limitParam || 40, 10), 120);

    // Verificar si hay datos en caché válidos
    const now = new Date();
    const cacheIsValid = !forceRefresh &&
                        bodegaFacturasCache.data &&
                        bodegaFacturasCache.timestamp &&
                        (now.getTime() - bodegaFacturasCache.timestamp) < bodegaFacturasCache.TTL;

    if (cacheIsValid) {
      console.log(`📦 Sirviendo facturas de bodega desde caché (${Math.round((now.getTime() - bodegaFacturasCache.timestamp) / 1000)}s desde última actualización)`);
      return res.json(bodegaFacturasCache.data);
    }

    const endDate = normalizeDateOnly(now.toISOString());
    const startDateObj = new Date(now);
    startDateObj.setDate(startDateObj.getDate() - dias);
    const startDate = startDateObj.toISOString().split('T')[0];

    console.log(`📦 Sincronizando facturas de Alegra para bodega (${startDate} → ${endDate}, límite ${limit})`);

    const invoicesRaw = [];
    let fetched = 0;
    let start = 0;

    while (fetched < limit) {
      const pageLimit = Math.min(30, limit - fetched);
      const response = await alegraService.api.get('/invoices', {
        params: {
          start_date: startDate,
          end_date: endDate,
          start,
          limit: pageLimit,
          metadata: true,
          order_field: 'date',
          order_direction: 'DESC'
        }
      });

      const pageData = response.data?.data || response.data || [];
      if (!Array.isArray(pageData) || pageData.length === 0) {
        break;
      }

      invoicesRaw.push(...pageData);
      fetched += pageData.length;
      if (pageData.length < pageLimit) {
        break;
      }
      start += pageLimit;
    }

    console.log(`✅ ${invoicesRaw.length} facturas sincronizadas desde Alegra`);

    const invoicesNormalized = invoicesRaw.map((invoice) => alegraService.transformInvoiceForFrontend(invoice));

    // Actualizar/insertar en BD local para mantener tracking de estados
    await Promise.all(invoicesNormalized.map((invoice) => upsertFacturaDesdeAlegra(invoice, query)));

    const numerosFactura = invoicesNormalized.map((inv) => inv.numero_factura);
    let estadosMap = new Map();
    let faltantesMap = new Map();

    if (numerosFactura.length > 0) {
      const estadosResult = await query(`
        SELECT numero_factura, estado_procesamiento, observaciones_adicionales, id, alegra_id
        FROM facturas
        WHERE numero_factura = ANY($1::text[])
      `, [numerosFactura]);

      estadosMap = new Map(estadosResult.rows.map((row) => [row.numero_factura, row]));

      const faltantesResult = await query(`
        SELECT 
          fa.alegra_id,
          SUM(CASE WHEN f.estado = 'pendiente' THEN 1 ELSE 0 END) AS faltantes_pendientes,
          SUM(CASE WHEN f.estado = 'pendiente' THEN f.cantidad_faltante ELSE 0 END) AS cantidad_pendiente
        FROM faltantes f
        JOIN facturas fa ON f.factura_id = fa.id
        WHERE fa.numero_factura = ANY($1::text[])
        GROUP BY fa.alegra_id
      `, [numerosFactura]);

      faltantesMap = new Map(faltantesResult.rows.map((row) => [row.alegra_id?.toString(), row]));
    }

    const enriched = invoicesNormalized.map((invoice) => {
      const estadoLocal = estadosMap.get(invoice.numero_factura);
      const faltanteInfo = faltantesMap.get(invoice.alegra_id?.toString());

      return {
        ...invoice,
        estado_procesamiento: estadoLocal?.estado_procesamiento || 'pendiente',
        observaciones_adicionales: estadoLocal?.observaciones_adicionales || null,
        factura_local_id: estadoLocal?.id || null,
        faltantes_pendientes: parseInt(faltanteInfo?.faltantes_pendientes || 0, 10),
        cantidad_faltante: parseInt(faltanteInfo?.cantidad_pendiente || 0, 10)
      };
    });

    const pendientes = enriched.filter((inv) => inv.estado_procesamiento !== 'procesado');
    const listas = enriched.filter((inv) => inv.estado_procesamiento === 'procesado');

    const response = {
      success: true,
      data: {
        pendientes,
        listas,
        resumen: {
          total: enriched.length,
          pendientes: pendientes.length,
          listas: listas.length
        }
      },
      metadata: {
        filtros: {
          dias,
          limit,
          startDate,
          endDate
        },
        lastSync: new Date().toISOString()
      }
    };

    // Guardar en caché
    bodegaFacturasCache.data = response;
    bodegaFacturasCache.timestamp = now.getTime();
    console.log(`💾 Facturas de bodega guardadas en caché (válido por ${bodegaFacturasCache.TTL / 60000} minutos)`);

    res.json(response);
  } catch (error) {
    console.error('❌ Error obteniendo facturas para bodega:', error);
    res.status(500).json({
      success: false,
      message: 'Error sincronizando facturas para bodega',
      error: error.message
    });
  }
});

router.post('/bodega/facturas/:alegraId/estado', async (req, res) => {
  const { query } = require('../config/database');

  try {
    const { alegraId } = req.params;
    const { estado = 'pendiente', observaciones = null } = req.body;

    if (!['pendiente', 'procesado'].includes(estado)) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido. Usa "pendiente" o "procesado".'
      });
    }

    let facturaLocal = await query('SELECT * FROM facturas WHERE alegra_id = $1 LIMIT 1', [parseInt(alegraId, 10)]);

    if (facturaLocal.rows.length === 0) {
      console.log(`ℹ️ Factura ${alegraId} no existe localmente. Recuperando desde Alegra...`);
      const detalle = await alegraService.getInvoiceById(alegraId);
      if (!detalle.success) {
        return res.status(404).json({
          success: false,
          message: 'Factura no encontrada en Alegra'
        });
      }
      const transformada = alegraService.transformInvoiceForFrontend(detalle.data);
      await upsertFacturaDesdeAlegra(transformada, query);
      facturaLocal = await query('SELECT * FROM facturas WHERE alegra_id = $1 LIMIT 1', [parseInt(alegraId, 10)]);
    }

    const updateResult = await query(`
      UPDATE facturas
      SET estado_procesamiento = $1,
          observaciones_adicionales = CASE 
            WHEN $2::text IS NULL THEN observaciones_adicionales 
            ELSE $2::text 
          END
      WHERE alegra_id = $3
      RETURNING *
    `, [estado, observaciones, parseInt(alegraId, 10)]);

    console.log(`✅ Factura ${alegraId} marcada como ${estado}`);

    // Invalidar caché para forzar actualización en próxima consulta
    bodegaFacturasCache.data = null;
    bodegaFacturasCache.timestamp = null;
    console.log('🔄 Caché de facturas de bodega invalidado');

    res.json({
      success: true,
      data: updateResult.rows[0]
    });
  } catch (error) {
    console.error('❌ Error actualizando estado de factura de bodega:', error);
    res.status(500).json({
      success: false,
      message: 'Error actualizando estado de la factura',
      error: error.message
    });
  }
});

// Obtener facturas pendientes de reimpresión
// IMPORTANTE: Esta ruta debe estar ANTES de /facturas/:id para evitar conflictos
router.get('/facturas/pendientes-reimpresion', async (req, res) => {
  try {
    console.log('📋 Obteniendo facturas pendientes de reimpresión...');

    const { query } = require('../config/database');
    await ensureReimpresionSchema(query);

    const result = await query(`
      SELECT
        fr.id as reimpresion_id,
        fr.ajustes_realizados,
        fr.estado as estado_reimpresion,
        fr.fecha_creacion,
        fr.categoria,
        fr.total_ajustes,
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

      const requiereActualizacion = ajustes?.some(aj => aj.requiere_actualizacion) || false;
      const tieneVariacionPrecio = ajustes?.some(aj => aj.diferencia_precio_absoluta || aj.diferencia_precio_relativa);

      return {
        ...factura,
        ajustes_realizados: ajustes,
        total_ajustes: ajustes?.length || 0,
        requiere_actualizacion: requiereActualizacion,
        tiene_variacion_precio: tieneVariacionPrecio,
        categoria: factura.categoria || (requiereActualizacion ? 'requiere_cambios' : 'sin_cambios')
      };
    });

    const sinCambios = facturasConAjustes.filter(f => f.categoria === 'sin_cambios');
    const requiereCambios = facturasConAjustes.filter(f => f.categoria !== 'sin_cambios');

    res.json({
      success: true,
      data: {
        sin_cambios: sinCambios,
        requiere_cambios: requiereCambios
      },
      total_pendientes: facturasConAjustes.length,
      resumen: {
        facturas_pendientes: facturasConAjustes.length,
        facturas_sin_cambios: sinCambios.length,
        facturas_con_cambios: requiereCambios.length
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
    await ensureReimpresionSchema(query);

    const result = await query(`
      SELECT
        fr.id as reimpresion_id,
        fr.ajustes_realizados,
        fr.estado as estado_reimpresion,
        fr.fecha_creacion,
        fr.fecha_procesamiento,
        fr.categoria,
        fr.total_ajustes,
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

      const requiereActualizacion = ajustes?.some(aj => aj.requiere_actualizacion) || false;
      const tieneVariacionPrecio = ajustes?.some(aj => aj.diferencia_precio_absoluta || aj.diferencia_precio_relativa);

      return {
        ...factura,
        ajustes_realizados: ajustes,
        total_ajustes: ajustes?.length || 0,
        dias_restantes_recuperacion: Math.ceil(7 - factura.dias_desde_procesamiento),
        puede_recuperar: factura.dias_desde_procesamiento <= 7,
        requiere_actualizacion: requiereActualizacion,
        tiene_variacion_precio: tieneVariacionPrecio,
        categoria: factura.categoria || (requiereActualizacion ? 'requiere_cambios' : 'sin_cambios')
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
            // Actualizar producto existente (incluyendo nombre si cambió en Alegra)
            await query(`
              UPDATE productos 
              SET nombre = $1,
                  precio_unitario = $2, 
                  descripcion = $3,
                  proveedor_id = CASE 
                    WHEN proveedor_id = 1 THEN $4 
                    ELSE proveedor_id 
                  END
              WHERE codigo = $5
            `, [
              producto.nombre, // 🔧 Actualizar nombre desde Alegra
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

function normalizeDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && value.includes('T')) {
    return value.split('T')[0];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().split('T')[0];
}

function calculateWeekNumberFromDate(dateString) {
  if (!dateString) return 1;
  const fecha = new Date(dateString);
  if (Number.isNaN(fecha.getTime())) return 1;
  const startOfYear = new Date(fecha.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((fecha - startOfYear) / (24 * 60 * 60 * 1000));
  return Math.max(1, Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7));
}

async function upsertFacturaDesdeAlegra(invoice, query) {
  if (!invoice) return null;

  const numeroFactura =
    invoice.numero_factura ||
    invoice.numberTemplate?.formattedNumber ||
    invoice.numero_completo ||
    invoice.alegra_id?.toString();

  if (!numeroFactura) {
    console.warn('⚠️ No se pudo determinar numero_factura para upsert:', invoice);
    return null;
  }

  const fechaEmision = normalizeDateOnly(invoice.fecha_emision || invoice.date);
  const semana = invoice.semana || calculateWeekNumberFromDate(fechaEmision);
  const mes = invoice.mes || (fechaEmision ? parseInt(fechaEmision.split('-')[1], 10) : null) || 1;
  const ano = invoice.ano || (fechaEmision ? parseInt(fechaEmision.split('-')[0], 10) : null) || new Date().getFullYear();
  const total = parseFloat(invoice.total || invoice.subtotal || 0);

  const values = [
    numeroFactura,
    parseInt(invoice.alegra_id || invoice.id, 10),
    invoice.cliente_nombre || invoice.client?.name || 'Cliente no especificado',
    invoice.cliente_email || invoice.client?.email || null,
    fechaEmision,
    semana,
    mes,
    ano,
    total
  ];

  const result = await query(`
    INSERT INTO facturas (
      numero_factura, alegra_id, cliente_nombre, cliente_email,
      fecha_emision, semana, mes, ano, total
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (numero_factura) DO UPDATE SET
      cliente_nombre = EXCLUDED.cliente_nombre,
      cliente_email = EXCLUDED.cliente_email,
      fecha_emision = EXCLUDED.fecha_emision,
      semana = EXCLUDED.semana,
      mes = EXCLUDED.mes,
      ano = EXCLUDED.ano,
      total = EXCLUDED.total
    RETURNING *
  `, values);

  return result.rows[0] || null;
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
      const itemsNormalizados = alegraService.processAlegraItems(result.data.items || []).map((item) => ({
          ...item,
          cantidad_faltante: 0,
        tipo_faltante: 'ninguno',
          observaciones: ''
      }));

      const facturaDetallada = {
        ...result.data,
        items: itemsNormalizados
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
      // Si no existe, crearla automáticamente desde Alegra
      console.log(`📝 Factura ${facturaId} no existe en BD local, creándola desde Alegra...`);

      const fechaEmision = facturaAlegra.data.date;
      const fecha = new Date(fechaEmision);

      // Calcular semana del año (ISO 8601)
      const startOfYear = new Date(fecha.getFullYear(), 0, 1);
      const dayOfYear = Math.floor((fecha - startOfYear) / (24 * 60 * 60 * 1000));
      const semanaDelAno = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);

      try {
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
          fechaEmision,
          semanaDelAno,
        parseInt(facturaAlegra.data.date?.split('-')[1]) || 1,
        parseInt(facturaAlegra.data.date?.split('-')[0]) || 2025,
        parseFloat(facturaAlegra.data.total || 0)
      ]);

      facturaLocalId = nuevaFactura.rows[0].id;
        console.log(`✅ Factura ${facturaId} creada en BD local con ID: ${facturaLocalId}`);

      } catch (insertError) {
        // Si falla por unique constraint, puede ser que otro proceso la creó simultáneamente
        if (insertError.code === '23505') {
          console.log(`⚠️ Factura ya existe (creada por otro proceso), reintentando búsqueda...`);
          facturaLocal = await query('SELECT id FROM facturas WHERE alegra_id = $1', [parseInt(facturaId)]);
          if (facturaLocal.rows.length > 0) {
            facturaLocalId = facturaLocal.rows[0].id;
    } else {
            throw insertError; // Si aún no existe, lanzar el error original
          }
        } else {
          throw insertError;
        }
      }
    } else {
      facturaLocalId = facturaLocal.rows[0].id;
    }

    // Asegurar que la columna alegra_id exista en productos
    await query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS alegra_id INTEGER`);

    const faltantesRegistrados = [];
    const costoCachePorAlegraId = new Map();
    const costoHistoricoPorProducto = new Map();

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

      // ═══════════════════════════════════════════════════════════════════════════════
      // 📚 CONCEPTOS CLAVE: alegra_id vs reference
      // ═══════════════════════════════════════════════════════════════════════════════
      // 
      // ALEGRA maneja 2 identificadores por producto:
      //
      // 1️⃣ alegra_id (item.id): ID numérico único generado por Alegra
      //    Ejemplo: 900, 885, 101, 868, 870
      //    - Es el identificador INTERNO de Alegra
      //    - Se usa en URLs: /items/900
      //    - Es ÚNICO y NO cambia nunca
      //
      // 2️⃣ reference (item.reference.reference): Código interno definido por el usuario
      //    Ejemplo: "SED", "PY2", "ESP", "0568", "305"
      //    - Es el código que TÚ defines para tu inventario
      //    - Es el que usas en tus mappings con proveedores
      //    - Puede ser diferente al alegra_id (ej: alegra_id=900, reference="SED")
      //
      // ⚠️ PROBLEMA: En las facturas, Alegra NO incluye el reference en los items
      //    Solo incluye el alegra_id (item.id)
      //
      // ✅ SOLUCIÓN: 
      //    - Buscar producto en BD local por alegra_id
      //    - Usar el "codigo" (reference) de la BD local para buscar mappings
      //    - Si es producto nuevo, consultar API de Alegra para obtener el reference real
      //
      // ═══════════════════════════════════════════════════════════════════════════════
      
      let itemReference = item_id; // Por defecto usar el item_id recibido
      let itemAlegraId = item_id;
      
      // ─────────────────────────────────────────────────────────────────────────────
      // PASO 1: Intentar obtener el reference desde la factura de Alegra
      // ─────────────────────────────────────────────────────────────────────────────
      // ⚠️ NOTA: En la mayoría de los casos, reference vendrá NULL en las facturas
      //    Esto es normal en Alegra. Por eso después consultamos la API.
      // ─────────────────────────────────────────────────────────────────────────────
      
      const itemEnFactura = facturaAlegra.data.items?.find(item => 
        item.id?.toString() === item_id || 
        item.reference === item_id ||
        item.reference?.reference === item_id
      );
      
      if (itemEnFactura) {
        // El reference puede venir como string o como objeto { type, reference }
        if (typeof itemEnFactura.reference === 'string') {
          itemReference = itemEnFactura.reference;
        } else if (itemEnFactura.reference?.reference) {
          itemReference = itemEnFactura.reference.reference;
        } else {
          // ⚠️ Reference viene NULL → usamos el ID temporalmente
          // Después consultaremos la API de Alegra si es necesario
          itemReference = itemEnFactura.id?.toString() || item_id;
        }
        itemAlegraId = itemEnFactura.id?.toString() || item_id;
        console.log(`   📋 Item encontrado en factura: ID=${itemAlegraId}, Reference="${itemReference}", Nombre="${itemEnFactura.name || itemEnFactura.description}"`);
      } else {
        console.warn(`   ⚠️ Item ${item_id} no encontrado en factura de Alegra. Se usará item_id como referencia e ID.`);
      }

      const allegraIdEntero = itemAlegraId && /^\d+$/.test(itemAlegraId) ? parseInt(itemAlegraId, 10) : null;

      let productoLocal;

      // ─────────────────────────────────────────────────────────────────────────────
      // PASO 2: Buscar el producto en la base de datos LOCAL
      // ─────────────────────────────────────────────────────────────────────────────
      // ESTRATEGIA DE BÚSQUEDA:
      //
      // 🥇 OPCIÓN 1 (MEJOR): Buscar por alegra_id
      //    - Es el método más confiable
      //    - El alegra_id es único y nunca cambia
      //    - Ejemplo: alegra_id=900 → Encuentra "SERVILLETA" con codigo="SED"
      //
      // 🥈 OPCIÓN 2 (FALLBACK): Buscar por codigo (reference)
      //    - Útil si el producto no tiene alegra_id asignado
      //    - Menos confiable porque el reference puede cambiar
      //
      // 🥉 OPCIÓN 3 (ÚLTIMO RECURSO): Buscar por nombre
      //    - Solo si no hay código
      // ─────────────────────────────────────────────────────────────────────────────
      
      // ✅ OPCIÓN 1: Buscar por alegra_id (ID único en Alegra)
      if (allegraIdEntero !== null) {
        productoLocal = await query(`
          SELECT id, codigo, nombre, alegra_id FROM productos 
          WHERE alegra_id = $1
          LIMIT 1
        `, [allegraIdEntero]);

        if (productoLocal.rows.length > 0) {
          const productoEncontrado = productoLocal.rows[0];
          console.log(`✅ Producto encontrado por alegra_id (${allegraIdEntero}): ID=${productoEncontrado.id}, código="${productoEncontrado.codigo}", nombre="${productoEncontrado.nombre}"`);
        }
      }

      const buscarPorCodigo = async (codigo, motivo) => {
        if (!codigo) {
          return { rows: [] };
        }
        console.log(`🔍 Buscando producto por código "${codigo}" (${motivo})...`);
        return await query(`
          SELECT id, codigo, nombre, alegra_id 
          FROM productos 
        WHERE codigo = $1 
        LIMIT 1
        `, [codigo]);
      };

      const buscarPorNombreExacto = async () => {
        console.log(`⚠️ No encontrado por código, buscando por nombre exacto...`);
        return await query(`
          SELECT id, codigo, nombre, alegra_id 
          FROM productos 
          WHERE UPPER(nombre) = UPPER($1)
          LIMIT 1
        `, [nombre_producto]);
      };

      // SEGUNDA OPCIÓN: Buscar por reference (productos.codigo) como fallback
      if (!productoLocal || productoLocal.rows.length === 0) {
        if (itemReference) {
          productoLocal = await buscarPorCodigo(itemReference, 'reference de Alegra');
        }
      }

      // TERCERA OPCIÓN: Buscar por codigo = allegra_id SOLO si no tenemos reference o coincide exactamente
      if ((!productoLocal || productoLocal.rows.length === 0) && itemAlegraId) {
        const referenceIgualAId = itemReference && itemReference.toString() === itemAlegraId;
        if (!itemReference || referenceIgualAId) {
          productoLocal = await buscarPorCodigo(itemAlegraId, 'alegra_id como código');
        }
      }

      // CUARTA OPCIÓN: Buscar por nombre
      if (!productoLocal || productoLocal.rows.length === 0) {
        productoLocal = await buscarPorNombreExacto();
      }

      // ✅ VALIDACIÓN: Verificar que el producto encontrado coincide con el nombre esperado
      if (productoLocal.rows.length > 0) {
        const productoEncontrado = productoLocal.rows[0];
        const nombreCoincide = productoEncontrado.nombre.toLowerCase().includes(nombre_producto.toLowerCase()) ||
                              nombre_producto.toLowerCase().includes(productoEncontrado.nombre.toLowerCase());
        
        if (!nombreCoincide) {
          console.warn(`⚠️ ADVERTENCIA: Producto encontrado pero el nombre NO coincide. Se descartará esta coincidencia para evitar mapeos erróneos.`);
          console.warn(`   Esperado: "${nombre_producto}"`);
          console.warn(`   Encontrado: "${productoEncontrado.nombre}" (reference: ${productoEncontrado.codigo}, alegra_id: ${productoEncontrado.alegra_id || 'N/A'})`);
          productoLocal = { rows: [] };
        } else {
          console.log(`✅ Producto encontrado: ID=${productoEncontrado.id}, código="${productoEncontrado.codigo}", nombre="${productoEncontrado.nombre}"`);
        }
      }

      let productoId;
      let codigoReferenceParaMapping; // ✅ CRÍTICO: Esta variable guarda el reference REAL para buscar mappings
      
      if (productoLocal.rows.length === 0) {
        // ─────────────────────────────────────────────────────────────────────────────
        // CASO A: PRODUCTO NUEVO (no existe en BD local)
        // ─────────────────────────────────────────────────────────────────────────────
        console.log(`➕ Producto nuevo detectado: "${nombre_producto}"`);
        
        // ═════════════════════════════════════════════════════════════════════════════
        // 🔍 PASO CRÍTICO: Obtener el reference REAL de Alegra
        // ═════════════════════════════════════════════════════════════════════════════
        //
        // PROBLEMA: Las facturas NO incluyen el reference en los items
        //           Solo traen el alegra_id (item.id)
        //
        // SOLUCIÓN: Consultar la API de Alegra: GET /items/{id}
        //           Esto nos da el reference real del producto
        //
        // EJEMPLO:
        //   item_id = 900 (recibido del frontend)
        //   GET /items/900 → { id: 900, reference: { reference: "SED" } }
        //   reference REAL = "SED" (NO "900")
        //
        // ¿POR QUÉ ES IMPORTANTE?
        //   Los mappings en supplier_product_mapping usan el reference ("SED")
        //   Si guardamos el ID ("900"), no encontrará el mapping del proveedor
        //
        // ═════════════════════════════════════════════════════════════════════════════
        
        let referenceReal = itemReference;
        if (allegraIdEntero && itemReference === itemAlegraId) {
          console.log(`🔍 Reference no disponible en factura, consultando API de Alegra para producto ${allegraIdEntero}...`);
          try {
            const AlegraService = require('../services/alegraService');
            const alegraServiceInstance = new AlegraService();
            const productoAlegra = await alegraServiceInstance.getItem(allegraIdEntero);
            
            if (productoAlegra && productoAlegra.reference) {
              // El reference puede venir como string o como objeto { type, reference }
              if (typeof productoAlegra.reference === 'string') {
                referenceReal = productoAlegra.reference;
              } else if (productoAlegra.reference?.reference) {
                referenceReal = productoAlegra.reference.reference;
              }
              console.log(`✅ Reference obtenido de Alegra: "${referenceReal}"`);
            }
          } catch (error) {
            console.warn(`⚠️ No se pudo obtener reference de Alegra para producto ${allegraIdEntero}:`, error.message);
            console.warn(`   Se usará el ID (${itemAlegraId}) como fallback`);
          }
        }
        
        console.log(`➕ Creando producto: "${nombre_producto}" con reference "${referenceReal}" y alegra_id="${itemAlegraId}"`);

        // Crear producto con la referencia e ID de Alegra correctos
        const alegraIdParaInsert = allegraIdEntero !== null ? allegraIdEntero : null;
        const nuevoProducto = await query(`
          INSERT INTO productos (alegra_id, nombre, codigo, descripcion, proveedor_id, precio_unitario)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, codigo
        `, [
          alegraIdParaInsert,
          nombre_producto || `Producto ${referenceReal}`,
          referenceReal, // ✅ CRÍTICO: Guardar reference REAL (ej: "SED"), no el ID (ej: "900")
          `Producto creado desde registro de faltantes - ID Alegra: ${itemAlegraId}`,
          null,
          0
        ]);
        productoId = nuevoProducto.rows[0].id;
        codigoReferenceParaMapping = nuevoProducto.rows[0].codigo;

        console.log(`✅ Producto creado con ID: ${productoId}, código: "${codigoReferenceParaMapping}" (reference real de Alegra)`);
      } else {
        // ─────────────────────────────────────────────────────────────────────────────
        // CASO B: PRODUCTO EXISTENTE (ya está en BD local)
        // ─────────────────────────────────────────────────────────────────────────────
        productoId = productoLocal.rows[0].id;
        const productoEncontrado = productoLocal.rows[0];
        
        codigoReferenceParaMapping = productoEncontrado.codigo;
        
        // Si el producto ya tenía alegra_id pero el reference real cambió, sincronizarlo
        const referencePareceId = itemReference && itemAlegraId && itemReference.toString() === itemAlegraId.toString();
        if (itemReference && !referencePareceId && productoEncontrado.codigo !== itemReference) {
          try {
            await query(`
              UPDATE productos
              SET codigo = $1
              WHERE id = $2
            `, [itemReference, productoId]);
            codigoReferenceParaMapping = itemReference;
            productoEncontrado.codigo = itemReference;
            console.log(`🔄 Código actualizado para producto ${productoEncontrado.nombre}: ${productoEncontrado.codigo} → ${itemReference}`);
          } catch (actualizarError) {
            console.warn(`⚠️ No se pudo sincronizar código del producto ${productoId}:`, actualizarError.message);
          }
        }
        
        console.log(`✅ Producto encontrado: ID=${productoId}, código="${productoEncontrado.codigo}", nombre="${productoEncontrado.nombre}", alegra_id="${productoEncontrado.alegra_id || 'NULL'}"`);

        // Actualizar alegra_id si está NULL (solo la primera vez)
        if (allegraIdEntero !== null && !productoEncontrado.alegra_id) {
          console.log(`🔄 Asignando alegra_id=${allegraIdEntero} al producto (antes era NULL)`);
          await query(`
            UPDATE productos 
            SET alegra_id = $1
            WHERE id = $2
          `, [allegraIdEntero, productoId]);
        }
        
        // ⚠️ IMPORTANTE: NUNCA actualizar el código (reference)
        //    El código es único por producto y NO debe cambiar
        //    Puede ser diferente al alegra_id
        //    Ejemplo: ENVASE PLASTICO tiene alegra_id=705 pero reference="2016"
      }

      const productoInfoResult = await query(`
        SELECT 
          p.id,
          p.codigo,
          p.nombre,
          p.precio_unitario,
          p.alegra_id,
          p.proveedor_id,
          pr.nombre AS proveedor_nombre
        FROM productos p
        LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
        WHERE p.id = $1
      `, [productoId]);
      const productoInfo = productoInfoResult.rows[0] || {
        id: productoId,
        codigo: codigoReferenceParaMapping,
        nombre: nombre_producto,
        precio_unitario: 0,
        alegra_id: allegraIdEntero,
        proveedor_id: null,
        proveedor_nombre: null
      };


      // Registrar el faltante
      // 🔧 CORREGIDO: Asegurar que el estado sea 'pendiente' explícitamente
      const nuevoFaltante = await query(`
        INSERT INTO faltantes (
          factura_id, producto_id, cantidad_faltante, 
          tipo_faltante, observaciones, registrado_por, estado
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pendiente')
        RETURNING *
      `, [
        facturaLocalId,
        productoId,
        cantidad_faltante,
        tipo_faltante,
        observaciones || null,
        registrado_por
      ]);

      const faltanteId = nuevoFaltante.rows[0].id;

      // ─────────────────────────────────────────────────────────────────────────────
      // PASO 3: Asignar proveedor automáticamente
      // ─────────────────────────────────────────────────────────────────────────────
      // Esta función busca en supplier_product_mapping usando:
      //   - alegra_item_id (ej: 900)  O
      //   - alegra_reference (ej: "SED")
      //
      // Y encuentra el proveedor con el precio más bajo
      // ─────────────────────────────────────────────────────────────────────────────
      const { asignarProveedorAutomatico } = require('../services/proveedorAsignacionService');
      const asignacionResult = await asignarProveedorAutomatico(
        faltanteId,
        productoId,
        allegraIdEntero,           // alegra_id: 900
        codigoReferenceParaMapping // reference: "SED" ✅ CRÍTICO: el código REAL, NO el ID
      );

      faltantesRegistrados.push({
        ...nuevoFaltante.rows[0],
        nombre_producto: nombre_producto,
        proveedor_asignado: asignacionResult.success ? asignacionResult.proveedor : 'Sin_Proveedor',
        precio_asignado: asignacionResult.precio || null
      });

      let costoUnitario = (() => {
        const candidates = [
          asignacionResult?.precio,
          productoInfo?.costo_promedio,
          productoInfo?.precio_costo,
          productoInfo?.precio_unitario
        ];

        for (const value of candidates) {
          const parsed = Number(value);
          if (!Number.isNaN(parsed) && parsed > 0) {
            return parsed;
          }
        }
        return 0;
      })();

      const alegraIdParaCosto =
        allegraIdEntero ||
        (productoInfo?.alegra_id && /^\d+$/.test(productoInfo.alegra_id.toString())
          ? parseInt(productoInfo.alegra_id, 10)
          : null);

      if ((costoUnitario === 0 || Number.isNaN(costoUnitario)) && alegraIdParaCosto) {
        const cacheKey = alegraIdParaCosto.toString();
        if (!costoCachePorAlegraId.has(cacheKey)) {
          try {
            const cachedProduct = await prisma.alegraProduct.findUnique({
              where: { alegraId: cacheKey }
            });
            const costFromCache =
              cachedProduct && Number(cachedProduct.cost) > 0 ? Number(cachedProduct.cost) : null;
            costoCachePorAlegraId.set(cacheKey, costFromCache);
          } catch (cacheError) {
            console.warn(
              `⚠️ No se pudo obtener costo de cache Alegra (${cacheKey}):`,
              cacheError.message
            );
            costoCachePorAlegraId.set(cacheKey, null);
          }
        }
        const cachedCost = costoCachePorAlegraId.get(cacheKey);
        if (cachedCost && cachedCost > 0) {
          costoUnitario = cachedCost;
        }
      }

      if (costoUnitario === 0 || Number.isNaN(costoUnitario)) {
        if (!costoHistoricoPorProducto.has(productoId)) {
          let costoHistorico = null;
          try {
            const historialCosto = await query(
              `
              SELECT 
                SUM(costo_total) AS costo_total,
                SUM(cantidad_faltante_total) AS cantidad_total
              FROM rotacion_productos
              WHERE producto_id = $1
            `,
              [productoId]
            );
            if (historialCosto.rows.length > 0) {
              const total = Number(historialCosto.rows[0].costo_total) || 0;
              const qty = Number(historialCosto.rows[0].cantidad_total) || 0;
              if (total > 0 && qty > 0) {
                costoHistorico = total / qty;
              }
            }
          } catch (histError) {
            console.warn(
              `⚠️ No se pudo leer historial de rotación para producto ${productoId}:`,
              histError.message
            );
          }

          if (!costoHistorico || costoHistorico <= 0) {
            try {
              const ultimoPrecio = await query(
                `
                SELECT precio_asignado
                FROM faltantes
                WHERE producto_id = $1 AND precio_asignado IS NOT NULL
                ORDER BY updated_at DESC NULLS LAST, created_at DESC
                LIMIT 1
              `,
                [productoId]
              );
              if (ultimoPrecio.rows.length > 0) {
                const precio = Number(ultimoPrecio.rows[0].precio_asignado);
                if (!Number.isNaN(precio) && precio > 0) {
                  costoHistorico = precio;
                }
              }
            } catch (precioError) {
              console.warn(
                `⚠️ No se pudo obtener precio histórico para producto ${productoId}:`,
                precioError.message
              );
            }
          }

          costoHistoricoPorProducto.set(
            productoId,
            costoHistorico && costoHistorico > 0 ? costoHistorico : null
          );
        }

        const costoFallback = costoHistoricoPorProducto.get(productoId);
        if (costoFallback && costoFallback > 0) {
          costoUnitario = costoFallback;
        }
      }

      if (costoUnitario && !Number.isNaN(costoUnitario)) {
        costoUnitario = Math.round(Number(costoUnitario) * 100) / 100;
      } else {
        costoUnitario = 0;
      }

      const precioVentaUnitario = (() => {
        if (!itemEnFactura) return null;
        const candidates = [
          itemEnFactura.price,
          itemEnFactura.unit_price,
          itemEnFactura.unitPrice,
          itemEnFactura.precioUnitario
        ];
        for (const value of candidates) {
          const num = Number(value);
          if (!Number.isNaN(num) && value !== undefined && value !== null) {
            return num;
          }
        }
        const total = Number(itemEnFactura.total);
        const qty = Number(itemEnFactura.quantity);
        if (!Number.isNaN(total) && !Number.isNaN(qty) && qty > 0) {
          return total / qty;
        }
        return null;
      })();

      try {
        await registrarRotacionProducto({
          productoId,
          productoCodigo: productoInfo?.codigo || codigoReferenceParaMapping,
          productoNombre: productoInfo?.nombre || nombre_producto,
          proveedorId: productoInfo?.proveedor_id,
          proveedorNombre: productoInfo?.proveedor_nombre,
          fechaReferencia: facturaAlegra.data.date,
          cantidadFaltante: cantidad_faltante,
          costoUnitario,
          precioVentaUnitario: precioVentaUnitario !== null ? precioVentaUnitario : costoUnitario || 0
        });
      } catch (rotacionError) {
        console.error('⚠️ Error registrando rotación de producto:', rotacionError.message);
      }
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

    // Invalidar caché para forzar actualización en próxima consulta
    bodegaFacturasCache.data = null;
    bodegaFacturasCache.timestamp = null;
    console.log('🔄 Caché de facturas de bodega invalidado');

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

    // Asegurar que la columna alegra_id exista en productos
    await query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS alegra_id INTEGER`);

    // PASO 1: Obtener faltantes de la BD local CON ASIGNACIÓN GUARDADA
    const faltantesResult = await query(`
      SELECT
        p.codigo as producto_codigo,
        p.alegra_id as producto_alegra_id,
        p.nombre as producto_nombre,
        SUM(f.cantidad_faltante) as total_faltante,
        COUNT(f.id) as facturas_afectadas,
        STRING_AGG(DISTINCT fa.cliente_nombre, ', ') as clientes_afectados,
        -- 🔧 NUEVO: Usar asignación guardada (tomar la más reciente si hay múltiples)
        MAX(f.proveedor_asignado) as proveedor_asignado,
        MAX(f.proveedor_cedula) as proveedor_cedula,
        MAX(f.precio_asignado) as precio_asignado,
        MAX(f.asignacion_tipo) as asignacion_tipo,
        (MAX(f.mapping_id::text) FILTER (WHERE f.mapping_id IS NOT NULL))::uuid as mapping_id
      FROM faltantes f
      JOIN productos p ON f.producto_id = p.id
      JOIN facturas fa ON f.factura_id = fa.id
      WHERE f.estado = 'pendiente'
      GROUP BY p.codigo, p.alegra_id, p.nombre
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

    // PASO 2: Asignar automáticamente productos sin asignación (faltantes antiguos)
    const proveedoresMap = new Map();
    
    console.log(`⚡ Usando asignaciones guardadas (RÁPIDO)`);
    
    // Buscar productos SIN asignación guardada
    const productosSinAsignacion = faltantesResult.rows.filter(f => !f.proveedor_asignado);
    if (productosSinAsignacion.length > 0) {
      console.log(`⚠️ ${productosSinAsignacion.length} productos sin asignación guardada`);
      console.log(`🤖 Asignando automáticamente (solo esta vez)...`);
      
      const { asignarProveedorAutomatico } = require('../services/proveedorAsignacionService');
      
      // Asignar cada producto sin asignación
      for (const producto of productosSinAsignacion) {
        // Buscar todos los faltantes pendientes de este producto
        const faltantesDelProducto = await query(`
          SELECT f.id, f.producto_id
          FROM faltantes f
          JOIN productos p ON f.producto_id = p.id
          WHERE p.codigo = $1
            AND f.estado = 'pendiente'
            AND f.proveedor_asignado IS NULL
        `, [producto.producto_codigo]);
        
        // Asignar cada faltante
        for (const faltante of faltantesDelProducto.rows) {
          await asignarProveedorAutomatico(
            faltante.id,
            faltante.producto_id,
            producto.producto_alegra_id,
            producto.producto_codigo
          );
        }
      }
      
      console.log(`✅ ${productosSinAsignacion.length} productos asignados automáticamente`);
      console.log(`🔄 Recargando faltantes con asignaciones actualizadas...`);
      
      // Recargar faltantes ahora con asignaciones
      const faltantesActualizados = await query(`
        SELECT
          p.codigo as producto_codigo,
          p.alegra_id as producto_alegra_id,
          p.nombre as producto_nombre,
          SUM(f.cantidad_faltante) as total_faltante,
          COUNT(f.id) as facturas_afectadas,
          STRING_AGG(DISTINCT fa.cliente_nombre, ', ') as clientes_afectados,
          MAX(f.proveedor_asignado) as proveedor_asignado,
          MAX(f.proveedor_cedula) as proveedor_cedula,
          MAX(f.precio_asignado) as precio_asignado,
          MAX(f.asignacion_tipo) as asignacion_tipo,
          (MAX(f.mapping_id::text) FILTER (WHERE f.mapping_id IS NOT NULL))::uuid as mapping_id
        FROM faltantes f
        JOIN productos p ON f.producto_id = p.id
        JOIN facturas fa ON f.factura_id = fa.id
        WHERE f.estado = 'pendiente'
        GROUP BY p.codigo, p.alegra_id, p.nombre
        ORDER BY total_faltante DESC
      `);
      
      // Reemplazar con datos actualizados
      faltantesResult.rows = faltantesActualizados.rows;
    }

    // PASO 3: Obtener mapping info solo para productos con asignación (mucho más rápido)
    const mappingIds = faltantesResult.rows
      .filter(f => f.mapping_id)
      .map(f => f.mapping_id);
    
    let mappingsInfo = new Map();
    if (mappingIds.length > 0) {
      const mappingsResult = await query(`
        SELECT
          id,
          supplier_code as "supplierCode",
          supplier_desc as "supplierDesc",
          alegra_name as "alegraName",
          confidence,
          factor_conversion as "factorConversion"
        FROM supplier_product_mapping
        WHERE id = ANY($1::uuid[])
      `, [mappingIds]);
      
      mappingsResult.rows.forEach(m => {
        mappingsInfo.set(m.id, m);
      });
    }

    // PASO 4: Agrupar productos por proveedor (SUPER RÁPIDO)
    for (const faltante of faltantesResult.rows) {
      // Usar asignación guardada directamente
      const proveedorNombre = (faltante.proveedor_asignado || 'Sin_Proveedor').trim();
      const proveedorCedulaRaw = faltante.proveedor_cedula && faltante.proveedor_cedula !== 'SIN_PROVEEDOR'
        ? faltante.proveedor_cedula.trim()
        : null;
      const proveedorCedula = proveedorCedulaRaw || 'SIN_PROVEEDOR';
      const precioAsignado = faltante.precio_asignado ? parseFloat(faltante.precio_asignado) : null;
      const asignacionTipo = faltante.asignacion_tipo || 'automatica';
      const proveedorKey = proveedorCedulaRaw || proveedorNombre.toUpperCase();
      
      // Obtener info del mapping si existe
      const mappingInfo = faltante.mapping_id ? mappingsInfo.get(faltante.mapping_id) : null;

      // Crear o obtener proveedor
      if (!proveedoresMap.has(proveedorKey)) {
        proveedoresMap.set(proveedorKey, {
          id: proveedorKey,
          cedula: proveedorCedulaRaw,
          nombre: proveedorNombre,
          contacto: proveedorCedula,
          productos_faltantes: [],
          total_productos: 0,
          total_cantidad: 0,
          aliases: proveedorCedulaRaw ? [proveedorNombre] : []
        });
      }

      const proveedor = proveedoresMap.get(proveedorKey);

      // Mantener registro de alias y preferir el nombre más reciente proveniente de Alegra
      if (proveedorNombre && proveedor.nombre !== proveedorNombre) {
        if (!proveedor.aliases.includes(proveedorNombre)) {
          proveedor.aliases.push(proveedorNombre);
        }
        proveedor.nombre = proveedorNombre;
      }

      // Agregar producto faltante con datos guardados
      proveedor.productos_faltantes.push({
        nombre: mappingInfo?.alegraName || faltante.producto_nombre,
        nombre_proveedor: mappingInfo?.supplierDesc || null,
        codigo: faltante.producto_codigo,
        alegra_item_id: faltante.producto_alegra_id || faltante.producto_codigo,
        codigo_proveedor: mappingInfo?.supplierCode || null,
        mapping_id: faltante.mapping_id || null,
        cantidad_faltante: parseInt(faltante.total_faltante),
        facturas_afectadas: parseInt(faltante.facturas_afectadas),
        tipo_faltante: faltante.tipo_faltante,
        clientes_afectados: faltante.clientes_afectados,
        confianza_mapping: mappingInfo?.confidence || 0,
        factor_conversion: mappingInfo?.factorConversion || 1,
        precio_asignado: precioAsignado,
        asignacion_automatica: asignacionTipo === 'automatica'
      });

      proveedor.total_productos++;
      proveedor.total_cantidad += parseInt(faltante.total_faltante);
    }

    const proveedoresArray = Array.from(proveedoresMap.values()).map(proveedor => ({
      ...proveedor,
      aliases: proveedor.aliases && proveedor.aliases.length > 0 ? proveedor.aliases : undefined
    }));

    // PASO 5: Estadísticas
    const totalProductos = faltantesResult.rows.length;
    const productosConAsignacion = faltantesResult.rows.filter(f => f.proveedor_asignado && f.proveedor_asignado !== 'Sin_Proveedor').length;
    const productosAsignacionManual = faltantesResult.rows.filter(f => f.asignacion_tipo === 'manual').length;
    const productosAsignacionAutomatica = faltantesResult.rows.filter(f => f.asignacion_tipo === 'automatica').length;

    console.log(`✅ Reporte generado RÁPIDO: ${proveedoresArray.length} proveedores, ${productosConAsignacion}/${totalProductos} productos asignados`);
    console.log(`   📊 ${productosAsignacionAutomatica} automáticas, ${productosAsignacionManual} manuales`);

    res.json({
      success: true,
      data: proveedoresArray,
      total_proveedores: proveedoresArray.length,
      resumen: {
        total_productos_faltantes: totalProductos,
        total_cantidad_faltante: proveedoresArray.reduce((sum, p) => sum + p.total_cantidad, 0),
        productos_con_asignacion: productosConAsignacion,
        productos_sin_asignacion: totalProductos - productosConAsignacion,
        asignaciones_manuales: productosAsignacionManual,
        asignaciones_automaticas: productosAsignacionAutomatica,
        porcentaje_asignado: totalProductos > 0 ? Math.round((productosConAsignacion / totalProductos) * 100) : 0
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

router.get('/reportes/rotacion/productos', async (req, res) => {
  try {
    const { semanas, limite } = req.query;
    const resultado = await obtenerRotacionProductos({ semanas, limite });

    res.json({
      success: true,
      data: resultado.productos,
      resumen: resultado.resumen,
      insights: resultado.insights,
      filtros: resultado.filtros,
    });
  } catch (error) {
    console.error('❌ Error generando rotación de productos:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando rotación de productos',
      error: error.message,
    });
  }
});

// Reporte de faltantes por cliente - MODIFICADO
router.get('/reportes/faltantes/cliente', async (req, res) => {
  try {
    const { query } = require('../config/database');

    const result = await query(`
      SELECT 
        f.id AS faltante_id,
        fa.cliente_nombre,
        fa.cliente_email,
        fa.numero_factura,
        fa.fecha_emision,
        fa.alegra_id as factura_alegra_id,
        fa.estado_procesamiento,
        fp.id as factura_pendiente_id,
        fp.motivo as factura_pendiente_motivo,
        fp.created_at as factura_pendiente_desde,
        p.nombre as producto_nombre,
        p.codigo as producto_codigo,
        COALESCE(pr.nombre, 'Sin proveedor') as proveedor_nombre,
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
      LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
      JOIN facturas fa ON f.factura_id = fa.id
      LEFT JOIN facturas_pendientes fp ON fa.id = fp.factura_id
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
        es_pendiente_manual: false,
        pendiente_desde: null,
        pendiente_motivo: null,
          productos_faltantes: []
        });
      }

      const factura = cliente.facturas_con_faltantes.get(facturaKey);
      factura.productos_faltantes.push({
        faltante_id: row.faltante_id,
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

      const esPendiente = Boolean(row.factura_pendiente_id);
      factura.es_pendiente_manual = factura.es_pendiente_manual || esPendiente;
      if (esPendiente) {
        factura.pendiente_desde = row.factura_pendiente_desde;
        factura.pendiente_motivo = row.factura_pendiente_motivo;
      }

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
    await ensureReimpresionSchema(query);

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

      const categoria = determineReimpresionCategoria(factura.ajustes);
      const totalAjustes = Array.isArray(factura.ajustes) ? factura.ajustes.length : 0;

      if (existeReimpresion.rows.length > 0) {
        // Actualizar existente
        await query(`
          UPDATE facturas_reimpresion 
          SET ajustes_realizados = $2,
              estado = 'pendiente',
              categoria = $3,
              total_ajustes = $4,
              fecha_creacion = CURRENT_TIMESTAMP,
              fecha_procesamiento = NULL
          FROM facturas fa
          WHERE facturas_reimpresion.factura_id = fa.id
          AND fa.alegra_id = $1
        `, [factura.alegra_id, JSON.stringify(factura.ajustes), categoria, totalAjustes]);
      } else {
        // Insertar nuevo
        await query(`
          INSERT INTO facturas_reimpresion (factura_id, ajustes_realizados, estado, categoria, total_ajustes, fecha_creacion)
          SELECT fa.id, $2, 'pendiente', $3, $4, CURRENT_TIMESTAMP
          FROM facturas fa 
          WHERE fa.alegra_id = $1
        `, [factura.alegra_id, JSON.stringify(factura.ajustes), categoria, totalAjustes]);
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
    console.log('🗑️ Limpiando faltantes de la BD (pendientes y procesados)...');

    const { query } = require('../config/database');

    // Obtener faltantes pendientes (vista proveedores)
    const faltantesPendientes = await query(`
      SELECT 
        f.id, 
        f.factura_id,
        p.nombre as producto_nombre, 
        COALESCE(pr.nombre, 'Sin proveedor') as proveedor_nombre
      FROM faltantes f
      JOIN productos p ON f.producto_id = p.id
      LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
      WHERE f.estado = 'pendiente'
    `);

    // Obtener faltantes procesados (vista clientes)
    const faltantesProcesados = await query(`
      SELECT 
        f.id,
        f.factura_id,
        p.nombre as producto_nombre,
        fa.numero_factura,
        fa.cliente_nombre
      FROM faltantes f
      JOIN productos p ON f.producto_id = p.id
      JOIN facturas fa ON f.factura_id = fa.id
      WHERE f.estado = 'procesado'
    `);

    if (faltantesPendientes.rows.length === 0 && faltantesProcesados.rows.length === 0) {
      return res.json({
        success: true,
        message: 'No hay faltantes pendientes ni procesados para limpiar.',
        datos_borrados: 0,
        procesados_borrados: 0
      });
    }

    const stats = {
      pendientes: { faltantes: 0, ajustes: 0 },
      procesados: { faltantes: 0, ajustes: 0 }
    };

    // Eliminar faltantes pendientes
    const faltantesPendientesIds = faltantesPendientes.rows.map(f => f.id);
    if (faltantesPendientesIds.length > 0) {
      const ajustesPendientes = await query(`
        DELETE FROM faltantes_ajustes
        WHERE faltante_id = ANY($1::int[])
        RETURNING id
      `, [faltantesPendientesIds]);

      const pendientesEliminados = await query(`
      DELETE FROM faltantes 
        WHERE id = ANY($1::int[])
      RETURNING id
      `, [faltantesPendientesIds]);

      stats.pendientes.ajustes = ajustesPendientes.rows.length;
      stats.pendientes.faltantes = pendientesEliminados.rows.length;
    }

    // Eliminar faltantes procesados (mantienen reporte clientes limpio)
    const faltantesProcesadosIds = faltantesProcesados.rows.map(f => f.id);
    if (faltantesProcesadosIds.length > 0) {
      const ajustesProcesados = await query(`
        DELETE FROM faltantes_ajustes
        WHERE faltante_id = ANY($1::int[])
        RETURNING id
      `, [faltantesProcesadosIds]);

      const procesadosEliminados = await query(`
        DELETE FROM faltantes
        WHERE id = ANY($1::int[])
        RETURNING id
      `, [faltantesProcesadosIds]);

      stats.procesados.ajustes = ajustesProcesados.rows.length;
      stats.procesados.faltantes = procesadosEliminados.rows.length;
    }

    // Limpiar facturas pendientes manualmente relacionadas
    const facturaIdsParaLimpiar = Array.from(new Set([
      ...faltantesPendientes.rows.map(f => f.factura_id),
      ...faltantesProcesados.rows.map(f => f.factura_id)
    ])).filter(Boolean);

    let pendientesManualesEliminados = 0;
    if (facturaIdsParaLimpiar.length > 0) {
      const pendientesResult = await query(`
        DELETE FROM facturas_pendientes
        WHERE factura_id = ANY($1::int[])
        RETURNING id
      `, [facturaIdsParaLimpiar]);
      pendientesManualesEliminados = pendientesResult.rows.length;
    }

    // Limpiar observaciones adicionales de facturas que ya no tienen faltantes
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

    console.log(`✅ ${stats.pendientes.faltantes} faltantes pendientes borrados.`);
    console.log(`✅ ${stats.procesados.faltantes} faltantes procesados borrados.`);
    console.log(`✅ ${stats.pendientes.ajustes + stats.procesados.ajustes} ajustes asociados eliminados.`);
    console.log(`✅ ${pendientesManualesEliminados} registros de facturas pendientes eliminados.`);

    res.json({
      success: true,
      message: `Faltantes limpiados: ${stats.pendientes.faltantes} pendientes y ${stats.procesados.faltantes} procesados.`,
      datos_borrados: stats.pendientes.faltantes,
      procesados_borrados: stats.procesados.faltantes,
      historial_preservado: true,
      ajustes_eliminados: stats.pendientes.ajustes + stats.procesados.ajustes,
      facturas_pendientes_eliminadas: pendientesManualesEliminados,
      faltantes_eliminados: faltantesPendientes.rows,
      faltantes_procesados_eliminados: faltantesProcesados.rows
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
    await ensureReimpresionSchema(query);

    const result = await query(`
      SELECT 
        fr.id as reimpresion_id,
        fr.ajustes_realizados,
        fr.estado as estado_reimpresion,
        fr.fecha_creacion,
        fr.categoria,
        fr.total_ajustes,
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

      const requiereActualizacion = ajustes?.some(aj => aj.requiere_actualizacion) || false;
      const tieneVariacionPrecio = ajustes?.some(aj => aj.diferencia_precio_absoluta || aj.diferencia_precio_relativa);

      return {
        ...factura,
        ajustes_realizados: ajustes,
        total_ajustes: ajustes?.length || 0,
        requiere_actualizacion: requiereActualizacion,
        tiene_variacion_precio: tieneVariacionPrecio,
        categoria: factura.categoria || (requiereActualizacion ? 'requiere_cambios' : 'sin_cambios')
      };
    });

    const sinCambios = facturasConAjustes.filter(f => f.categoria === 'sin_cambios');
    const requiereCambios = facturasConAjustes.filter(f => f.categoria !== 'sin_cambios');

    res.json({
      success: true,
      data: {
        sin_cambios: sinCambios,
        requiere_cambios: requiereCambios
      },
      total_pendientes: facturasConAjustes.length,
      resumen: {
        facturas_pendientes: facturasConAjustes.length,
        facturas_sin_cambios: sinCambios.length,
        facturas_con_cambios: requiereCambios.length
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

    const {
      alegra_id,
      numero_factura,
      cliente_nombre,
      fecha_emision,
      ajustes: ajustesRaw = [],
      estado,
      items_editados: itemsEditadosRaw = [],
      marcar_como_procesada
    } = req.body;

    if (!alegra_id || !numero_factura) {
      return res.status(400).json({
        success: false,
        message: 'alegra_id y numero_factura son requeridos'
      });
    }

    const ajustes = Array.isArray(ajustesRaw) ? ajustesRaw : [];
    const itemsEditados = Array.isArray(itemsEditadosRaw) ? itemsEditadosRaw : [];

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
      1, // Todas las facturas pasan por impresión
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

    const upsertFacturaEnReimpresion = async (estadoRegistro = 'pendiente', categoriaRegistro, totalAjustesRegistro) => {
      const existeReimpresion = await query(`
        SELECT fr.id FROM facturas_reimpresion fr
        JOIN facturas fa ON fr.factura_id = fa.id
        WHERE fa.alegra_id = $1
      `, [alegra_id]);

      if (existeReimpresion.rows.length > 0) {
        await query(`
          UPDATE facturas_reimpresion 
          SET ajustes_realizados = $2,
              estado = $3,
              categoria = $4,
              total_ajustes = $5,
              fecha_creacion = CASE WHEN $3 = 'pendiente' THEN CURRENT_TIMESTAMP ELSE fecha_creacion END,
              fecha_procesamiento = CASE WHEN $3 = 'procesada' THEN CURRENT_TIMESTAMP ELSE NULL END
          FROM facturas fa
          WHERE facturas_reimpresion.factura_id = fa.id
          AND fa.alegra_id = $1
        `, [alegra_id, JSON.stringify(ajustes), estadoRegistro, categoriaRegistro, totalAjustesRegistro]);
      } else {
        await query(`
          INSERT INTO facturas_reimpresion (factura_id, ajustes_realizados, estado, categoria, total_ajustes, fecha_creacion, fecha_procesamiento)
          SELECT fa.id, $2, $3, $4, $5, CURRENT_TIMESTAMP,
                 CASE WHEN $3 = 'procesada' THEN CURRENT_TIMESTAMP ELSE NULL END
          FROM facturas fa 
          WHERE fa.alegra_id = $1
        `, [alegra_id, JSON.stringify(ajustes), estadoRegistro, categoriaRegistro, totalAjustesRegistro]);
      }
    };

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
          AND f.estado IN ('pendiente', 'procesado')
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

    // 🔧 NUEVO: 3. Detectar diferencias de precio >5% para productos que NO requieren cambio de cantidad
    console.log(`💰 Verificando diferencias de precio >5% para productos sin cambio de cantidad...`);
    
    const ajustesConDiferenciaPrecio = [];
    const prisma = require('../lib/prisma');
    
    try {
      // Obtener factura original de Alegra para tener precios originales
      const facturaOriginal = await alegraService.getInvoiceById(alegra_id);
      
      if (facturaOriginal.success && facturaOriginal.data.items) {
        for (const item of facturaOriginal.data.items) {
          // Buscar ajuste para este item
          const ajuste = ajustes.find(a =>
            a.producto_codigo === item.id.toString() ||
            a.producto_codigo === item.reference ||
            a.producto_codigo === item.reference?.reference
          );

          // Solo verificar si el producto NO requiere cambio de cantidad (llegó completo)
          if (ajuste && ajuste.estado === 'completo') {
            const precioOriginal = parseFloat(item.price) || 0;
            
            if (precioOriginal > 0) {
              // Buscar mapping del producto para obtener precio nuevo del proveedor
              const mappingResult = await query(`
                SELECT 
                  id,
                  alegra_reference as "alegraReference",
                  alegra_item_id as "alegraItemId"
                FROM supplier_product_mapping 
                WHERE alegra_reference = $1 
                OR alegra_item_id = $2
                ORDER BY confidence DESC, last_used_date DESC
                LIMIT 1
              `, [item.reference?.reference || item.reference, item.id.toString()]);

              if (mappingResult.rows.length > 0) {
                const mappingId = mappingResult.rows[0].id;
                
                // Obtener último precio del proveedor (con descuentos e IVA)
                const productoFactura = await prisma.productoFactura.findFirst({
                  where: {
                    mapeoId: mappingId
                  },
                  orderBy: {
                    factura: {
                      fechaEmision: 'desc'
                    }
                  },
                  select: {
                    precioUnitario: true,
                    descuento: true,
                    cantidad: true
                  }
                });

                if (productoFactura && productoFactura.precioUnitario > 0) {
                  // Calcular costo real con descuentos e IVA (igual que en gestionar relaciones)
                  const precioUnitarioSinIva = parseFloat(productoFactura.precioUnitario);
                  const descuento = parseFloat(productoFactura.descuento) || 0;
                  const cantidad = parseFloat(productoFactura.cantidad) || 1;
                  
                  const montoTotalSinDescuento = precioUnitarioSinIva * cantidad;
                  const descuentoPorcentaje = montoTotalSinDescuento > 0 
                    ? (descuento / montoTotalSinDescuento) * 100
                    : 0;
                  
                  const costoSinIvaConDescuento = precioUnitarioSinIva * (1 - descuentoPorcentaje / 100);
                  const precioNuevo = costoSinIvaConDescuento * 1.13; // Agregar IVA 13%
                  const precioNuevoRedondeado = Math.round(precioNuevo * 100) / 100;

                  // Calcular diferencia porcentual
                  // IMPORTANTE: Solo detectar si el precio nuevo es MÁS ALTO que el original
                  const diferenciaAbsoluta = precioNuevoRedondeado - precioOriginal;
                  const diferenciaPorcentual = precioOriginal > 0 
                    ? (diferenciaAbsoluta / precioOriginal) * 100
                    : 0;

                  console.log(`   📊 ${item.description}:`);
                  console.log(`      Precio original: ₡${precioOriginal.toFixed(2)}`);
                  console.log(`      Precio nuevo: ₡${precioNuevoRedondeado.toFixed(2)}`);
                  console.log(`      Diferencia: ${diferenciaPorcentual >= 0 ? '+' : ''}${diferenciaPorcentual.toFixed(2)}%`);

                  // Solo detectar si el precio nuevo es MÁS ALTO (>5% de aumento)
                  // Si el precio nuevo es más bajo, no hacer nada
                  if (diferenciaPorcentual > 5) {
                    console.log(`   ⚠️ Aumento de precio >5% detectado: +${diferenciaPorcentual.toFixed(2)}%`);
                    console.log(`   📈 Precio aumentó de ₡${precioOriginal.toFixed(2)} a ₡${precioNuevoRedondeado.toFixed(2)}`);
                    
                    ajustesConDiferenciaPrecio.push({
                      producto_codigo: item.reference?.reference || item.reference || item.id.toString(),
                      producto_nombre: item.description,
                      estado: 'completo',
                      cantidad_entregada: item.quantity,
                      cantidad_faltante: 0,
                      requiere_actualizacion: true,
                      motivo: `Aumento de precio >5%: +${diferenciaPorcentual.toFixed(2)}% (Original: ₡${precioOriginal.toFixed(2)}, Nuevo: ₡${precioNuevoRedondeado.toFixed(2)})`,
                      tipo_ajuste: 'diferencia_precio',
                      precio_original: precioOriginal,
                      precio_nuevo: precioNuevoRedondeado,
                      diferencia_porcentual: diferenciaPorcentual
                    });
                  } else if (diferenciaPorcentual < -5) {
                    // Precio bajó más de 5% - no hacer nada (no mandar a reimpresión)
                    console.log(`   ✅ Precio bajó ${Math.abs(diferenciaPorcentual).toFixed(2)}% - No requiere reimpresión`);
                  } else {
                    // Diferencia dentro del rango aceptable (-5% a +5%)
                    console.log(`   ✅ Diferencia de precio dentro del rango aceptable (${diferenciaPorcentual >= 0 ? '+' : ''}${diferenciaPorcentual.toFixed(2)}%)`);
                  }
                }
              }
            }
          }
        }
      }

      // Si hay ajustes por diferencia de precio, agregarlos a la lista de ajustes
      if (ajustesConDiferenciaPrecio.length > 0) {
        console.log(`💰 ${ajustesConDiferenciaPrecio.length} producto(s) con diferencia de precio >5% detectados`);
        ajustes.push(...ajustesConDiferenciaPrecio);
        
        // Si no estaba marcada para reimpresión, marcarla ahora
        if (!estado.includes('requiere_reimpresion')) {
          console.log(`🔄 Factura ${numero_factura} marcada para impresión por diferencia de precio`);
          const categoriaForzosa = determineReimpresionCategoria(ajustes);
          await upsertFacturaEnReimpresion('pendiente', categoriaForzosa, ajustes.length);
        }
      }
    } catch (error) {
      console.error(`❌ Error verificando diferencias de precio:`, error.message);
      // Continuar aunque falle la verificación de precios
    }

    const categoria = determineReimpresionCategoria(ajustes);
    const totalAjustes = ajustes.length;

    if (marcar_como_procesada === true) {
      await upsertFacturaEnReimpresion('procesada', categoria, totalAjustes);
    } else {
      await upsertFacturaEnReimpresion('pendiente', categoria, totalAjustes);
    }

    // 3. Marcar faltantes/facturas como procesados SOLO si se indica
    if (marcar_como_procesada === true) {
    await query(`
      UPDATE faltantes 
      SET estado = 'procesado'
      FROM facturas fa
      WHERE faltantes.factura_id = fa.id 
      AND fa.alegra_id = $1
    `, [alegra_id]);
    }

    await query(`
      UPDATE facturas 
      SET estado_procesamiento = 'procesado'
      WHERE alegra_id = $1
    `, [alegra_id]);

    // Si estaba marcada como pendiente manual, removerla
    await query(`
      DELETE FROM facturas_pendientes
      WHERE alegra_id = $1
    `, [alegra_id]);

    // 5. 🔧 CAMBIO: Editar factura en Alegra SOLO cuando se reimprime (no al marcar como lista)
    const marcarComoProcesada = marcar_como_procesada === true;
    
    // Usar estado actualizado (puede haber cambiado por diferencia de precio)
    const estadoFinal = ajustesConDiferenciaPrecio.length > 0 && !estado.includes('requiere_reimpresion')
      ? 'requiere_reimpresion'
      : estado;
    
    // NUEVO COMPORTAMIENTO:
    // - Si marcarComoProcesada = false → Viene desde "Reporte Clientes" (Factura Lista) → NO editar en Alegra
    // - Si marcarComoProcesada = true → Viene desde "Reimpresión" (Reimprimir) → SÍ editar en Alegra
    const debeEditarEnAlegra = marcarComoProcesada && (
      (ajustes && ajustes.length > 0) ||
      itemsEditados.length > 0
    );
    
    if (debeEditarEnAlegra) {
      const cacheProductosBusqueda = new Map();

      const buscarProductoPorReferencia = async (referencia) => {
        if (!referencia) return null;
        const refNormalizada = referencia.trim().toLowerCase();
        if (cacheProductosBusqueda.has(refNormalizada)) {
          return cacheProductosBusqueda.get(refNormalizada);
        }

        try {
          const resultadoBusqueda = await alegraService.searchProducts(referencia);
          if (resultadoBusqueda.success && Array.isArray(resultadoBusqueda.data)) {
            const encontrado = resultadoBusqueda.data.find(item => {
              const refItem = (item.reference?.reference || item.reference || '').toString().trim().toLowerCase();
              return refItem === refNormalizada;
            }) || resultadoBusqueda.data.find(item => {
              const refItem = (item.reference?.reference || item.reference || '').toString().trim().toLowerCase();
              return refItem.includes(refNormalizada);
            });

            cacheProductosBusqueda.set(refNormalizada, encontrado || null);
            return encontrado || null;
          }
        } catch (error) {
          console.error(`❌ Error buscando producto por referencia ${referencia}:`, error.message);
        }

        cacheProductosBusqueda.set(refNormalizada, null);
        return null;
      };

      if (itemsEditados.length > 0) {
        console.log(`✏️ Recibidos ${itemsEditados.length} items editados manualmente. Actualizando factura ${numero_factura} en Alegra...`);

        const normalizarItemEditado = async (item) => {
          if (!item) return null;
          const referencia = (item.reference || '').toString().trim();
          const descripcionBase = (item.description || item.name || referencia || '').toString().trim();
          const cantidad = Number(item.quantity) || 0;
          const precio = Number(item.price) || 0;
          let alegraItemId = item.item?.id || item.itemId || item.alegraItemId || item.id;

          if (!referencia) {
            console.warn(`⚠️ Item ${alegraItemId} ignorado: referencia vacía`);
            return null;
          }

          if (!alegraItemId && referencia) {
            const productoAlegra = await buscarProductoPorReferencia(referencia);
            if (productoAlegra && productoAlegra.id) {
              alegraItemId = productoAlegra.id.toString();
              console.log(`🔁 Referencia ${referencia} asociada a item Alegra ${alegraItemId} mediante búsqueda`);
            }
          }

          if (!alegraItemId) {
            console.warn(`⚠️ Item ignorado por no tener alegraItemId: ${JSON.stringify(item)}`);
            return null;
          }

          if (cantidad <= 0) {
            console.log(`🗑️ Item ${alegraItemId} se eliminará (cantidad ${cantidad})`);
            return null;
          }

          const payload = {
            id: alegraItemId.toString(),
            reference: referencia,
            description: descripcionBase || referencia,
            name: item.name || descripcionBase || referencia,
            quantity: cantidad,
            price: precio > 0 ? precio : 0,
            item: { id: alegraItemId.toString() }
          };

          if (Array.isArray(item.tax) && item.tax.length > 0) {
            payload.tax = item.tax;
          }
          return payload;
        };

        const itemsNormalizados = [];
        for (const item of itemsEditados) {
          const normalizado = await normalizarItemEditado(item);
          if (normalizado) {
            itemsNormalizados.push(normalizado);
          }
        }

        if (itemsNormalizados.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'No hay productos válidos para actualizar en Alegra'
          });
        }

        const updateResult = await alegraService.updateInvoice(alegra_id, {
          items: itemsNormalizados
        });

        if (updateResult.success) {
          console.log(`✅ Factura ${numero_factura} editada en Alegra con ${itemsNormalizados.length} items manuales`);
        } else {
          console.error(`❌ Error editando factura en Alegra:`, updateResult.message, updateResult.details || '');
          return res.status(500).json({
            success: false,
            message: updateResult.message || 'Error editando factura en Alegra',
            details: updateResult.details || null
          });
        }
      } else {
      console.log(`🔄 Editando factura ${numero_factura} en Alegra con ${ajustes.length} ajustes...`);
      console.log(`📋 Ajustes recibidos:`, JSON.stringify(ajustes, null, 2));
      
      try {
        // Obtener factura actual de Alegra
        const facturaActual = await alegraService.getInvoiceById(alegra_id);
        
        if (!facturaActual.success) {
          console.error(`❌ No se pudo obtener factura ${alegra_id} de Alegra`);
        } else {
          console.log(`📄 Factura actual obtenida: ${facturaActual.data.items.length} items`);
          facturaActual.data.items.forEach((item, index) => {
            console.log(`   ${index + 1}. ID: ${item.id}, Desc: ${item.description}, Qty: ${item.quantity}, Ref: ${JSON.stringify(item.reference)}`);
          });
          // Construir items actualizados aplicando ajustes
          // IMPORTANTE: Según la documentación de Alegra, si un item NO está en el array items,
          // se ELIMINA de la factura. Por lo tanto, debemos incluir TODOS los items (modificados o no)
          const itemsActualizados = [];
          let huboCambios = false;

          for (const item of facturaActual.data.items) {
            // Buscar ajuste para este item
            console.log(`\n   🔍 Buscando ajuste para item ID: ${item.id}, Desc: ${item.description}`);
            console.log(`      item.id.toString(): "${item.id.toString()}"`);
            console.log(`      item.reference: ${JSON.stringify(item.reference)}`);
            
            const ajuste = ajustes.find(a => {
              const match = a.producto_codigo === item.id.toString() ||
                           a.producto_codigo === item.reference ||
                           a.producto_codigo === item.reference?.reference;
              
              if (!match) {
                console.log(`      ❌ No match con ajuste: ${a.producto_codigo} (${a.producto_nombre})`);
              }
              return match;
            });

            if (ajuste) {
              console.log(`      ✅ Ajuste encontrado:`, {
                codigo: ajuste.producto_codigo,
                estado: ajuste.estado,
                faltante: ajuste.cantidad_faltante,
                entregada: ajuste.cantidad_entregada
              });
              // Calcular cantidad final según el estado del ajuste
              let cantidadFinal = item.quantity;

              if (ajuste.estado === 'no_llego') {
                const cantidadFaltante = ajuste.cantidad_faltante || 0;
                
                if (cantidadFaltante <= 0) {
                  console.error(`   ❌ ERROR: cantidad_faltante inválida (${cantidadFaltante}) para ${item.description}`);
                  cantidadFinal = item.quantity; // Mantener cantidad original si hay error
                } else {
                  cantidadFinal = item.quantity - cantidadFaltante;
                  console.log(`   📊 ${item.description}: ${item.quantity} - ${cantidadFaltante} (faltante) = ${cantidadFinal}`);
                }
              } else if (ajuste.estado === 'parcial') {
                const cantidadQueAunFalta = ajuste.cantidad_faltante - (ajuste.cantidad_entregada || 0);
                cantidadFinal = item.quantity - cantidadQueAunFalta;
                console.log(`   📊 ${item.description}: ${item.quantity} - ${cantidadQueAunFalta} (aún falta) = ${cantidadFinal}`);
              } else if (ajuste.estado === 'completo') {
                cantidadFinal = item.quantity;
                
                if (ajuste.tipo_ajuste === 'diferencia_precio') {
                  console.log(`   💰 ${item.description}: ${item.quantity} (sin cambios cantidad, pero ${ajuste.diferencia_porcentual?.toFixed(2)}% diferencia precio)`);
                } else {
                  console.log(`   ✅ ${item.description}: ${item.quantity} (sin cambios, llegó completo)`);
                }
              }

              // Determinar precio a usar
              let precioAUsar = item.price;
              
              if (ajuste.tipo_ajuste === 'diferencia_precio' && ajuste.precio_nuevo) {
                precioAUsar = ajuste.precio_nuevo;
                console.log(`   💰 Actualizando precio: ₡${item.price} → ₡${precioAUsar.toFixed(2)}`);
                huboCambios = true;
              }

              if (cantidadFinal > 0) {
                itemsActualizados.push({
                  id: item.id,
                  reference: item.reference,
                  description: item.description,
                  quantity: cantidadFinal,
                  price: precioAUsar,
                  tax: item.tax || []
                });
                
                if (cantidadFinal !== item.quantity || precioAUsar !== item.price) {
                  huboCambios = true;
                  if (cantidadFinal !== item.quantity) {
                    console.log(`   ✏️ ${item.description}: ${item.quantity} → ${cantidadFinal}`);
                  }
                }
              } else {
                huboCambios = true;
                console.log(`   🗑️ ${item.description}: eliminado (cantidad = 0)`);
              }
            } else {
              itemsActualizados.push({
                id: item.id,
                reference: item.reference,
                description: item.description,
                quantity: item.quantity,
                price: item.price,
                tax: item.tax || []
              });
            }
          }

          console.log(`\n📊 Resultado de construcción de items:`);
          console.log(`   huboCambios: ${huboCambios}`);
          console.log(`   itemsActualizados.length: ${itemsActualizados.length}`);
          console.log(`\n📋 Items a enviar a Alegra:`);
          itemsActualizados.forEach((item, index) => {
            console.log(`   ${index + 1}. ID: ${item.id}, Desc: ${item.description}, Qty: ${item.quantity}, Price: ${item.price}`);
          });
          
          if (huboCambios && itemsActualizados.length > 0) {
            console.log(`\n📝 Actualizando factura en Alegra...`);
            
            const updateResult = await alegraService.updateInvoice(alegra_id, {
              items: itemsActualizados
            });

            if (updateResult.success) {
              console.log(`✅ Factura ${numero_factura} editada exitosamente en Alegra`);
              
              const facturaActualizada = await alegraService.getInvoiceById(alegra_id);
              
              if (facturaActualizada.success) {
                console.log(`✅ Factura ${numero_factura} actualizada obtenida de Alegra`);
              }
            } else {
              console.error(`❌ Error editando factura en Alegra: ${updateResult.message}`);
            }
          } else {
            console.log(`ℹ️ No hubo cambios en la factura (todos los items sin ajustes o sin cambios)`);
          }
        }
      } catch (error) {
        console.error(`❌ Error editando factura en Alegra:`, error.message);
        // Continuar aunque falle la edición en Alegra
        }
      }
    } else if (!marcarComoProcesada && ajustes && ajustes.length > 0) {
      // Viene desde Reporte Clientes (Factura Lista) - NO editar en Alegra aún
      console.log(`📋 Factura ${numero_factura} NO se editará en Alegra todavía (viene desde Reporte Clientes)`);
      console.log(`   ✅ Ajustes guardados - La factura se editará cuando se reimprime`);
    }
    
    if (estadoFinal.includes('requiere_reimpresion') && marcarComoProcesada) {
      // Solo si viene desde Reimpresión (reimprimiendo), marcar como procesada
      await query(`
        UPDATE facturas_reimpresion 
        SET estado = 'procesada', 
            fecha_procesamiento = NOW()
        FROM facturas fa
        WHERE facturas_reimpresion.factura_id = fa.id
        AND fa.alegra_id = $1
      `, [alegra_id]);
      console.log(`✅ Factura ${numero_factura} marcada como 'procesada' en reimpresión (reimpresa)`);
    } else if (estadoFinal.includes('requiere_reimpresion')) {
      // Si viene desde ReporteClientes, mantener en 'pendiente' para que aparezca en Reimpresión
      console.log(`📋 Factura ${numero_factura} guardada en reimpresión con estado 'pendiente' (aparecerá en Reimpresión)`);
    }

    console.log(`✅ Factura ${numero_factura} procesada individualmente:`);
    console.log(`   📋 Faltantes marcados como procesados`);
    console.log(`   💾 ${ajustes.length} ajustes guardados permanentemente`);
    if (ajustesConDiferenciaPrecio.length > 0) {
      console.log(`   💰 ${ajustesConDiferenciaPrecio.length} producto(s) con diferencia de precio >5% detectados`);
    }
    if (marcarComoProcesada && ((ajustes && ajustes.length > 0) || itemsEditados.length > 0)) {
      console.log(`   ✏️ Factura editada en Alegra ${itemsEditados.length > 0 ? 'con items manuales' : 'con ajustes aplicados'}`);
    } else if (!marcarComoProcesada && estadoFinal.includes('requiere_reimpresion')) {
      console.log(`   ⏳ Factura pendiente de edición en Alegra (se editará al reimprimir)`);
    }
    console.log(`🔄 Estado: ${estadoFinal.includes('requiere_reimpresion') ? 'En reimpresión → Historial' : 'En historial'}`);

    res.json({
      success: true,
      message: `Factura ${numero_factura} procesada correctamente`,
      data: {
        procesamiento_id: procesamiento.rows[0].id,
        factura_procesada: numero_factura,
        estado: estadoFinal,
        requiere_reimpresion: estadoFinal.includes('requiere_reimpresion'),
        ajustes_realizados: ajustes.length,
        ajustes_guardados: ajustes.length,
        ajustes_diferencia_precio: ajustesConDiferenciaPrecio.length,
        factura_editada_en_alegra: marcarComoProcesada && (
          (ajustes && ajustes.length > 0) ||
          itemsEditados.length > 0
        )
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


// Marcar una factura como pendiente manualmente
router.post('/facturas/:id/pendiente', async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo = null } = req.body || {};
    const alegraId = parseInt(id, 10);

    if (Number.isNaN(alegraId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de factura inválido'
      });
    }

    const { query } = require('../config/database');

    const facturaResult = await query(`
      SELECT id
      FROM facturas
      WHERE alegra_id = $1
    `, [alegraId]);

    if (facturaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Factura no encontrada'
      });
    }

    const facturaId = facturaResult.rows[0].id;

    const pendienteResult = await query(`
      INSERT INTO facturas_pendientes (factura_id, alegra_id, motivo)
      VALUES ($1, $2, $3)
      ON CONFLICT (factura_id) DO UPDATE
      SET motivo = EXCLUDED.motivo,
          updated_at = CURRENT_TIMESTAMP
      RETURNING id, motivo, created_at, updated_at
    `, [facturaId, alegraId, motivo]);

    // Mantener la factura en estado pendiente
    await query(`
      UPDATE facturas
      SET estado_procesamiento = 'pendiente'
      WHERE id = $1
    `, [facturaId]);

    res.json({
      success: true,
      message: 'Factura marcada como pendiente',
      data: {
        pendiente_id: pendienteResult.rows[0].id,
        motivo: pendienteResult.rows[0].motivo,
        created_at: pendienteResult.rows[0].created_at,
        updated_at: pendienteResult.rows[0].updated_at
      }
    });
  } catch (error) {
    console.error('❌ Error marcando factura como pendiente:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error marcando factura como pendiente'
    });
  }
});

// Quitar estado pendiente manual de una factura
router.delete('/facturas/:id/pendiente', async (req, res) => {
  try {
    const { id } = req.params;
    const alegraId = parseInt(id, 10);

    if (Number.isNaN(alegraId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de factura inválido'
      });
    }

    const { query } = require('../config/database');

    const deleteResult = await query(`
      DELETE FROM facturas_pendientes
      WHERE alegra_id = $1
      RETURNING id
    `, [alegraId]);

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'La factura no estaba marcada como pendiente'
      });
    }

    res.json({
      success: true,
      message: 'Factura removida del estado pendiente'
    });
  } catch (error) {
    console.error('❌ Error removiendo estado pendiente:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error removiendo estado pendiente'
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

    // 2.5 Limpiar estados pendientes manuales
    await query(`
      DELETE FROM facturas_pendientes
      WHERE alegra_id = ANY($1::int[])
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

// Eliminar ajuste temporal
router.delete('/faltantes/ajustes/:faltanteId', async (req, res) => {
  try {
    const { faltanteId } = req.params;
    const { query } = require('../config/database');

    await query(
      'DELETE FROM faltantes_ajustes WHERE faltante_id = $1',
      [faltanteId]
    );

    res.json({ success: true, message: 'Ajuste eliminado' });
  } catch (error) {
    console.error('❌ Error eliminando ajuste:', error);
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

    const {
      proveedor,
      productos,
      preferirDatosProveedor = true
    } = req.body;

    if (!proveedor || !productos || !Array.isArray(productos)) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere proveedor y array de productos'
      });
    }

    const preferirDatosProveedorGlobal = preferirDatosProveedor !== false;

    // NUEVO: Enriquecer productos con información del proveedor desde Supabase
    const { query } = require('../config/database');
    // Eliminamos la línea de queryExternal
    // const { queryExternal } = require('../config/external-database');


    const normalize = (value) => value ? value.toString().trim() : '';
    const normalizeLower = (value) => value ? value.toString().toLowerCase().trim() : '';
    const canonicalizeNombre = (value) => {
      if (!value) return '';
      return value
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
    };
    const proveedorNormalizado = normalizeLower(proveedor);
    const proveedorCanonico = canonicalizeNombre(proveedor);

    const mappingSelect = `
          SELECT 
            id,
            supplier_code as "supplierCode",
            supplier_desc as "supplierDesc",
            supplier_name as "supplierName",
            supplier_cedula as "supplierCedula",
            alegra_reference as "alegraReference",
            alegra_name as "alegraName",
            alegra_item_id as "alegraItemId",
            confidence,
            origen,
            factor_conversion as "factorConversion",
        last_used_date as "lastUsedDate",
        times_used as "timesUsed"
          FROM supplier_product_mapping 
    `;

    const fetchMappings = async (sql, params) => {
      const result = await query(sql, params);
      return result.rows || [];
    };

    const sanitizeCodigoProveedor = (valor) => {
      if (!valor) return null;
      const cleaned = valor.toString().trim();
      if (!cleaned || cleaned.toUpperCase() === 'N/A') return null;
      return cleaned;
    };

    const mappingMatchesProveedor = (mapping, { skipStrictValidation = false } = {}) => {
      if (!mapping) return false;
      if (skipStrictValidation) return true;
      if (!mapping.supplierName) return false;
      return canonicalizeNombre(mapping.supplierName) === proveedorCanonico;
    };

    const pickFirstMatching = (rows, { skipStrictValidation = false } = {}) => {
      if (!rows || rows.length === 0) {
        return null;
      }
      if (skipStrictValidation) {
        return rows[0];
      }
      return rows.find(row => mappingMatchesProveedor(row)) || null;
    };

    const getMappingById = async (mappingId) => {
      if (!mappingId) return null;
      const rows = await fetchMappings(
        `${mappingSelect} WHERE id = $1`,
        [mappingId]
      );
      return rows[0] || null;
    };

    const getMappingBySupplierCode = async (codigoProveedor) => {
      if (!codigoProveedor) return null;
      const rows = await fetchMappings(
        `${mappingSelect} 
          WHERE supplier_code = $1 
          ORDER BY last_used_date DESC, times_used DESC
          LIMIT 10`,
        [codigoProveedor]
      );
      return pickFirstMatching(rows);
    };

    const getMappingByAlegraId = async (alegraItemId) => {
      if (!alegraItemId) return null;
      const rows = await fetchMappings(
        `${mappingSelect}
          WHERE alegra_item_id::text = $1
          ORDER BY last_used_date DESC, times_used DESC
          LIMIT 10`,
        [alegraItemId.toString()]
      );
      return pickFirstMatching(rows);
    };

    const getMappingByFlexibleSearch = async (productoPayload) => {
      const referencia = productoPayload.codigoInterno || null;
      const nombreBusqueda = productoPayload.nombreProveedorEntrada || productoPayload.nombreInterno || null;

      if (!referencia && !nombreBusqueda) return null;

      const rows = await fetchMappings(
        `${mappingSelect}
          WHERE 
              ($1 IS NOT NULL AND alegra_reference = $1)
              OR ($2 IS NOT NULL AND supplier_desc ILIKE $2)
              OR ($2 IS NOT NULL AND alegra_name ILIKE $2)
          ORDER BY confidence DESC, last_used_date DESC, times_used DESC
          LIMIT 20`,
        [
          referencia,
          nombreBusqueda ? `%${nombreBusqueda}%` : null
        ]
      );
      return pickFirstMatching(rows);
    };

    const productosEnriquecidos = [];

    for (const producto of productos) {
      try {
        const preferirDatosProveedorActual = typeof producto.preferirDatosProveedor === 'boolean'
          ? producto.preferirDatosProveedor
          : preferirDatosProveedorGlobal;

        const payloadInfo = {
          codigoInterno: producto.codigo || producto.codigoInterno || null,
          nombreInterno: producto.nombre || producto.nombreInterno || null,
          codigoProveedorEntrada: sanitizeCodigoProveedor(producto.codigoProveedor || producto.codigo_proveedor),
          nombreProveedorEntrada: normalize(producto.nombreProveedor || producto.nombre_proveedor),
          mappingId: producto.mappingId || producto.mapping_id || null,
          alegraItemId: producto.alegraItemId || producto.alegra_item_id || null,
          cantidadFinal: parseInt(producto.cantidad, 10) || 0,
          factorConversion: producto.factorConversion || producto.factor_conversion || 1
        };

        if (!preferirDatosProveedorActual) {
          productosEnriquecidos.push({
            codigo_pdf: payloadInfo.codigoInterno || payloadInfo.codigoProveedorEntrada || 'N/A',
            nombre_pdf: payloadInfo.nombreInterno || payloadInfo.nombreProveedorEntrada || 'Sin descripción',
            cantidad: payloadInfo.cantidadFinal,
            codigo_interno: payloadInfo.codigoInterno,
            nombre_interno: payloadInfo.nombreInterno,
            confianza: 0,
            factorConversion: payloadInfo.factorConversion,
            origen: 'interno_manual',
            datosProveedorReales: false,
            mappingId: payloadInfo.mappingId || null
          });
          continue;
        }

        let mapping = null;
        let mappingFuente = null;

        if (payloadInfo.mappingId) {
          mapping = await getMappingById(payloadInfo.mappingId);
          mappingFuente = 'mappingId';
        }

        if (!mapping) {
          const mappingByCode = await getMappingBySupplierCode(payloadInfo.codigoProveedorEntrada);
          if (mappingByCode) {
            mapping = mappingByCode;
            mappingFuente = 'supplierCode';
          }
        }

        if (!mapping) {
          const mappingByAlegra = await getMappingByAlegraId(payloadInfo.alegraItemId);
          if (mappingByAlegra) {
            mapping = mappingByAlegra;
            mappingFuente = 'alegraId';
          }
        }

        if (!mapping) {
          const mappingBySearch = await getMappingByFlexibleSearch(payloadInfo);
          if (mappingBySearch) {
            mapping = mappingBySearch;
            mappingFuente = 'flex';
          }
        }

        if (mapping && mappingFuente !== 'mappingId' && !mappingMatchesProveedor(mapping)) {
          mapping = null;
        }

        const codigoProveedorPreferido =
          sanitizeCodigoProveedor(payloadInfo.codigoProveedorEntrada) ||
          sanitizeCodigoProveedor(mapping?.supplierCode) ||
          null;

        const nombreProveedorPreferido =
          normalize(payloadInfo.nombreProveedorEntrada) ||
          normalize(mapping?.supplierDesc || mapping?.alegraName) ||
          null;

        const tieneMapping = Boolean(mapping);
        const tieneCodigoProveedor = Boolean(codigoProveedorPreferido);

        const codigoPDF = codigoProveedorPreferido
          || payloadInfo.codigoInterno
          || mapping?.alegraReference
          || 'N/A';

        const nombrePDF = nombreProveedorPreferido
          || payloadInfo.nombreInterno
          || mapping?.alegraName
          || 'Sin descripción';

        const origenEtiqueta = tieneMapping
          ? (tieneCodigoProveedor ? 'con_codigo_proveedor' : 'sin_codigo_proveedor')
          : 'sin_mapeo';

        productosEnriquecidos.push({
          codigo_pdf: codigoPDF,
          nombre_pdf: nombrePDF,
          cantidad: payloadInfo.cantidadFinal,
          codigo_interno: payloadInfo.codigoInterno,
          nombre_interno: payloadInfo.nombreInterno,
          confianza: mapping?.confidence || 0,
          factorConversion: payloadInfo.factorConversion,
          origen: origenEtiqueta,
          datosProveedorReales: tieneMapping,
          mappingId: mapping?.id || payloadInfo.mappingId || null
        });
      } catch (mappingError) {
        console.error(`❌ Error buscando mapping para ${producto.codigo || producto.codigoInterno}:`, mappingError.message);
        productosEnriquecidos.push({
          codigo_pdf: producto.codigo || 'N/A',
          nombre_pdf: producto.nombre || 'Sin descripción',
          cantidad: parseInt(producto.cantidad, 10) || 0,
          codigo_interno: producto.codigo || null,
          nombre_interno: producto.nombre || null,
          confianza: 0,
          factorConversion: producto.factorConversion || 1,
          origen: 'error',
          datosProveedorReales: false,
          mappingId: producto.mappingId || producto.mapping_id || null
        });
      }
    }

    // ✅ SEPARAR productos según tengan o no código del proveedor
    const productosConCodigoProveedor = productosEnriquecidos.filter(p =>
      p.origen === 'con_codigo_proveedor' || p.origen === 'interno_manual'
    );
    const productosSinCodigoProveedor = productosEnriquecidos.filter(p => p.origen === 'sin_codigo_proveedor');
    const productosSinMapeo = productosEnriquecidos.filter(p => p.origen === 'sin_mapeo' || p.origen === 'error');

    console.log(`\n📊 RESUMEN DE ENRIQUECIMIENTO:`);
    console.log(`   Con código proveedor: ${productosConCodigoProveedor.length}`);
    console.log(`   Sin código proveedor: ${productosSinCodigoProveedor.length}`);
    console.log(`   Sin mapeo: ${productosSinMapeo.length}`);
    
    console.log(`\n📋 PRODUCTOS FINALES PARA PDF:`);
    productosEnriquecidos.forEach((p, i) => {
      console.log(`   ${i + 1}. "${p.codigo_pdf}" - "${p.nombre_pdf}" x${p.cantidad} [${p.origen}]`);
    });

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

    let yPos = 180;
    let totalUnidades = 0;
    const pageBottom = doc.page.height - doc.page.margins.bottom;

    const drawTableHeader = () => {
    doc.fontSize(12)
      .font('Helvetica-Bold')
      .text('Código', 50, yPos)
      .text('Descripción', 150, yPos)
      .text('Cantidad', 450, yPos);

      yPos += 15;
    doc.moveTo(50, yPos)
      .lineTo(550, yPos)
      .stroke();
    yPos += 10;
      doc.font('Helvetica').fillColor('#000000');
    };

    const startNewPage = () => {
        doc.addPage();
        yPos = 50;
      drawTableHeader();
    };

    const ensureSpace = (needed = 50) => {
      if (yPos + needed > pageBottom) {
        startNewPage();
      }
    };

    const rowHeightForDescription = (descripcion) => {
      const text = descripcion || 'Sin descripción';
      return Math.max(
        doc.heightOfString(text, { width: 280, align: 'left' }),
        14
      );
    };

    const renderProducto = (producto) => {
      const descripcion = producto.nombre_pdf || 'Sin descripción';
      const codigo = producto.codigo_pdf || 'N/A';
      const cantidadTexto = (producto.cantidad ?? 0).toString();

      const rowHeight = rowHeightForDescription(descripcion);
      ensureSpace(rowHeight + 15);

      doc.fontSize(11).font('Helvetica');
      doc.text(codigo, 50, yPos, { width: 80 });
      doc.text(descripcion, 150, yPos, { width: 280 });
      doc.text(cantidadTexto, 450, yPos, { width: 80 });

      yPos += rowHeight + 8;
      totalUnidades += parseInt(producto.cantidad) || 0;
    };

    const renderSeccion = (lista) => {
      lista.forEach(renderProducto);
    };

    const drawSectionLabel = (texto) => {
      ensureSpace(25);
      doc.fontSize(10)
        .font('Helvetica-Oblique')
        .fillColor('#555555')
        .text(texto, 50, yPos);
      doc.fillColor('#000000').font('Helvetica');
      yPos += 15;
    };

    drawTableHeader();

    // ✅ PRIMERO: Productos con código del proveedor
    renderSeccion(productosConCodigoProveedor);

    // ✅ SEGUNDO: Productos sin código del proveedor
    if (productosSinCodigoProveedor.length > 0) {
      drawSectionLabel('Productos sin código del proveedor (usar referencia interna)');
      renderSeccion(productosSinCodigoProveedor);
    }

    // ✅ TERCERO: Productos sin mapeo
    if (productosSinMapeo.length > 0) {
      drawSectionLabel('Productos sin mapeo (datos originales)');
      renderSeccion(productosSinMapeo);
    }

    // Línea separadora final
    ensureSpace(40);
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
    yPos += 40;
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
      alegraReference,  // Código del producto en Alegra (ej: "10053", "E282")
      alegraItemId,     // ID del producto en Alegra (puede ser fallback)
      alegraName,       // Nombre del producto en Alegra
      proveedorId       // ID del proveedor en Alegra
    } = req.body;

    console.log(`🔗 Asignando proveedor manualmente:`, {
      producto: alegraName,
      codigo: alegraReference,
      alegraItemIdRecibido: alegraItemId,
      proveedorId
    });

    const prisma = require('../lib/prisma');

    // 1. 🔍 OBTENER ID REAL DEL PRODUCTO
    // Si alegraItemId es numérico, es el ID real de Alegra → Obtener producto directamente
    // Si NO es numérico, es un fallback al código → Buscar por reference
    console.log(`🔍 Validando alegraItemId recibido: ${alegraItemId} (tipo: ${typeof alegraItemId})`);
    
    let productoAlegra;
    let alegraIdReal;
    
    const esIdNumerico = /^\d+$/.test(alegraItemId?.toString());
    
    if (esIdNumerico) {
      // CASO 1: alegraItemId es un número → Es el ID real de Alegra
      console.log(`✅ alegraItemId es numérico (${alegraItemId}) → Obteniendo producto directamente...`);
      
      try {
        const response = await alegraService.api.get(`/items/${alegraItemId}`);
        productoAlegra = response.data;
        alegraIdReal = productoAlegra.id;
        
        console.log(`✅ Producto obtenido de Alegra:`);
        console.log(`   ID: ${alegraIdReal}`);
        console.log(`   Reference: ${productoAlegra.reference?.reference || productoAlegra.reference}`);
        console.log(`   Nombre: ${productoAlegra.name}`);
      } catch (error) {
        console.error(`❌ Error obteniendo producto ${alegraItemId}:`, error.response?.data?.message || error.message);
        console.warn(`   Usando alegraItemId como fallback: ${alegraItemId}`);
        alegraIdReal = alegraItemId;
      }
    } else {
      // CASO 2: alegraItemId NO es numérico → Es un código, buscar por reference
      console.log(`⚠️ alegraItemId NO es numérico ("${alegraItemId}") → Buscando por reference...`);
      
      try {
        const itemsResponse = await alegraService.api.get('/items', {
          params: {
            query: alegraReference,
            limit: 30
          }
        });
        
        const items = itemsResponse.data;
        productoAlegra = items.find(item => {
          const itemReference = typeof item.reference === 'object' 
            ? item.reference?.reference 
            : item.reference;
          
          return itemReference === alegraReference;
        });
        
        if (productoAlegra) {
          alegraIdReal = productoAlegra.id;
          console.log(`✅ Producto encontrado en Alegra:`);
          console.log(`   ID real: ${alegraIdReal}`);
          console.log(`   Reference: ${alegraReference}`);
          console.log(`   Nombre: ${productoAlegra.name}`);
        } else {
          console.warn(`⚠️ No se encontró producto con reference="${alegraReference}"`);
          console.warn(`   Usando alegraItemId recibido como fallback: ${alegraItemId}`);
          alegraIdReal = alegraItemId;
        }
      } catch (searchError) {
        console.error(`❌ Error buscando producto:`, searchError.message);
        console.warn(`   Usando alegraItemId recibido como fallback: ${alegraItemId}`);
        alegraIdReal = alegraItemId;
      }
    }

    // 2. Obtener información del proveedor de Alegra
    const proveedorResponse = await alegraService.api.get(`/contacts/${proveedorId}`);
    const proveedor = proveedorResponse.data;

    console.log(`✅ Proveedor encontrado:`, proveedor.name);

    // 3. Crear o actualizar el mapping manual con el ID REAL
    const mapping = await prisma.supplierProductMapping.upsert({
      where: {
        supplierCedula_supplierCode: {
          supplierCedula: proveedor.identification || 'SIN_CEDULA',
          supplierCode: alegraReference
        }
      },
      update: {
        supplierName: proveedor.name.trim(),
        alegraItemId: alegraIdReal,  // ✅ Usar ID REAL de Alegra
        alegraReference: alegraReference,
        alegraName: productoAlegra?.name || alegraName,  // Usar nombre de Alegra si está disponible
        origen: 'manual',
        lastUsedDate: new Date(),
        timesUsed: {
          increment: 1
        }
      },
      create: {
        supplierName: proveedor.name.trim(),
        supplierCedula: proveedor.identification || 'SIN_CEDULA',
        supplierCode: alegraReference,
        supplierDesc: productoAlegra?.name || alegraName,
        alegraItemId: alegraIdReal,  // ✅ Usar ID REAL de Alegra
        alegraReference: alegraReference,
        alegraName: productoAlegra?.name || alegraName,
        confidence: 100,
        origen: 'manual',
        timesUsed: 1
      }
    });

    console.log(`✅ Relación manual creada: ${alegraName} → ${proveedor.name}`);
    console.log(`   Mapping ID: ${mapping.id}`);
    console.log(`   alegraItemId: ${mapping.alegraItemId} (ID real de Alegra)`);
    console.log(`   alegraReference: ${mapping.alegraReference} (código interno)`);

    // 4. 👤 ACTUALIZAR FALTANTES con asignación manual
    const { asignarProveedorManual } = require('../services/proveedorAsignacionService');
    const faltantesActualizados = await asignarProveedorManual(
      alegraReference,
      alegraIdReal,
      proveedor.name.trim(),
      proveedor.identification || 'SIN_CEDULA',
      mapping.id
    );

    console.log(`📋 ${faltantesActualizados} faltante(s) actualizados con asignación manual`);

    res.json({
      success: true,
      data: mapping,
      faltantes_actualizados: faltantesActualizados,
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
  const { asignarProveedorManual } = require('../services/proveedorAsignacionService');

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

    // 2. 🔍 OBTENER ID REAL DEL PRODUCTO
    console.log(`🔍 Validando alegraItemId recibido: ${alegraItemId} (tipo: ${typeof alegraItemId})`);
    
    let productoAlegra;
    let alegraIdReal;
    
    const esIdNumerico = /^\d+$/.test(alegraItemId?.toString());
    
    if (esIdNumerico) {
      // CASO 1: alegraItemId es un número → Es el ID real de Alegra
      console.log(`✅ alegraItemId es numérico (${alegraItemId}) → Obteniendo producto directamente...`);
      
      try {
        const response = await alegraService.api.get(`/items/${alegraItemId}`);
        productoAlegra = response.data;
        alegraIdReal = productoAlegra.id;
        
        console.log(`✅ Producto obtenido de Alegra:`);
        console.log(`   ID: ${alegraIdReal}`);
        console.log(`   Reference: ${productoAlegra.reference?.reference || productoAlegra.reference}`);
        console.log(`   Nombre: ${productoAlegra.name}`);
      } catch (error) {
        console.error(`❌ Error obteniendo producto ${alegraItemId}:`, error.response?.data?.message || error.message);
        console.warn(`   Usando alegraItemId como fallback: ${alegraItemId}`);
        alegraIdReal = alegraItemId || alegraReference;
      }
    } else {
      // CASO 2: alegraItemId NO es numérico → Es un código, buscar por reference
      console.log(`⚠️ alegraItemId NO es numérico ("${alegraItemId}") → Buscando por reference...`);
      
      try {
        const itemsResponse = await alegraService.api.get('/items', {
          params: {
            query: alegraReference,
            limit: 30
          }
        });
        
        const items = itemsResponse.data;
        productoAlegra = items.find(item => {
          const itemReference = typeof item.reference === 'object' 
            ? item.reference?.reference 
            : item.reference;
          
          return itemReference === alegraReference;
        });
        
        if (productoAlegra) {
          alegraIdReal = productoAlegra.id;
          console.log(`✅ Producto encontrado en Alegra:`);
          console.log(`   ID real: ${alegraIdReal}`);
          console.log(`   Reference: ${alegraReference}`);
          console.log(`   Nombre: ${productoAlegra.name}`);
        } else {
          console.warn(`⚠️ No se encontró producto con reference="${alegraReference}"`);
          console.warn(`   Usando alegraItemId recibido como fallback: ${alegraItemId}`);
          alegraIdReal = alegraItemId || alegraReference;
        }
      } catch (searchError) {
        console.error(`❌ Error buscando producto:`, searchError.message);
        console.warn(`   Usando alegraItemId recibido como fallback: ${alegraItemId}`);
        alegraIdReal = alegraItemId || alegraReference;
      }
    }

    // 3. Obtener información del nuevo proveedor de Alegra
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

    // 4. Verificar si el producto ya está asignado a este proveedor
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
          alegraItemId: alegraIdReal,  // ✅ Usar ID REAL de Alegra
          alegraName: productoAlegra?.name || alegraName,
          confidence: MANUAL_MAPPING_CONFIDENCE,
          origen: 'manual',
          lastUsedDate: new Date(),
          timesUsed: {
            increment: 1
          }
        }
      });

      // 💡 IMPORTANTE: Aunque ya existía el mapping, debemos actualizar TODOS los faltantes
      // para que la reasignación manual tenga prioridad real en el reporte.
      const faltantesActualizados = await asignarProveedorManual(
        alegraReference,
        alegraIdReal,
        nuevoProveedor.name.trim(),
        nuevaCedula,
        mappingActualizado.id
      );

      console.log(`📋 ${faltantesActualizados} faltante(s) reforzados con asignación manual existente`);

      return res.json({
        success: true,
        data: {
          proveedorAnterior: mappingsExistentes.length > 0 ? mappingsExistentes[0].supplierName : nuevoProveedor.name,
          nuevoProveedor: nuevoProveedor.name,
          mapping: mappingActualizado,
          faltantes_actualizados: faltantesActualizados,
          mensaje: 'Proveedor ya existía, se reforzó la asignación manual'
        },
        message: `Producto reasignado manualmente a ${nuevoProveedor.name}`
      });
    }

    // 4. Crear o actualizar mapping con el nuevo proveedor (sin eliminar históricos)
    console.log('🔄 Actualizando mapping manual prioritario...');
    let nuevoMapping;
      try {
      nuevoMapping = await prisma.supplierProductMapping.upsert({
          where: {
          supplierCedula_supplierCode: {
            supplierCedula: nuevaCedula,
            supplierCode: alegraReference
          }
        },
        update: {
          supplierName: nuevoProveedor.name.trim(),
          supplierDesc: productoAlegra?.name || alegraName,
          alegraItemId: alegraIdReal,
          alegraReference: alegraReference,
          alegraName: productoAlegra?.name || alegraName,
          confidence: MANUAL_MAPPING_CONFIDENCE,
          origen: 'manual',
          lastUsedDate: new Date(),
          timesUsed: {
            increment: 1
          }
        },
        create: {
          supplierName: nuevoProveedor.name.trim(),
          supplierCedula: nuevaCedula,
          supplierCode: alegraReference,
          supplierDesc: productoAlegra?.name || alegraName,
          alegraItemId: alegraIdReal,
          alegraReference: alegraReference,
          alegraName: productoAlegra?.name || alegraName,
          confidence: MANUAL_MAPPING_CONFIDENCE,
          origen: 'manual',
          timesUsed: mappingsExistentes.length > 0 ? mappingsExistentes[0].timesUsed : 1
        }
      });
      console.log(`✅ Mapping manual prioritario listo: ${nuevoMapping.id}`);
    } catch (createError) {
      console.error('❌ Error creando/actualizando mapping:', createError.message);
      throw new Error(`Error creando/actualizando mapping: ${createError.message}`);
    }

    console.log(`✅ Producto reasignado: ${alegraName} → ${nuevoProveedor.name}`);

    // 5. 👤 ACTUALIZAR FALTANTES con asignación manual
    const faltantesActualizados = await asignarProveedorManual(
      alegraReference,
      alegraIdReal,
      nuevoProveedor.name.trim(),
      nuevaCedula,
      nuevoMapping.id
    );

    console.log(`📋 ${faltantesActualizados} faltante(s) actualizados con asignación manual`);

    res.json({
      success: true,
      data: {
        proveedorAnterior: mappingsExistentes.length > 0 ? mappingsExistentes[0].supplierName : 'Sin_Proveedor',
        nuevoProveedor: nuevoProveedor.name,
        mapping: nuevoMapping,
        mappingsEliminados: mappingsExistentes.length,
        faltantes_actualizados: faltantesActualizados
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

// Endpoint de diagnóstico: Ver todos los mappings de un producto
router.get('/faltantes/diagnostico/:alegraReference', async (req, res) => {
  try {
    const { alegraReference } = req.params;
    const prisma = require('../lib/prisma');

    console.log(`🔍 Diagnóstico para producto: ${alegraReference}`);

    // Buscar TODOS los mappings de este producto
    const mappings = await prisma.supplierProductMapping.findMany({
      where: {
        alegraReference: alegraReference
      },
      orderBy: {
        createdDate: 'desc'
      }
    });

    console.log(`📋 Encontrados ${mappings.length} mapping(s) para ${alegraReference}:`);
    mappings.forEach((m, idx) => {
      console.log(`   ${idx + 1}. ${m.supplierName} (${m.supplierCedula}) - creado: ${m.createdDate}`);
    });

    res.json({
      success: true,
      alegraReference: alegraReference,
      totalMappings: mappings.length,
      mappings: mappings.map(m => ({
        id: m.id,
        supplierName: m.supplierName,
        supplierCedula: m.supplierCedula,
        supplierCode: m.supplierCode,
        alegraReference: m.alegraReference,
        alegraName: m.alegraName,
        origen: m.origen,
        timesUsed: m.timesUsed,
        createdDate: m.createdDate,
        lastUsedDate: m.lastUsedDate
      }))
    });

  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para limpiar mappings duplicados de un producto
router.post('/faltantes/limpiar-duplicados/:alegraReference', async (req, res) => {
  try {
    const { alegraReference } = req.params;
    const { mantenerProveedorId } = req.body; // ID del proveedor que queremos mantener
    const prisma = require('../lib/prisma');

    console.log(`🧹 Limpiando duplicados para: ${alegraReference}`);
    console.log(`   Mantener proveedor con ID Alegra: ${mantenerProveedorId}`);

    // 1. Buscar TODOS los mappings
    const mappings = await prisma.supplierProductMapping.findMany({
      where: {
        alegraReference: alegraReference
      }
    });

    console.log(`📋 Encontrados ${mappings.length} mapping(s)`);

    if (mappings.length === 0) {
      return res.json({
        success: true,
        message: 'No hay mappings para este producto',
        eliminados: 0
      });
    }

    // 2. Si se especificó un proveedor, obtener su cédula
    let cedulaAMantener = null;
    if (mantenerProveedorId) {
      const alegraService = require('../services/alegraService');
      try {
        const proveedorResponse = await alegraService.api.get(`/contacts/${mantenerProveedorId}`);
        cedulaAMantener = proveedorResponse.data.identification || 'SIN_CEDULA';
        console.log(`✅ Mantener mapping de: ${proveedorResponse.data.name} (${cedulaAMantener})`);
      } catch (error) {
        console.error('❌ Error obteniendo proveedor de Alegra:', error.message);
      }
    }

    // 3. Determinar cuál mantener
    let mappingAMantener;
    if (cedulaAMantener) {
      // Mantener el del proveedor especificado
      mappingAMantener = mappings.find(m => m.supplierCedula === cedulaAMantener);
    }

    if (!mappingAMantener) {
      // Mantener el más reciente (manual si existe)
      mappingAMantener = mappings.find(m => m.origen === 'manual') || mappings[0];
    }

    console.log(`✅ Se mantendrá: ${mappingAMantener.supplierName} (ID: ${mappingAMantener.id})`);

    // 4. Eliminar todos los demás
    const idsAEliminar = mappings
      .filter(m => m.id !== mappingAMantener.id)
      .map(m => m.id);

    if (idsAEliminar.length > 0) {
      const deleteResult = await prisma.supplierProductMapping.deleteMany({
        where: {
          id: {
            in: idsAEliminar
          }
        }
      });

      console.log(`🗑️ Eliminados ${deleteResult.count} mapping(s) duplicado(s)`);
    }

    res.json({
      success: true,
      message: `Producto limpio. Mantenido: ${mappingAMantener.supplierName}`,
      eliminados: idsAEliminar.length,
      mantenido: {
        supplierName: mappingAMantener.supplierName,
        supplierCedula: mappingAMantener.supplierCedula
      }
    });

  } catch (error) {
    console.error('❌ Error limpiando duplicados:', error);
    res.status(500).json({
      success: false,
      error: error.message
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