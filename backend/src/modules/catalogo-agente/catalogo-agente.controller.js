/**
 * Catalogo Publico Module - Controller
 */

const catalogoAgenteService = require('./catalogo-agente.service');

/**
 * GET /api/catalogo-agente/productos
 */
async function listarProductos(req, res) {
  const { start, limit } = req.query;
  try {
    const data = await catalogoAgenteService.listarProductos({ start, limit });
    res.json(data);
  } catch (error) {
    console.error('Error listando productos del catálogo público:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

/**
 * GET /api/catalogo-agente/categorias
 */
async function listarCategorias(req, res) {
  try {
    const data = await catalogoAgenteService.listarCategorias();
    res.json({ categories: data, count: data.length });
  } catch (error) {
    console.error('Error listando categorías del catálogo público:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

/**
 * GET /api/catalogo-agente/ofertas
 */
async function listarOfertas(req, res) {
  try {
    const data = await catalogoAgenteService.listarOfertas();
    res.json({ ofertas: data });
  } catch (error) {
    console.error('Error listando ofertas del catálogo público:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

/**
 * GET /api/catalogo-agente/historial-clientes
 * Payload compacto (offline) del historial de compras por cliente.
 */
async function obtenerHistorialClientes(req, res) {
  try {
    const data = await catalogoAgenteService.obtenerHistorialParaCatalogo();
    res.json(data);
  } catch (error) {
    console.error('Error obteniendo el historial de compras por cliente:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

/**
 * POST /api/catalogo-agente/historial-clientes/sync
 * Fuerza la sincronización del historial de compras desde Alegra.
 */
async function sincronizarHistorialClientes(req, res) {
  try {
    const data = await catalogoAgenteService.sincronizarHistorialCompras({ desde: req.body?.desde });
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
