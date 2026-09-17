/**
 * Revision-Precios Module - Controller
 * Controladores HTTP para la revisión de precios
 */

const revisionPreciosService = require('./revision-precios.service');

/**
 * GET /revision-precios/facturas
 */
async function getFacturas(req, res) {
  try {
    const { estado } = req.query;
    const result = await revisionPreciosService.getFacturas(estado);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error obteniendo facturas:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /revision-precios/productos-pendientes
 */
async function getProductosPendientes(req, res) {
  try {
    const result = await revisionPreciosService.getProductosPendientes();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error obteniendo productos pendientes:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * POST /revision-precios/confirmar-producto
 */
async function confirmarProducto(req, res) {
  try {
    const { productoId, alegraItemId, confianza } = req.body;
    const result = await revisionPreciosService.confirmarProducto({ productoId, alegraItemId, confianza });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error confirmando producto:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * POST /revision-precios/rechazar-producto
 */
async function rechazarProducto(req, res) {
  try {
    const { productoId } = req.body;
    const result = await revisionPreciosService.rechazarProducto(productoId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error rechazando producto:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * POST /revision-precios/actualizar-precio
 */
async function actualizarPrecio(req, res) {
  try {
    const { productoId, nuevoPrecio } = req.body;
    const result = await revisionPreciosService.actualizarPrecio(productoId, nuevoPrecio);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error actualizando precio:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /revision-precios/estadisticas
 */
async function getEstadisticas(req, res) {
  try {
    const result = await revisionPreciosService.getEstadisticas();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * POST /revision-precios/devolver-factura
 */
async function devolverFactura(req, res) {
  try {
    const { facturaId } = req.body;

    if (!facturaId) {
      return res.status(400).json({ success: false, error: 'facturaId es requerido' });
    }

    const result = await revisionPreciosService.devolverFactura(facturaId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error devolviendo factura:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /revision-precios/facturas-relacionadas
 */
async function getFacturasRelacionadas(req, res) {
  try {
    const result = await revisionPreciosService.getFacturasRelacionadas({
      limit: req.query.limit
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error obteniendo facturas relacionadas:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * POST /revision-precios/productos-batch
 */
async function getProductosBatch(req, res) {
  try {
    const { alegraIds } = req.body;

    if (!alegraIds || !Array.isArray(alegraIds)) {
      return res.status(400).json({ success: false, error: 'Se requiere un array de alegraIds' });
    }

    const result = await revisionPreciosService.getProductosBatch(alegraIds);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error en batch de productos:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /revision-precios/facturas/:facturaId/sugerencias-precio
 */
async function getSugerenciasPrecio(req, res) {
  try {
    const { facturaId } = req.params;
    const result = await revisionPreciosService.obtenerSugerenciasPrecio(facturaId);
    res.json({ success: true, sugerencias: result });
  } catch (error) {
    console.error('❌ Error obteniendo sugerencias de precio:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * POST /revision-precios/enviar-alegra
 */
async function enviarAlegra(req, res) {
  try {
    const { facturaId, preciosAjustados = {} } = req.body;

    if (!facturaId) {
      return res.status(400).json({ success: false, error: 'facturaId es requerido' });
    }

    const result = await revisionPreciosService.enviarFacturaAlegra(facturaId, preciosAjustados);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error enviando a Alegra:', error);

    // Errores de validación/negocio de Alegra responden 400
    let statusCode = error.status || 500;
    if (error.message?.includes('deshabilitado') ||
        error.message?.includes('Error de Alegra')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      error: error.message || 'Error desconocido al procesar la factura'
    });
  }
}

module.exports = {
  getFacturas,
  getProductosPendientes,
  confirmarProducto,
  rechazarProducto,
  actualizarPrecio,
  getEstadisticas,
  devolverFactura,
  getFacturasRelacionadas,
  getProductosBatch,
  getSugerenciasPrecio,
  enviarAlegra
};
