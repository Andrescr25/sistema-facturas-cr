/**
 * Reprinting Module - Controller
 * Controladores HTTP para operaciones de reimpresión
 */

const reprintingService = require('./reprinting.service');
const procesarImpresion = require('./procesarImpresion');

/**
 * GET /facturas/pendientes
 * Obtiene facturas pendientes de reimpresión
 */
async function getPendingInvoices(req, res) {
  try {
    console.log('📋 Obteniendo facturas pendientes de reimpresión...');
    const result = await reprintingService.getPendingInvoices();
    res.json(result);
  } catch (error) {
    console.error('❌ Error obteniendo facturas pendientes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo facturas pendientes de reimpresión'
    });
  }
}

/**
 * GET /facturas/procesadas
 * Obtiene facturas procesadas (últimos 7 días)
 */
async function getProcessedInvoices(req, res) {
  try {
    console.log('📋 Obteniendo facturas procesadas de reimpresión...');
    const result = await reprintingService.getProcessedInvoices();
    res.json(result);
  } catch (error) {
    console.error('❌ Error obteniendo facturas procesadas:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo facturas procesadas'
    });
  }
}

/**
 * GET /historial
 * Obtiene historial de procesamientos
 */
async function getHistory(req, res) {
  try {
    console.log('📚 Obteniendo historial de procesamientos...');
    const { fecha_desde, fecha_hasta, procesado_por } = req.query;
    
    const result = await reprintingService.getHistory({
      fechaDesde: fecha_desde,
      fechaHasta: fecha_hasta,
      procesadoPor: procesado_por
    });
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error obteniendo historial:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo historial'
    });
  }
}

/**
 * DELETE /historial
 * Limpia el historial de procesamientos
 */
async function clearHistory(req, res) {
  try {
    console.log('🗑️ Limpiando historial de procesamientos...');
    const result = await reprintingService.clearHistory();
    res.json(result);
  } catch (error) {
    console.error('❌ Error limpiando historial:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error limpiando historial'
    });
  }
}

// ─── Sobre la factura PROPIA (sección 11, paso 3): todo por `facturaId`, el
// id de `factura`, nunca el de Alegra. Ver procesarImpresion.js.

function responderError(res, error, contexto) {
  if (!error.status) console.error(`❌ Impresión (${contexto}):`, error);
  res.status(error.status || 500).json({ success: false, message: error.message });
}

const quien = (req) => ({ id: req.usuario?.id, nombre: req.usuario?.nombre || req.usuario?.usuario });

async function detalleFacturaPropia(req, res) {
  try {
    res.json({ success: true, data: await procesarImpresion.detalle(req.params.facturaId) });
  } catch (error) { responderError(res, error, 'detalle'); }
}

async function procesarFacturaPropia(req, res) {
  try {
    const { lineas = null, actualizarPrecios = true } = req.body || {};
    res.json({ success: true, data: await procesarImpresion.procesar(req.params.facturaId, { lineas, actualizarPrecios }, quien(req)) });
  } catch (error) { responderError(res, error, 'procesar'); }
}

async function recuperarFacturaPropia(req, res) {
  try {
    res.json({ success: true, data: await procesarImpresion.recuperarProcesada(req.params.facturaId, quien(req)) });
  } catch (error) { responderError(res, error, 'recuperar'); }
}

async function pdfFacturaPropia(req, res) {
  try {
    const { numero, archivo } = await procesarImpresion.pdf(req.params.facturaId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="factura-${numero}.pdf"`);
    res.send(archivo);
  } catch (error) { responderError(res, error, 'pdf'); }
}

async function buscarProductos(req, res) {
  try {
    res.json({ success: true, data: await procesarImpresion.buscarProductos(req.query.q) });
  } catch (error) { responderError(res, error, 'buscar productos'); }
}

module.exports = {
  getPendingInvoices,
  getProcessedInvoices,
  getHistory,
  clearHistory,
  detalleFacturaPropia,
  procesarFacturaPropia,
  recuperarFacturaPropia,
  pdfFacturaPropia,
  buscarProductos
};
