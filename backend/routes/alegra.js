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
const { getContactService } = require('../src/integrations/alegra');
const contactService = getContactService();

// Importar los nuevos enrutadores modulares
const productsRoutes = require('../src/modules/products');
const invoicesRoutes = require('../src/modules/invoices');
const reportsRoutes = require('../src/modules/reports');
const ordersWhatsappRoutes = require('../src/modules/orders-whatsapp');
const reprintingRoutes = require('../src/modules/reprinting').routes;
const warehouseRoutes = require('../src/modules/warehouse').routes;
const missingItemsRoutes = require('../src/modules/missing-items').routes;
const facturacionRoutes = require('../src/modules/facturacion');
const catalogRoutes = require('./alegraCatalog');

// Importar controladores para mapeo explícito de endpoints legacy
const ProductController = require('../src/modules/products/product.controller');
const ReportController = require('../src/modules/reports/report.controller');

const productController = new ProductController();
const reportController = new ReportController();

// ========================================
// 0. MODULO DE GESTIÓN DE CATÁLOGO (/catalog)
// ========================================
router.use('/catalog', catalogRoutes);

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
    const result = await contactService.getContacts(page, limit, type);
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
// 5.5. MODULO DE PROVEEDORES (/proveedores)
// ========================================
router.get('/proveedores', async (req, res) => {
  try {
    const { busqueda, limit } = req.query;
    const result = await alegraService.getProveedores(busqueda, limit);
    if (result.success) {
      res.json(result);
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

// ========================================
// 9. MODULO DE FACTURACIÓN RÁPIDA (/facturacion)
// ========================================
router.use('/facturacion', facturacionRoutes);

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