/**
 * Warehouse Module - Controller
 * Controladores HTTP para operaciones de bodega/almacén
 */

const warehouseService = require('./warehouse.service');

/**
 * GET /bodega/facturas
 * Obtiene las facturas para el módulo de bodega
 */
async function getFacturas(req, res) {
  try {
    const dias = parseInt(req.query.dias) || 30;
    const limit = Math.min(parseInt(req.query.limit) || 40, 120);
    const forceRefresh = req.query.force_refresh === 'true';

    const response = await warehouseService.getFacturasBodega({ dias, limit, forceRefresh });
    res.json(response);

  } catch (error) {
    // Solo llega acá sin NADA guardado de esa ventana (primera carga o
    // servidor recién reiniciado): con algo guardado, el servicio lo devuelve
    // con un aviso en vez de fallar.
    console.error('❌ Error obteniendo facturas para bodega:', error);

    // Determinar el código de estado y mensaje apropiado
    let statusCode = 500;
    let mensaje = 'Error sincronizando facturas para bodega';
    let detalles = error.message;

    if (error.code === 'ECONNABORTED') {
      statusCode = 504;
      mensaje = 'La API de Alegra tardó demasiado en responder';
      detalles = 'El servidor de Alegra está experimentando demoras. Por favor, intenta nuevamente.';
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      statusCode = 503;
      mensaje = 'No se pudo conectar con la API de Alegra';
      detalles = 'Problema de conectividad con el servidor de Alegra.';
    } else if (error.response?.status) {
      statusCode = error.response.status;
      const statusMessages = {
        503: 'Servicio de Alegra no disponible',
        502: 'Error en el gateway de Alegra',
        504: 'Timeout del servidor de Alegra',
        429: 'Demasiadas peticiones a Alegra'
      };
      mensaje = statusMessages[statusCode] || `Error de la API de Alegra: ${statusCode}`;
      detalles = error.response.data?.message || error.message;
    }

    res.status(statusCode).json({
      success: false,
      message: mensaje,
      error: detalles,
      code: error.code,
      httpStatus: error.response?.status
    });
  }
}

/**
 * GET /bodega/facturas/:alegraId/estados
 * Lo que bodega ya registró de la factura, producto por producto (de la base,
 * sin pasar por Alegra).
 */
async function getEstadosFactura(req, res) {
  try {
    res.json({ success: true, data: await warehouseService.estadosDeFactura(req.params.alegraId) });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('❌ Error leyendo estados de la factura en bodega:', error);
    res.status(status).json({ success: false, message: error.message });
  }
}

/**
 * POST /bodega/facturas/:alegraId/estado
 * Actualiza el estado de una factura en bodega
 */
async function updateEstadoFactura(req, res) {
  try {
    const { alegraId } = req.params;
    const { estado = 'pendiente', observaciones = null, enviar_a_impresion = false } = req.body;

    const result = await warehouseService.actualizarEstadoFactura(alegraId, {
      estado,
      observaciones,
      enviarAImpresion: enviar_a_impresion
    });

    res.json(result);

  } catch (error) {
    console.error('❌ Error actualizando estado de factura de bodega:', error);
    
    const statusCode = error.message.includes('no encontrada') ? 404 : 
                       error.message.includes('inválido') ? 400 : 500;
    
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error actualizando estado de la factura',
      error: error.message
    });
  }
}

module.exports = {
  getFacturas,
  getEstadosFactura,
  updateEstadoFactura
};
