/**
 * Catalogo Publico Module - Controller
 */

const catalogoPublicoService = require('./catalogo-publico.service');

/**
 * GET /api/catalogo-publico/productos
 */
async function listarProductos(req, res) {
  const { start, limit } = req.query;
  try {
    const data = await catalogoPublicoService.listarProductos({ start, limit });
    res.json(data);
  } catch (error) {
    console.error('Error listando productos del catálogo público:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

/**
 * GET /api/catalogo-publico/categorias
 */
async function listarCategorias(req, res) {
  try {
    const data = await catalogoPublicoService.listarCategorias();
    res.json({ categories: data, count: data.length });
  } catch (error) {
    console.error('Error listando categorías del catálogo público:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

/**
 * GET /api/catalogo-publico/ofertas
 */
async function listarOfertas(req, res) {
  try {
    const data = await catalogoPublicoService.listarOfertas();
    res.json({ ofertas: data });
  } catch (error) {
    console.error('Error listando ofertas del catálogo público:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

/**
 * GET /api/catalogo-publico/historial-clientes
 * Payload compacto (offline) del historial de compras por cliente.
 */
async function obtenerHistorialClientes(req, res) {
  try {
    const data = await catalogoPublicoService.obtenerHistorialParaCatalogo();
    res.json(data);
  } catch (error) {
    console.error('Error obteniendo el historial de compras por cliente:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

/**
 * POST /api/catalogo-publico/historial-clientes/sync
 * Fuerza la sincronización del historial de compras desde Alegra.
 */
async function sincronizarHistorialClientes(req, res) {
  try {
    const data = await catalogoPublicoService.sincronizarHistorialCompras({ desde: req.body?.desde });
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('Error sincronizando el historial de compras por cliente:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

module.exports = {
  listarProductos,
  listarCategorias,
  listarOfertas,
  obtenerHistorialClientes,
  sincronizarHistorialClientes
};
