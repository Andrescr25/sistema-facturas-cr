/**
 * Catalogo Publico Module - Routes
 * Rutas para el catálogo público de solo lectura (montadas en /api/catalogo-agente)
 */

const express = require('express');
const router = express.Router();
const catalogoAgenteController = require('./catalogo-agente.controller');

router.get('/productos', catalogoAgenteController.listarProductos);
router.get('/categorias', catalogoAgenteController.listarCategorias);
router.get('/ofertas', catalogoAgenteController.listarOfertas);
router.get('/historial-clientes', catalogoAgenteController.obtenerHistorialClientes);
router.post('/historial-clientes/sync', catalogoAgenteController.sincronizarHistorialClientes);

module.exports = router;
