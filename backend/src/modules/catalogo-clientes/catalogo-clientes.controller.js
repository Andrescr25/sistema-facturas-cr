/**
 * Catálogo para clientes - Controller
 */

const service = require('./catalogo-clientes.service');

async function productos(req, res) {
  try {
    const data = await service.listarProductos({
      busqueda: req.query.q,
      categoria: req.query.categoria,
      pagina: req.query.pagina,
      porPagina: req.query.porPagina
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listando productos del catálogo de clientes:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo cargar el catálogo.' });
  }
}

async function ofertas(req, res) {
  try {
    res.json({ success: true, data: await service.listarOfertas() });
  } catch (error) {
    console.error('Error listando ofertas del catálogo:', error.message);
    res.status(500).json({ success: false, error: 'No se pudieron cargar las ofertas.' });
  }
}

async function categorias(req, res) {
  try {
    res.json({ success: true, data: await service.listarCategorias() });
  } catch (error) {
    console.error('Error listando categorías del catálogo de clientes:', error.message);
    res.status(500).json({ success: false, error: 'No se pudieron cargar las categorías.' });
  }
}

async function configuracion(req, res) {
  res.json({ success: true, data: service.obtenerConfiguracion() });
}

module.exports = { productos, ofertas, categorias, configuracion };
