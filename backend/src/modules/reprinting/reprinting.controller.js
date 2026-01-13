/**
 * Reprinting Module - Controller
 * Controladores HTTP para operaciones de reimpresión
 */

const reprintingService = require('./reprinting.service');

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

module.exports = {
  getPendingInvoices,
  getProcessedInvoices,
  getHistory,
  clearHistory
};
