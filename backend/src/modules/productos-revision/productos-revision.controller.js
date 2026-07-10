/**
 * Productos-Revision Module - Controller
 * Controladores HTTP para la gestión de relaciones producto proveedor ↔ Alegra
 */

const productosRevisionService = require('./productos-revision.service');

/**
 * Algunos endpoints de mutación se llaman desde el frontend en dominios
 * distintos; se refuerzan los headers CORS antes de procesar.
 */
function asegurarCors(req, res) {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
}

/**
 * GET /productos-revision/relacionados
 */
async function getRelacionados(req, res) {
  try {
    const { proveedor, busqueda, page = 1, limit = 20 } = req.query;
    const result = await productosRevisionService.getRelacionados({ proveedor, busqueda, page, limit });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error obteniendo productos relacionados:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /productos-revision/producto/:alegraItemId/relaciones
 */
async function getRelacionesDeProducto(req, res) {
  try {
    const { alegraItemId } = req.params;
    const result = await productosRevisionService.getRelacionesDeProducto(alegraItemId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error obteniendo relaciones del producto:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * POST /productos-revision/relacion
 */
async function crearRelacion(req, res) {
  try {
    const { productoProveedorId, alegraItemId } = req.body;

    if (!productoProveedorId || !alegraItemId) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: productoProveedorId, alegraItemId'
      });
    }

    const result = await productosRevisionService.crearRelacion({ productoProveedorId, alegraItemId });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error creando relación:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * POST /productos-revision/ajustar
 */
async function ajustarProducto(req, res) {
  try {
    const { productoId, nuevaCantidad, nuevoPrecio, alegraItemId } = req.body;
    const result = await productosRevisionService.ajustarProducto({ productoId, nuevaCantidad, nuevoPrecio, alegraItemId });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error ajustando producto:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * PUT /productos-revision/:mapeoId/editar-relacion
 */
async function editarRelacion(req, res) {
  asegurarCors(req, res);

  try {
    const { mapeoId } = req.params;
    const { nuevoAlegraItemId } = req.body;

    const result = await productosRevisionService.editarRelacion(mapeoId, nuevoAlegraItemId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error editando relación:', error);
    const payload = { success: false, error: error.message };
    if (error.mapeoId) payload.mapeoId = error.mapeoId;
    res.status(error.status || 500).json(payload);
  }
}

/**
 * DELETE /productos-revision/:mapeoId/relacion
 */
async function eliminarRelacionPorMapeo(req, res) {
  asegurarCors(req, res);

  try {
    const { mapeoId } = req.params;
    const result = await productosRevisionService.eliminarRelacionPorMapeo(mapeoId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error eliminando relación:', error);
    const payload = { success: false, error: error.message };
    if (error.mapeoId) payload.mapeoId = error.mapeoId;
    res.status(error.status || 500).json(payload);
  }
}

/**
 * POST /productos-revision/crear (multipart, imagen opcional)
 */
async function crearProducto(req, res) {
  try {
    console.log('📦 Creando producto nuevo en Alegra...');
    console.log('📝 Datos recibidos:', req.body);
    console.log('🖼️ Imagen recibida:', req.file ? req.file.originalname : 'Sin imagen');

    const { nombre, precio, costo, productoId } = req.body;

    if (!nombre || !precio || !costo || !productoId) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: nombre, precio, costo, productoId'
      });
    }

    const result = await productosRevisionService.crearProducto(req.body, req.file);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error creando producto:', error);
    res.status(error.status || error.statusCode || 500).json({
      success: false,
      error: error.message || 'Error creando producto en Alegra'
    });
  }
}

/**
 * POST /productos-revision/factor-conversion
 */
async function guardarFactorConversion(req, res) {
  try {
    const { mapeoId, factorConversion } = req.body;

    console.log(`⚙️ Actualizando factor de conversión: Mapeo ${mapeoId} → Factor ${factorConversion}`);

    if (!mapeoId || !factorConversion) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: mapeoId, factorConversion'
      });
    }

    const factorNumerico = parseFloat(factorConversion);

    if (isNaN(factorNumerico) || !isFinite(factorNumerico)) {
      return res.status(400).json({
        success: false,
        error: 'Factor de conversión inválido'
      });
    }

    console.log(`   Factor recibido: ${factorConversion} (tipo: ${typeof factorConversion})`);
    console.log(`   Factor parseado: ${factorNumerico} (precisión: ${factorNumerico.toFixed(10)})`);

    const result = await productosRevisionService.guardarFactorConversion(mapeoId, factorNumerico);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error guardando factor de conversión:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /productos-revision/buscar
 */
async function buscarEnCache(req, res) {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: false,
        error: 'Término de búsqueda debe tener al menos 2 caracteres',
        productos: []
      });
    }

    const result = await productosRevisionService.buscarEnCache(q);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error buscando productos:', error);
    res.status(error.status || 500).json({ success: false, error: error.message, productos: [] });
  }
}

/**
 * GET /productos-revision/buscar-alegra
 */
async function buscarEnAlegra(req, res) {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: false,
        error: 'Término de búsqueda debe tener al menos 2 caracteres'
      });
    }

    const result = await productosRevisionService.buscarEnAlegra(q);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error buscando en Alegra:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /productos-revision/info-alegra/:alegraItemId
 */
async function getInfoAlegra(req, res) {
  try {
    const { alegraItemId } = req.params;
    const result = await productosRevisionService.getInfoAlegra(alegraItemId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error obteniendo producto Alegra:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * DELETE /productos-revision/relacion/:productoId
 */
async function eliminarRelacionDeProducto(req, res) {
  asegurarCors(req, res);

  try {
    const { productoId } = req.params;
    const result = await productosRevisionService.eliminarRelacionDeProducto(productoId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error eliminando relación:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /productos-revision/mapeo/:productoId
 */
async function getMapeoDeProducto(req, res) {
  try {
    const { productoId } = req.params;
    const result = await productosRevisionService.getMapeoDeProducto(productoId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error obteniendo mapeo:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /productos-revision/factura/:facturaId
 */
async function getFacturaConProductos(req, res) {
  try {
    const { facturaId } = req.params;
    const result = await productosRevisionService.getFacturaConProductos(facturaId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error obteniendo factura:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

module.exports = {
  getRelacionados,
  getRelacionesDeProducto,
  crearRelacion,
  ajustarProducto,
  editarRelacion,
  eliminarRelacionPorMapeo,
  crearProducto,
  guardarFactorConversion,
  buscarEnCache,
  buscarEnAlegra,
  getInfoAlegra,
  eliminarRelacionDeProducto,
  getMapeoDeProducto,
  getFacturaConProductos
};
