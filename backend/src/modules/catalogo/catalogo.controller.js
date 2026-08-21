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
 * GET /catalog/imagenes-por-referencia?referencias=ref1,ref2,ref3
 */
async function buscarImagenesPorReferencia(req, res) {
  try {
    const { referencias } = req.query;
    const lista = (referencias || '').split(',').map((r) => r.trim()).filter(Boolean);
    const data = await catalogoService.buscarImagenesPorReferencia(lista);
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Error en GET /catalog/imagenes-por-referencia:', error);
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
 * GET /catalog/image-proxy?url=...
 * Descarga la imagen en el servidor y la sirve al navegador. Necesario porque
 * varias fuentes de imagen (thumbnails de Brave, sitios de origen) bloquean
 * la carga directa (hotlinking) desde otro dominio.
 */
// Hosts que este proxy tiene permitido descargar.
//
// La ruta es PÚBLICA por necesidad: las miniaturas se pintan con <img src>, y
// una etiqueta <img> no manda la cabecera Authorization —el interceptor de
// axios solo alcanza a las peticiones XHR—, así que detrás del login devolvía
// 401 y no cargaba ninguna sugerencia.
//
// Pública SIN esta lista sería un proxy abierto: cualquiera podría hacer que
// el servidor descargue una URL arbitraria, ocultando su origen o alcanzando
// direcciones internas de la red. Con la lista, lo único que puede pedir es
// una imagen del CDN de Brave, que es de donde salen todas las miniaturas
// (ver buscarImagenes: descarta los resultados sin thumbnail propio de Brave).
const HOSTS_PERMITIDOS = [
  'imgs.search.brave.com',
  'cdn.search.brave.com'
];

function hostPermitido(url) {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'https:') return false;
    return HOSTS_PERMITIDOS.includes(hostname);
  } catch {
    return false;
  }
}

async function proxyImagen(req, res) {
  try {
    const { url } = req.query;
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ success: false, message: 'URL de imagen inválida' });
    }
    if (!hostPermitido(url)) {
      console.warn('⚠️ image-proxy rechazó un host no permitido:', String(url).slice(0, 120));
      return res.status(403).json({ success: false, message: 'Ese origen de imagen no está permitido.' });
    }

    const { buffer, contentType } = await catalogoService.descargarImagen(url);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (error) {
    console.error('❌ Error en GET /catalog/image-proxy:', error.message);
    res.status(502).json({ success: false, error: 'No se pudo cargar la imagen' });
  }
}

/**
 * POST /catalog/upload-image-url
 */
async function asignarImagenDesdeUrl(req, res) {
  try {
    const { alegraId, imageUrl, fallbackImageUrl } = req.body;

    if (!alegraId || !imageUrl) {
      return res.status(400).json({ success: false, message: 'alegraId e imageUrl son requeridos' });
    }

    const finalImageUrl = await catalogoService.asignarImagenDesdeUrl(alegraId, imageUrl, fallbackImageUrl);
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
 * POST /catalog/upload-image-file/:id (multipart, imagen requerida)
 */
async function subirImagenDesdeArchivo(req, res) {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'La imagen es requerida' });
    }

    const finalImageUrl = await catalogoService.subirImagenDesdeArchivo(id, req.file);
    res.json({ success: true, imageUrl: finalImageUrl, message: 'Imagen asignada exitosamente al producto' });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('❌ Error en POST /catalog/upload-image-file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /catalog/duplicate-brand
 */
async function duplicarConMarca(req, res) {
  try {
    const { originalProductId, name, newCode, newPrice, newCost, imageUrl } = req.body;

    if (!originalProductId || !name || !newCode || newPrice === undefined) {
      return res.status(400).json({ success: false, message: 'Campos requeridos faltantes (originalProductId, name, newCode, newPrice)' });
    }

    const cachedProduct = await catalogoService.duplicarConMarca({ originalProductId, name, newCode, newPrice, newCost, imageUrl });
    res.json({
      success: true,
      data: cachedProduct,
      message: 'Producto duplicado creado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error en POST /catalog/duplicate-brand:', error);
    res.status(error.status || 500).json({ success: false, message: error.message, error: error.message });
  }
}

/**
 * PUT /catalog/productos/:id
 */
async function editarProducto(req, res) {
  try {
    const { id } = req.params;
    const { name, reference, price, cost, category } = req.body;

    if (!name || !reference || price === undefined) {
      return res.status(400).json({ success: false, message: 'name, reference y price son requeridos' });
    }

    const cachedProduct = await catalogoService.editarProducto(id, { name, reference, price, cost, category });
    res.json({
      success: true,
      data: cachedProduct,
      message: 'Producto actualizado exitosamente'
    });
  } catch (error) {
    console.error(`❌ Error en PUT /catalog/productos/${req.params.id}:`, error);
    res.status(error.status || 500).json({ success: false, message: error.message, error: error.message });
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

async function siguienteReferenciaMarca(req, res) {
  try {
    const data = await catalogoService.siguienteReferenciaMarca(req.query.base);
    res.json({ success: true, ...data });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message });
  }
}

module.exports = {
  listarProductos,
  buscarImagenesPorReferencia,
  buscarImagenes,
  proxyImagen,
  asignarImagenDesdeUrl,
  subirImagenDesdeArchivo,
  duplicarConMarca,
  siguienteReferenciaMarca,
  editarProducto,
  eliminarProducto
};
