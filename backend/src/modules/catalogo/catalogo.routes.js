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

router.get('/arbol', catalogoController.arbolCatalogo);
router.get('/productos-de-categoria', catalogoController.productosDeCategoria);
router.get('/productos', catalogoController.listarProductos);
router.get('/proveedores', catalogoController.listarProveedores);

// Subcategorías: son NUESTRAS, no se mandan a Alegra.
router.get('/subcategorias', catalogoController.listarSubcategorias);
router.post('/subcategorias', catalogoController.crearSubcategoria);
router.put('/subcategorias/:id', catalogoController.editarSubcategoria);
router.delete('/subcategorias/:id', catalogoController.eliminarSubcategoria);
router.put('/subcategorias-orden', catalogoController.reordenarSubcategorias);
router.put('/productos/subcategoria-lote', catalogoController.asignarSubcategoriaLote);
router.put('/productos/:alegraId/subcategoria', catalogoController.asignarSubcategoria);

// Categorías: son de Alegra, pero el orden y el nombre visible son nuestros.
router.get('/categorias-config', catalogoController.listarCategoriasConfig);
router.put('/categorias-config/nombre', catalogoController.renombrarCategoria);
router.put('/categorias-config/orden', catalogoController.reordenarCategorias);
router.post('/categorias-config/crear', catalogoController.crearCategoria);
router.get('/imagenes-por-referencia', catalogoController.buscarImagenesPorReferencia);
router.get('/search-images', catalogoController.buscarImagenes);
router.get('/image-proxy', catalogoController.proxyImagen);
router.post('/upload-image-url', catalogoController.asignarImagenDesdeUrl);
router.post('/upload-image-file/:id', upload.single('image'), catalogoController.subirImagenDesdeArchivo);
router.get('/siguiente-referencia', catalogoController.siguienteReferenciaMarca);
router.post('/duplicate-brand', catalogoController.duplicarConMarca);
router.post('/productos/categoria-lote', catalogoController.cambiarCategoriaLote);
router.get('/trabajos/:jobId', catalogoController.estadoTrabajo);
router.put('/productos/:id', catalogoController.editarProducto);
router.delete('/productos/:id', catalogoController.eliminarProducto);

module.exports = router;
