/**
 * Rutas del módulo de Productos
 */

const express = require('express');
const ProductController = require('./product.controller');

const router = express.Router();
const productController = new ProductController();

// Obtener productos
router.get('/', productController.getProducts);

// Buscar productos
router.get('/buscar', productController.searchProducts);

// Crear producto local
router.post('/', productController.createProductLocal);

// Obtener productos sin proveedor
router.get('/sin-proveedor', productController.getProductsWithoutSupplier);

// Obtener estadísticas
router.get('/estadisticas/sincronizacion', productController.getSyncStatistics);

// Buscar productos locales
router.get('/buscar/:termino', productController.searchProductsLocal);

// Obtener productos por proveedor
router.get('/proveedor/:proveedor_id', productController.getProductsBySupplierLocal);

// Asignar proveedor a producto
router.put('/:id/proveedor', productController.assignSupplier);

// Sincronizar productos
router.post('/sincronizar', productController.syncProducts);

// Obtener un producto local específico (al final)
router.get('/:id', productController.getProductLocal);

module.exports = router;
