/**
 * Productos-Revision Module - Controller
 * Controladores HTTP para la gestión de relaciones producto proveedor ↔ producto propio
 */

const productosRevisionService = require('./productos-revision.service');
const productoDesdeLinea = require('./productoDesdeLinea');

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
 * GET /productos-revision/producto/:productoPropioId/relaciones
 */
async function getRelacionesDeProducto(req, res) {
  try {
    const { productoPropioId } = req.params;
    const result = await productosRevisionService.getRelacionesDeProducto(productoPropioId);
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
    // `productoPropioId` es `producto.id`. No se acepta el id de Alegra: los
    // dos son números, y tomar uno por otro relacionaría con otro producto.
    const { productoProveedorId, productoPropioId } = req.body;

    if (!productoProveedorId || !productoPropioId) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: productoProveedorId, productoPropioId'
      });
    }

    const result = await productosRevisionService.crearRelacion({ productoProveedorId, productoPropioId });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error creando relación:', error);
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
    const { productoPropioId } = req.body;
    if (!productoPropioId) {
      return res.status(400).json({ success: false, error: 'Falta el producto: productoPropioId' });
    }

    const result = await productosRevisionService.editarRelacion(mapeoId, productoPropioId);
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
 * GET /productos-revision/:productoId/precio-sugerido
 */
async function precioSugerido(req, res) {
  try {
    // El id de ProductoFactura es un UUID, no un entero: pasarlo por
    // parseInt daba NaN y Prisma no encontraba nada.
    const r = await productosRevisionService.precioSugerido(
      req.params.productoId,
      req.query.categoria || ''
    );
    res.json({ success: true, data: r });
  } catch (error) {
    console.error('Error calculando el precio sugerido:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

/**
 * GET /productos-revision/:productoId/formulario-producto
 * Categorías e impuestos propios, y el impuesto que se propone para la línea.
 */
async function formularioProducto(req, res) {
  try {
    const data = await productoDesdeLinea.formularioProducto(req.params.productoId);
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('Error armando el formulario de producto nuevo:', error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * POST /productos-revision/crear (multipart, imagen opcional)
 * Crea el producto en el maestro propio y relaciona la línea con él.
 */
async function crearProducto(req, res) {
  try {
    const { nombre, precio, costo, productoId } = req.body;

    if (!nombre || !precio || !costo || !productoId) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: nombre, precio, costo, productoId'
      });
    }

    const result = await productoDesdeLinea.crearProductoDesdeLinea(req.body, req.file, req.usuario?.id);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error creando producto:', error.message);
    res.status(error.status || error.statusCode || 500).json({
      success: false,
      error: error.message || 'Error creando el producto'
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
async function buscarProductos(req, res) {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: false,
        error: 'Término de búsqueda debe tener al menos 2 caracteres',
        productos: []
      });
    }

    const result = await productosRevisionService.buscarProductos(q);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error buscando productos:', error);
    res.status(error.status || 500).json({ success: false, error: error.message, productos: [] });
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
  editarRelacion,
  eliminarRelacionPorMapeo,
  crearProducto,
  formularioProducto,
  precioSugerido,
  guardarFactorConversion,
  buscarProductos,
  eliminarRelacionDeProducto,
  getMapeoDeProducto,
  getFacturaConProductos
};
