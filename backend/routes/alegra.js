/**
 * Enrutador Adaptador para Alegra (Legacy Adapter Router)
 * Redirige los endpoints monolíticos legacy de /api/alegra hacia los nuevos módulos modulares.
 * Esto garantiza compatibilidad absoluta con el frontend sin duplicar lógica.
 */

const express = require('express');
const router = express.Router();

const { query } = require('../config/database');
const { getContactService, getProductService, getSyncService } = require('../src/integrations/alegra');
const contactService = getContactService();
const productService = getProductService();
const syncService = getSyncService();

// Importar los nuevos enrutadores modulares
const productsRoutes = require('../src/modules/products');
const reportsRoutes = require('../src/modules/reports');
const ordersWhatsappRoutes = require('../src/modules/orders-whatsapp');
const reprintingRoutes = require('../src/modules/reprinting').routes;
const warehouseRoutes = require('../src/modules/warehouse').routes;
const missingItemsRoutes = require('../src/modules/missing-items').routes;

// Importar controladores para mapeo explícito de endpoints legacy
const ProductController = require('../src/modules/products/product.controller');

const productController = new ProductController();

// La Gestión de Catálogo vieja (/catalog) se retiró el 2026-10-04: el catálogo
// es el maestro propio (/maestro), y lo poco que las pantallas seguían usando
// de acá —fotos sugeridas, su miniatura, la foto de cada línea de Bodega—
// pasó a /catalogos.

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
// 2. BODEGA (/bodega)
// ========================================

// Acá vivían las facturas de Alegra: `PUT /facturas/:id` (editar la factura
// EN ALEGRA), `GET /facturas/:id` (leerla de allá) y el módulo viejo
// `invoices` montado en `/facturas`. Se retiraron el 2026-10-04: Facturación
// crea, edita, imprime y busca por `/api/facturacion/facturas`, sobre la
// factura propia, y ya no quedaba pantalla que las llamara. Con ellas se fue
// la última forma de modificar una factura de Alegra desde este sistema.
router.use('/bodega', warehouseRoutes);

// ========================================
// 3. MODULO DE REIMPRESIÓN (/reimpresion)
// ========================================
router.use('/reimpresion', reprintingRoutes);

// ========================================
// 4. MODULO DE REPORTES Y HISTORIAL (/reportes)
// ========================================
// El alias `/facturas/historial-procesamientos` se retiró el 2026-10-04: lo
// tapaba el `GET /facturas/:id` del módulo viejo (nunca respondió) y nadie lo
// llamaba. El historial sigue en `/reportes/historial`.
router.use('/reportes', reportsRoutes);

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

// Facturación ya NO se monta acá: pasó a /api/facturacion (ver server.js).
// Debajo de /alegra quedaba sin permiso, porque ese prefijo es compartido —
// cualquiera con sesión podía llamar hasta el POST que crea la factura. El
// mismo arreglo ya está en producción.

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