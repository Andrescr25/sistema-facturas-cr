/**
 * Catalogo Module - Routes
 * Rutas para la gestión de catálogo de productos (montadas en
 * /api/alegra/catalog vía el adaptador routes/alegra.js)
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const catalogoController = require('./catalogo.controller');

// Configuración de multer para la imagen subida manualmente (upload-image-file)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

router.get('/productos', catalogoController.listarProductos);
router.get('/proveedores', catalogoController.listarProveedores);
router.get('/imagenes-por-referencia', catalogoController.buscarImagenesPorReferencia);
router.get('/search-images', catalogoController.buscarImagenes);
router.get('/image-proxy', catalogoController.proxyImagen);
router.post('/upload-image-url', catalogoController.asignarImagenDesdeUrl);
router.post('/upload-image-file/:id', upload.single('image'), catalogoController.subirImagenDesdeArchivo);
router.get('/siguiente-referencia', catalogoController.siguienteReferenciaMarca);
router.post('/duplicate-brand', catalogoController.duplicarConMarca);
router.put('/productos/:id', catalogoController.editarProducto);
router.delete('/productos/:id', catalogoController.eliminarProducto);

module.exports = router;
