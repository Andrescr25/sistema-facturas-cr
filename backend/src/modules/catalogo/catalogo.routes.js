/**
 * Catalogo Module - Routes
 * Rutas para la gestión de catálogo de productos (montadas en
 * /api/alegra/catalog vía el adaptador routes/alegra.js)
 */

const express = require('express');
const router = express.Router();
const catalogoController = require('./catalogo.controller');

router.get('/productos', catalogoController.listarProductos);
router.get('/search-images', catalogoController.buscarImagenes);
router.get('/image-proxy', catalogoController.proxyImagen);
router.post('/upload-image-url', catalogoController.asignarImagenDesdeUrl);
router.post('/duplicate-brand', catalogoController.duplicarConMarca);
router.put('/productos/:id', catalogoController.editarProducto);
router.delete('/productos/:id', catalogoController.eliminarProducto);

module.exports = router;
