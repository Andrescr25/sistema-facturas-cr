/**
 * Productos-Revision Module - Routes
 * Rutas para la gestión de relaciones (montadas en /api/productos-revision)
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const productosRevisionController = require('./productos-revision.controller');

// Configuración de multer para la imagen opcional de /crear
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

// El orden de registro se preserva del router legacy: las rutas con
// parámetro en el primer segmento (/:mapeoId/...) van después de las literales
router.get('/relacionados', productosRevisionController.getRelacionados);
router.get('/producto/:alegraItemId/relaciones', productosRevisionController.getRelacionesDeProducto);
router.post('/relacion', productosRevisionController.crearRelacion);
router.post('/ajustar', productosRevisionController.ajustarProducto);
router.put('/:mapeoId/editar-relacion', productosRevisionController.editarRelacion);
router.delete('/:mapeoId/relacion', productosRevisionController.eliminarRelacionPorMapeo);
// El costo real y el precio sugerido para un producto que todavía no existe
// en Alegra. La categoría llega por query porque se elige en el mismo
// formulario y el margen meta depende de ella.
router.get('/:productoId/precio-sugerido', productosRevisionController.precioSugerido);
router.post('/crear', upload.single('imagen'), productosRevisionController.crearProducto);
router.post('/factor-conversion', productosRevisionController.guardarFactorConversion);
router.get('/buscar', productosRevisionController.buscarEnCache);
router.get('/buscar-alegra', productosRevisionController.buscarEnAlegra);
router.get('/info-alegra/:alegraItemId', productosRevisionController.getInfoAlegra);
router.delete('/relacion/:productoId', productosRevisionController.eliminarRelacionDeProducto);
router.get('/mapeo/:productoId', productosRevisionController.getMapeoDeProducto);
router.get('/factura/:facturaId', productosRevisionController.getFacturaConProductos);

module.exports = router;
