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
    // `productoIds` son ids de `producto`. No se aceptan ids de Alegra: los
    // dos son números, y tomar uno por otro mostraría el precio de otro
    // producto sin dar ningún error.
    const { productoIds } = req.body;

    if (!productoIds || !Array.isArray(productoIds)) {
      return res.status(400).json({ success: false, error: 'Se requiere un array de productoIds' });
    }

    const result = await revisionPreciosService.getProductosDeRevision(productoIds);
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

module.exports = {
  getFacturas,
  devolverFactura,
  getFacturasRelacionadas,
  getProductosBatch,
  getSugerenciasPrecio
};
