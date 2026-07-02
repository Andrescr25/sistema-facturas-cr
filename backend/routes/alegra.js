/**
 * Enrutador Adaptador para Alegra (Legacy Adapter Router)
 * Redirige los endpoints monolíticos legacy de /api/alegra hacia los nuevos módulos modulares.
 * Esto garantiza compatibilidad absoluta con el frontend sin duplicar lógica.
 */

const express = require('express');
const router = express.Router();

const AlegraService = require('../services/alegraService');
const alegraService = new AlegraService();
const { query } = require('../config/database');

// Importar los nuevos enrutadores modulares
const productsRoutes = require('../src/modules/products');
const invoicesRoutes = require('../src/modules/invoices');
const reportsRoutes = require('../src/modules/reports');
const ordersWhatsappRoutes = require('../src/modules/orders-whatsapp');
const reprintingRoutes = require('../src/modules/reprinting').routes;
const warehouseRoutes = require('../src/modules/warehouse').routes;
const missingItemsRoutes = require('../src/modules/missing-items').routes;

// Importar controladores para mapeo explícito de endpoints legacy
const ProductController = require('../src/modules/products/product.controller');
const ReportController = require('../src/modules/reports/report.controller');

const productController = new ProductController();
const reportController = new ReportController();

// ========================================
// 1. MODULO DE PRODUCTOS (/productos)
// ========================================
router.use('/productos', productsRoutes);
router.post('/sincronizar/productos', productController.syncProducts);
router.get('/estadisticas/sincronizacion', productController.getSyncStatistics);

