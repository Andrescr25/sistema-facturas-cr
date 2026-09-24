/**
 * Productos y categorías — Routes
 *
 * - `routes` (/api/maestro): ver todo y cambiar. Solo quien tenga el módulo
 *   Gestión de Catálogo (ver usuarios/modulos.js).
 * - `rutasCompartidas` (/api/catalogos): leer lo activo para vender.
 *
 * No se usa /api/productos: ese prefijo es del catálogo local de siempre y
 * está abierto a cualquiera que haya entrado.
 */

const express = require('express');
const multer = require('multer');
const controller = require('./productos.controller');

// La foto se valida por sus bytes en el almacenamiento; acá solo se limita el
// tamaño. Un archivo grande es un error de quien sube: 400, no 500.
const MAXIMO_BYTES = 2 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAXIMO_BYTES, files: 1 } });
const subirImagen = (req, res, next) => upload.single('imagen')(req, res, (error) => {
  if (!error) return next();
  const mensaje = error.code === 'LIMIT_FILE_SIZE' ? 'La imagen pesa más de 2 MB.' : 'No se pudo leer el archivo subido.';
  res.status(400).json({ success: false, message: mensaje, error: mensaje });
});

const routes = express.Router();
// El rediseño de Gestión de Catálogo (el de `main`, sobre `producto`). Van
// ANTES de '/productos/:id': si no, Express lee "lote" como un id.
routes.get('/arbol', controller.arbol);
routes.get('/buscar', controller.buscar);
routes.get('/categorias/:id/productos', controller.productosDeCategoria);
routes.put('/lote/subcategoria', controller.loteSubcategoria);
routes.put('/lote/categoria', controller.loteCategoria);
routes.post('/subcategorias', controller.crearSubcategoria);
routes.put('/subcategorias-orden', controller.reordenarSubcategorias);
routes.put('/subcategorias/:id', controller.renombrarSubcategoria);
routes.delete('/subcategorias/:id', controller.eliminarSubcategoria);
routes.post('/subcategorias/:id/mover', controller.moverSubcategoria);
routes.put('/categorias-orden', controller.reordenarCategorias);
routes.put('/categorias/:id/nombre-visible', controller.nombreVisibleCategoria);

routes.get('/productos', controller.listar);
routes.get('/productos/proveedores', controller.proveedores);
routes.get('/productos/:id', controller.obtener);
routes.post('/productos', controller.crear);
routes.put('/productos/:id', controller.editar);
routes.patch('/productos/:id/estado', controller.cambiarEstado);
routes.post('/productos/:id/imagen/url', controller.imagenDesdeUrl);
routes.post('/productos/:id/imagen/archivo', subirImagen, controller.imagenDesdeArchivo);
routes.get('/categorias', controller.listarCategorias);
routes.post('/categorias', controller.crearCategoria);
routes.put('/categorias/:id', controller.editarCategoria);
routes.patch('/categorias/:id/activo', controller.cambiarActivoCategoria);

const rutasCompartidas = express.Router();
rutasCompartidas.get('/productos', controller.paraOperar);

module.exports = { routes, rutasCompartidas };
