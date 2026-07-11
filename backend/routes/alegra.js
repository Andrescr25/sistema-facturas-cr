/**
 * Enrutador Adaptador para Alegra (Legacy Adapter Router)
 * Redirige los endpoints monolíticos legacy de /api/alegra hacia los nuevos módulos modulares.
 * Esto garantiza compatibilidad absoluta con el frontend sin duplicar lógica.
 */

const express = require('express');
const router = express.Router();

const { query } = require('../config/database');
const { getContactService, getInvoiceService, getProductService, getSyncService } = require('../src/integrations/alegra');
const contactService = getContactService();
const invoiceService = getInvoiceService();
const productService = getProductService();
const syncService = getSyncService();

// Importar los nuevos enrutadores modulares
const productsRoutes = require('../src/modules/products');
const invoicesRoutes = require('../src/modules/invoices');
const reportsRoutes = require('../src/modules/reports');
const ordersWhatsappRoutes = require('../src/modules/orders-whatsapp');
const reprintingRoutes = require('../src/modules/reprinting').routes;
const warehouseRoutes = require('../src/modules/warehouse').routes;
const missingItemsRoutes = require('../src/modules/missing-items').routes;
const facturacionRoutes = require('../src/modules/facturacion');
const catalogRoutes = require('../src/modules/catalogo').routes;

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

// Categorías de productos (item-categories) — usado por RelacionarProductos.jsx
router.get('/categorias', async (req, res) => {
  try {
    const categorias = await productService.getItemCategories();

    if (categorias.length > 0) {
      res.json({ success: true, categorias });
    } else {
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

// Sincronización automática (Alegra API)
router.post('/sincronizar/automatica', async (req, res) => {
  try {
    const result = await syncService.syncProductsAutomatically();
    res.json(result);
  } catch (error) {
    console.error('❌ Error en sincronización automática:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sincronizar cache de productos
router.post('/sincronizar/cache-productos', async (req, res) => {
  try {
    const result = await syncService.syncProductsCache();
    res.json(result);
  } catch (error) {
    console.error('❌ Error en sincronización de caché:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// 2. MODULO DE FACTURAS Y BODEGA (/facturas)
// ========================================

// IMPORTANTE: este PUT se registra ANTES de montar invoicesRoutes.
// invoicesRoutes también define PUT /:id (updateInvoiceLocal), que solo
// actualiza el flag "procesada" en la BD local por id local — un propósito
// completamente distinto que quedaba ganando por orden de registro y
// devolvía 404 al editar facturas reales en Alegra. Este es el que edita
// la factura EN ALEGRA (lo usa facturacionService.js al sincronizar
// ediciones pendientes, con el id numérico de Alegra).
router.put('/facturas/:id', async (req, res) => {
  try {
    const result = await invoiceService.updateInvoice(req.params.id, req.body);
    if (result.success) {
      res.json({ success: true, data: result.data, message: 'Factura actualizada exitosamente' });
    } else {
      // result.data trae el body de error real de Alegra ({ message, code }), p.ej.
      // code 3070 "La factura de venta no se puede editar". El frontend
      // (facturacionService.sincronizarEdicionesPendientes) usa ese code para
      // descartar automáticamente ediciones que Alegra rechaza por regla de
      // negocio en vez de reintentarlas para siempre — antes se perdía porque
      // aquí solo se mandaba un mensaje genérico sin code ni details.
      res.status(400).json({
        success: false,
        message: result.data?.message || result.error || 'Error actualizando',
        code: result.data?.code,
        details: result.data
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.use('/facturas', invoicesRoutes);
router.use('/bodega', warehouseRoutes);

// Endpoints legacy para operaciones CRUD de items de factura
router.get('/facturas/:id', async (req, res) => {
  try {
    const result = await invoiceService.getInvoiceById(req.params.id);
    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.status(404).json({ success: false, message: 'Factura no encontrada' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// NOTA: aquí vivían 7 endpoints (DELETE/PUT .../items/:itemId, POST
// /facturas/limpiar, /actualizar-masivo, /:id/pendiente (POST y DELETE),
// /eliminar-procesadas) que llamaban métodos que nunca existieron en
// ningún servicio (removeItemFromInvoice, updateItemQuantity,
// clearAllQueues, updateInvoicesBulk, setPendingStatus,
// deletePendingStatus, clearProcessedLogs) — siempre daban 500 y no
// tenían ningún consumidor en el frontend (verificado con grep). Se
// eliminaron el 2026-07-10 al retirar el servicio legacy que los
// referenciaba.

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
    const result = await contactService.getProveedores(busqueda, limit);
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