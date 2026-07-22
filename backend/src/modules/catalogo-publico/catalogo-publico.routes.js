/**
 * Catalogo Publico Module - Routes
 * Rutas para el catálogo público de solo lectura (montadas en /api/catalogo-publico)
 */

const express = require('express');
const router = express.Router();
const catalogoPublicoController = require('./catalogo-publico.controller');

router.get('/productos', catalogoPublicoController.listarProductos);
router.get('/categorias', catalogoPublicoController.listarCategorias);
router.get('/ofertas', catalogoPublicoController.listarOfertas);

module.exports = router;
