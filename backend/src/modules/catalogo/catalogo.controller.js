/**
 * Catalogo Module - Controller
 * Controladores HTTP para la gestión de catálogo de productos
 */

const catalogoService = require('./catalogo.service');

/**
 * GET /catalog/productos
 */
async function listarProductos(req, res) {
  try {
    const { search, missingImageOnly, page, limit } = req.query;
    const result = await catalogoService.listarProductos({ search, missingImageOnly, page, limit });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error en GET /catalog/productos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /catalog/search-images
 */
async function buscarImagenes(req, res) {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ success: false, message: 'La consulta de búsqueda (q) es requerida' });
    }

    const images = await catalogoService.buscarImagenes(q.trim());
    res.json({ success: true, images });
  } catch (error) {
    console.error('❌ Error en GET /catalog/search-images:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /catalog/upload-image-url
 */
async function asignarImagenDesdeUrl(req, res) {
  try {
    const { alegraId, imageUrl } = req.body;

    if (!alegraId || !imageUrl) {
      return res.status(400).json({ success: false, message: 'alegraId e imageUrl son requeridos' });
    }

    const finalImageUrl = await catalogoService.asignarImagenDesdeUrl(alegraId, imageUrl);
    res.json({ success: true, imageUrl: finalImageUrl, message: 'Imagen asignada exitosamente al producto' });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('❌ Error en POST /catalog/upload-image-url:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /catalog/duplicate-brand
 */
async function duplicarConMarca(req, res) {
  try {
    const { originalProductId, brandName, newCode, newPrice, newCost, imageUrl } = req.body;

    if (!originalProductId || !brandName || !newCode || newPrice === undefined) {
      return res.status(400).json({ success: false, message: 'Campos requeridos faltantes (originalProductId, brandName, newCode, newPrice)' });
    }

    const cachedProduct = await catalogoService.duplicarConMarca({ originalProductId, brandName, newCode, newPrice, newCost, imageUrl });
    res.json({
      success: true,
      data: cachedProduct,
      message: 'Producto duplicado para la marca creado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error en POST /catalog/duplicate-brand:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * PUT /catalog/productos/:id
 */
async function editarProducto(req, res) {
  try {
    const { id } = req.params;
    const { name, reference, price, cost } = req.body;

    if (!name || !reference || price === undefined) {
      return res.status(400).json({ success: false, message: 'name, reference y price son requeridos' });
    }

    const cachedProduct = await catalogoService.editarProducto(id, { name, reference, price, cost });
    res.json({
      success: true,
      data: cachedProduct,
      message: 'Producto actualizado exitosamente'
    });
  } catch (error) {
    console.error(`❌ Error en PUT /catalog/productos/${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * DELETE /catalog/productos/:id
 */
async function eliminarProducto(req, res) {
  try {
    const { id } = req.params;
    const result = await catalogoService.eliminarProducto(id);
    res.json({ success: true, hidden: result.hidden, message: result.message || 'Producto eliminado exitosamente' });
  } catch (error) {
    console.error(`❌ Error en DELETE /catalog/productos/${req.params.id}:`, error.message);
    res.status(error.status || 500).json({
      success: false,
      error: error.message,
      hint: error.hint
    });
  }
}

module.exports = {
  listarProductos,
  buscarImagenes,
  asignarImagenDesdeUrl,
  duplicarConMarca,
  editarProducto,
  eliminarProducto
};
