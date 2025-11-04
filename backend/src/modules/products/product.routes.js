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

// Obtener productos sin proveedor
router.get('/sin-proveedor', productController.getProductsWithoutSupplier);

// Asignar proveedor a producto
router.put('/:id/proveedor', productController.assignSupplier);

// Sincronizar productos
router.post('/sincronizar', productController.syncProducts);

// Obtener estadísticas
router.get('/estadisticas/sincronizacion', productController.getSyncStatistics);

module.exports = router;
