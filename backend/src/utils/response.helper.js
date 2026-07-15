/**
 * Helper para estandarizar respuestas HTTP
 * Centraliza el formato de respuestas de la API
 */

class ResponseHelper {
  /**
   * Respuesta exitosa
   */
  static success(res, data = {}, message = 'Operación exitosa', statusCode = 200, extra = {}) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
      ...extra
    });
  }

  /**
   * Respuesta de error
   */
  static error(res, message = 'Error en la operación', statusCode = 500, error = null) {
    const response = {
      success: false,
      message,
      timestamp: new Date().toISOString()
    };

    if (error && process.env.NODE_ENV === 'development') {
      response.error = error;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Error de validación
   */
  static validationError(res, errors) {
    return res.status(400).json({
      success: false,
      message: 'Error de validación',
      errors,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * No encontrado
   */
  static notFound(res, message = 'Recurso no encontrado') {
    return res.status(404).json({
      success: false,
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * No autorizado
   */
  static unauthorized(res, message = 'No autorizado') {
    return res.status(401).json({
      success: false,
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Prohibido
   */
  static forbidden(res, message = 'Acceso prohibido') {
    return res.status(403).json({
      success: false,
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Respuesta con paginación
   */
  static paginated(res, data, page, limit, total) {
    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total),
        totalPages,
        hasMore: page < totalPages
      },
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = ResponseHelper;
