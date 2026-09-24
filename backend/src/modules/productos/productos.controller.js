/**
 * Productos y categorías — Controller
 */

const servicio = require('./productos.service');
const imagenes = require('./productos.imagenes');
const taxonomia = require('./taxonomia.service');

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

  // ─── Árbol, filas y lotes (el rediseño de Gestión de Catálogo) ───
  arbol: (req, res) => responder(res, taxonomia.arbol(), 'árbol'),
  productosDeCategoria: (req, res) => responder(res, taxonomia.productosDeCategoria(req.params.id), 'productos de categoría'),
  buscar: (req, res) => responder(res, taxonomia.buscar(req.query), 'buscar'),
  loteSubcategoria: (req, res) => responder(res, taxonomia.asignarSubcategoria(req.body, usuario(req)), 'lote subcategoría'),
  loteCategoria: (req, res) => responder(res, taxonomia.cambiarCategoria(req.body, usuario(req)), 'lote categoría'),
  crearSubcategoria: (req, res) => responder(res, taxonomia.crearSubcategoria(req.body), 'crear subcategoría', 201),
  renombrarSubcategoria: (req, res) => responder(res, taxonomia.renombrarSubcategoria(req.params.id, req.body), 'renombrar subcategoría'),
  reordenarSubcategorias: (req, res) => responder(res, taxonomia.reordenarSubcategorias(req.body), 'ordenar subcategorías'),
  eliminarSubcategoria: (req, res) => responder(res, taxonomia.eliminarSubcategoria(req.params.id), 'borrar subcategoría'),
  moverSubcategoria: (req, res) => responder(res, taxonomia.moverSubcategoria(req.params.id, req.body, usuario(req)), 'mover subcategoría'),
  reordenarCategorias: (req, res) => responder(res, taxonomia.reordenarCategorias(req.body?.categorias), 'ordenar categorías'),
  nombreVisibleCategoria: (req, res) => responder(res, taxonomia.nombreVisibleCategoria(req.params.id, req.body?.nombreVisible), 'nombre visible'),

  listarCategorias: (req, res) => responder(res, servicio.listarCategorias(), 'categorías'),
  crearCategoria: (req, res) => responder(res, servicio.crearCategoria(req.body, usuario(req)), 'crear categoría', 201),
  editarCategoria: (req, res) => responder(res, servicio.editarCategoria(req.params.id, req.body, usuario(req)), 'editar categoría'),
  cambiarActivoCategoria: (req, res) => responder(res, servicio.cambiarActivoCategoria(req.params.id, req.body?.activo, usuario(req)), 'activo categoría'),

  /** GET /catalogos/productos — para vender: activo y visible. */
  paraOperar: (req, res) => servicio.productosParaOperar(req.query)
    .then(r => res.json({ success: true, ...r }))
    .catch(error => res.status(error.status || 500).json({ success: false, message: error.message, error: error.message }))
};