// Sincronización automática (Alegra API)
router.post('/sincronizar/automatica', async (req, res) => {
  try {
    const result = await alegraService.syncProductsAutomatically();
    res.json(result);
  } catch (error) {
    console.error('❌ Error en sincronización automática:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sincronizar cache de productos
router.post('/sincronizar/cache-productos', async (req, res) => {
  try {
    const result = await alegraService.syncProductsCache();
    res.json(result);
  } catch (error) {
    console.error('❌ Error en sincronización de caché:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// 2. MODULO DE FACTURAS Y BODEGA (/facturas)
// ========================================
router.use('/facturas', invoicesRoutes);
router.use('/bodega', warehouseRoutes);

// Endpoints legacy para operaciones CRUD de items de factura
router.get('/facturas/:id', async (req, res) => {
  try {
    const result = await alegraService.getInvoiceById(req.params.id);
    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.status(404).json({ success: false, message: 'Factura no encontrada' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/facturas/:id', async (req, res) => {
  try {
    const result = await alegraService.updateInvoice(req.params.id, req.body);
    if (result.success) {
      res.json({ success: true, data: result.data, message: 'Factura actualizada exitosamente' });
    } else {
      res.status(400).json({ success: false, message: result.message || 'Error actualizando' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/facturas/:id/items/:itemId', async (req, res) => {
  try {
    const result = await alegraService.removeItemFromInvoice(req.params.id, req.params.itemId);
    if (result.success) {
      res.json({ success: true, data: result.data, message: 'Producto eliminado de la factura' });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/facturas/:id/items/:itemId', async (req, res) => {
  try {
    const { cantidad } = req.body;
    const result = await alegraService.updateItemQuantity(req.params.id, req.params.itemId, cantidad);
    if (result.success) {
      res.json({ success: true, data: result.data, message: `Cantidad actualizada a ${cantidad}` });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Limpieza de colas / Logs de procesamiento
router.post('/facturas/limpiar', async (req, res) => {
  try {
    const result = await alegraService.clearAllQueues(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/facturas/actualizar-masivo', async (req, res) => {
  try {
    const result = await alegraService.updateInvoicesBulk(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/facturas/:id/pendiente', async (req, res) => {
  try {
    const result = await alegraService.setPendingStatus(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/facturas/:id/pendiente', async (req, res) => {
  try {
    const result = await alegraService.deletePendingStatus(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/facturas/eliminar-procesadas', async (req, res) => {
  try {
    const result = await alegraService.clearProcessedLogs(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// 3. MODULO DE REIMPRESIÓN (/reimpresion)
// ========================================
router.use('/reimpresion', reprintingRoutes);

// ========================================
// 4. MODULO DE REPORTES Y HISTORIAL (/reportes)
// ========================================
router.use('/reportes', reportsRoutes);
router.get('/facturas/historial-procesamientos', reportController.getProcessingHistory);

// ========================================
// 5. MODULO DE CONTACTOS (/contactos)
// ========================================
router.get('/contactos', async (req, res) => {
  try {
    const { page = 1, limit = 30, type } = req.query;
    const result = await alegraService.getContacts(page, limit, type);
    if (result.success) {
      res.json({ success: true, data: result.data, pagination: result.pagination });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// 6. MODULO DE FALTANTES / AJUSTES (/faltantes)
// ========================================
router.use('/faltantes', missingItemsRoutes);

// ========================================
// 7. MODULO DE ORDENES DE COMPRA Y WHATSAPP (/orden-compra)
// ========================================
router.use('/orden-compra', ordersWhatsappRoutes);
router.use('/proveedor-contacto', ordersWhatsappRoutes);

// ========================================
// 9. MODULO DE FACTURACIÓN RÁPIDA (/facturacion)
// ========================================

// Obtener todos los productos de Alegra para cache offline
router.get('/facturacion/items', async (req, res) => {
  try {
    console.log('📦 Obteniendo todos los productos de Alegra para cache...');
    const allItems = [];
    let page = 1;
    const limit = 30;
    let hasMore = true;

    while (hasMore) {
      const response = await alegraService.makeRequest('GET', '/items', {
        start: (page - 1) * limit,
        limit: limit
      });
      if (response && response.length > 0) {
        allItems.push(...response);
        page++;
        if (response.length < limit) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    res.json({
      success: true,
      data: allItems,
      total: allItems.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error obteniendo items de Alegra:', error);
    res.status(500).json({ success: false, error: error.message, message: 'Error obteniendo productos' });
  }
});

// Obtener todos los contactos (clientes y proveedores)
router.get('/facturacion/contacts', async (req, res) => {
  try {
    console.log('👥 Obteniendo todos los contactos de Alegra...');
    const allContacts = [];
    let page = 1;
    const limit = 30;
    let hasMore = true;

    while (hasMore) {
      const response = await alegraService.makeRequest('GET', '/contacts', {
        start: (page - 1) * limit,
        limit: limit
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

    res.json({
      success: true,
      data: allContacts,
      total: allContacts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error obteniendo contacts de Alegra:', error);
    res.status(500).json({ success: false, error: error.message, message: 'Error obteniendo clientes' });
  }
});

// Crear factura en Alegra y guardarla en bodega (pendiente)
router.post('/facturacion/invoices', async (req, res) => {
  try {
    const invoiceData = req.body;
    console.log('🧾 Creando factura en Alegra:', {
      cliente: invoiceData.client,
      items: invoiceData.items?.length
    });

    const response = await alegraService.makeRequest('POST', '/invoices', invoiceData);
    console.log('✅ Factura creada exitosamente:', response.id);

    try {
      const numeroFactura = response.numberTemplate?.fullNumber || 
                            response.numberTemplate?.formattedNumber || 
                            response.id?.toString();
      const alegraId = parseInt(response.id, 10);
      const clienteNombre = response.client?.name || 'Cliente no especificado';
      const clienteEmail = response.client?.email || null;
      const fechaEmision = response.date || new Date().toISOString().split('T')[0];
      const total = parseFloat(response.total || 0);

      const fecha = new Date(fechaEmision);
      const startOfYear = new Date(fecha.getFullYear(), 0, 1);
      const dayOfYear = Math.floor((fecha - startOfYear) / (24 * 60 * 60 * 1000));
      const semana = Math.max(1, Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7));
      const mes = fecha.getMonth() + 1;
      const ano = fecha.getFullYear();

      await query(`
        INSERT INTO facturas (
          numero_factura, alegra_id, cliente_nombre, cliente_email,
          fecha_emision, semana, mes, ano, total, estado_bodega
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendiente')
        ON CONFLICT (numero_factura) DO UPDATE SET
          alegra_id = EXCLUDED.alegra_id,
          cliente_nombre = EXCLUDED.cliente_nombre,
          cliente_email = EXCLUDED.cliente_email,
          fecha_emision = EXCLUDED.fecha_emision,
          semana = EXCLUDED.semana,
          mes = EXCLUDED.mes,
          ano = EXCLUDED.ano,
          total = EXCLUDED.total
      `, [numeroFactura, alegraId, clienteNombre, clienteEmail, fechaEmision, semana, mes, ano, total]);

      console.log(`📦 Factura ${numeroFactura} registrada en BD local con estado_bodega='pendiente'`);
    } catch (dbError) {
      console.error('⚠️ Error registrando factura en BD local (no crítico):', dbError.message);
    }

    res.json({ success: true, data: response, message: 'Factura creada exitosamente' });
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

// Obtener PDF de una factura
router.get('/facturacion/invoices/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📄 Obteniendo PDF de factura ${id}...`);
    const pdfResponse = await alegraService.makeRequest('GET', `/invoices/${id}/pdf`);

    if (pdfResponse.pdf) {
      res.json({ success: true, pdfUrl: pdfResponse.pdf, invoiceId: id });
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=factura-${id}.pdf`);
      res.send(pdfResponse);
    }
  } catch (error) {
    console.error('❌ Error obteniendo PDF de factura:', error);
    res.status(500).json({ success: false, error: error.message, message: 'Error obteniendo PDF' });
  }
});

// Obtener impuestos
router.get('/facturacion/taxes', async (req, res) => {
  try {
    console.log('💰 Obteniendo impuestos de Alegra...');
    const taxes = await alegraService.makeRequest('GET', '/taxes');
    res.json({ success: true, data: taxes });
  } catch (error) {
    console.error('❌ Error obteniendo impuestos:', error);
    res.status(500).json({ success: false, error: error.message, message: 'Error obteniendo impuestos de Alegra' });
  }
});

// Obtener métodos de pago
router.get('/facturacion/payment-methods', async (req, res) => {
  try {
    console.log('💳 Obteniendo métodos de pago de Alegra...');
    const paymentMethods = [
      { id: 'cash', name: 'Efectivo', type: 'cash' },
      { id: 'credit-card', name: 'Tarjeta de Crédito', type: 'credit-card' },
      { id: 'debit-card', name: 'Tarjeta de Débito', type: 'debit-card' },
      { id: 'transfer', name: 'Transferencia Bancaria', type: 'transfer' },
      { id: 'check', name: 'Cheque', type: 'check' }
    ];
    res.json({ success: true, data: paymentMethods });
  } catch (error) {
    console.error('❌ Error obteniendo métodos de pago:', error);
    res.status(500).json({ success: false, error: error.message, message: 'Error obteniendo métodos de pago' });
  }
});

// ========================================
// 8. ENDPOINTS DE DEBUG / PRUEBAS
// ========================================
router.get('/debug/test-simple', async (req, res) => {
  res.json({ success: true, message: 'API Alegra Legacy Adapter is alive' });
});

router.get('/debug/database', async (req, res) => {
  try {
    const result = await query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;