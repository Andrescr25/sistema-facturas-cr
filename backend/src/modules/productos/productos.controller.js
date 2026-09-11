/**
 * Productos y categorías — Controller
 */

const servicio = require('./productos.service');
const imagenes = require('./productos.imagenes');

function responder(res, promesa, contexto, status = 200) {
  return promesa
    .then(data => res.status(status).json({ success: true, data }))
    .catch(error => {
      const s = error.status || 500;
      if (s >= 500) console.error(`❌ Productos (${contexto}):`, error);
      res.status(s).json({ success: false, message: error.message, error: error.message });
    });
}

const usuario = (req) => req.usuario?.id;

module.exports = {
  /** GET /maestro/productos?buscar=&categoriaId=&proveedor=&sinImagen=&estado=&pagina=&limite= */
  listar: (req, res) => servicio.listarProductos(req.query)
    .then(r => res.json({ success: true, ...r }))
    .catch(error => res.status(error.status || 500).json({ success: false, message: error.message, error: error.message })),
  obtener: (req, res) => responder(res, servicio.obtenerProducto(req.params.id), 'obtener'),
  crear: (req, res) => responder(res, servicio.crearProducto(req.body, usuario(req)), 'crear', 201),
  editar: (req, res) => responder(res, servicio.editarProducto(req.params.id, req.body, usuario(req)), 'editar'),
  cambiarEstado: (req, res) => responder(res, servicio.cambiarEstadoProducto(req.params.id, req.body, usuario(req)), 'estado'),
  proveedores: (req, res) => responder(res, servicio.proveedoresConProductos(), 'proveedores'),
  /** POST /maestro/productos/:id/imagen/url  { url, urlRespaldo } */
  imagenDesdeUrl: (req, res) => responder(res, imagenes.asignarImagenDesdeUrl(req.params.id, req.body, usuario(req)), 'foto por dirección'),
  /** POST /maestro/productos/:id/imagen/archivo  (multipart, campo "imagen") */
  imagenDesdeArchivo: (req, res) => responder(res, imagenes.asignarImagenDesdeArchivo(req.params.id, req.file, usuario(req)), 'foto por archivo'),

  listarCategorias: (req, res) => responder(res, servicio.listarCategorias(), 'categorías'),
  crearCategoria: (req, res) => responder(res, servicio.crearCategoria(req.body, usuario(req)), 'crear categoría', 201),
  editarCategoria: (req, res) => responder(res, servicio.editarCategoria(req.params.id, req.body, usuario(req)), 'editar categoría'),
  cambiarActivoCategoria: (req, res) => responder(res, servicio.cambiarActivoCategoria(req.params.id, req.body?.activo, usuario(req)), 'activo categoría'),

  /** GET /catalogos/productos — para vender: activo y visible. */
  paraOperar: (req, res) => servicio.productosParaOperar(req.query)
    .then(r => res.json({ success: true, ...r }))
    .catch(error => res.status(error.status || 500).json({ success: false, message: error.message, error: error.message }))
};
