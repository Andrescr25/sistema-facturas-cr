/**
 * Faltantes Module - Controller
 * Controladores HTTP para el registro de faltantes de facturas
 */

const faltantesService = require('./faltantes.service');

/**
 * GET /faltantes
 */
async function getFaltantes(req, res) {
  try {
    const { semana, mes, ano, tipo_faltante, proveedor_id } = req.query;
    const result = await faltantesService.getFaltantes({ semana, mes, ano, tipo_faltante, proveedor_id });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error obteniendo faltantes:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo faltantes'
    });
  }
}

/**
 * POST /faltantes
 */
async function registrarFaltante(req, res) {
  try {
    const {
      factura_id,
      producto_id,
      cantidad_faltante,
      tipo_faltante,
      observaciones,
      registrado_por
    } = req.body;

    const faltante = await faltantesService.registrarFaltante({
      factura_id,
      producto_id,
      cantidad_faltante,
      tipo_faltante,
      observaciones,
      registrado_por
    });

    res.status(201).json({
      success: true,
      data: faltante,
      message: 'Faltante registrado exitosamente'
    });
  } catch (error) {
    console.error('Error registrando faltante:', error);
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error registrando faltante'
    });
  }
}

/**
 * POST /faltantes/factura/:id/multiple
 */
async function registrarFaltantesMultiples(req, res) {
  try {
    const { id: factura_id } = req.params;
    const { faltantes, registrado_por } = req.body;

    const insertedFaltantes = await faltantesService.registrarFaltantesMultiples(factura_id, faltantes, registrado_por);

    res.status(201).json({
      success: true,
      data: insertedFaltantes,
      total: insertedFaltantes.length,
      message: `${insertedFaltantes.length} faltantes registrados exitosamente`
    });
  } catch (error) {
    console.error('Error registrando múltiples faltantes:', error);
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error registrando múltiples faltantes'
    });
  }
}

/**
 * GET /faltantes/factura/:id
 */
async function getFaltantesPorFactura(req, res) {
  try {
    const { id } = req.params;
    const result = await faltantesService.getFaltantesPorFactura(id);
    res.json({ success: true, ...result, factura_id: id });
  } catch (error) {
    console.error('Error obteniendo faltantes de factura:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo faltantes de factura'
    });
  }
}

/**
 * PUT /faltantes/:id
 */
async function actualizarFaltante(req, res) {
  try {
    const { id } = req.params;
    const { cantidad_faltante, tipo_faltante, observaciones } = req.body;

    const faltante = await faltantesService.actualizarFaltante(id, { cantidad_faltante, tipo_faltante, observaciones });

    res.json({
      success: true,
      data: faltante,
      message: 'Faltante actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error actualizando faltante:', error);
    if (error.status === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error actualizando faltante'
    });
  }
}

/**
 * DELETE /faltantes/:id
 */
async function eliminarFaltante(req, res) {
  try {
    const { id } = req.params;
    await faltantesService.eliminarFaltante(id);
    res.json({ success: true, message: 'Faltante eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando faltante:', error);
    if (error.status === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error eliminando faltante'
    });
  }
}

/**
 * GET /faltantes/resumen/:ano/:mes/:semana
 */
async function getResumenPorPeriodo(req, res) {
  try {
    const { ano, mes, semana } = req.params;
    const resumen = await faltantesService.getResumenPorPeriodo(ano, mes, semana);
    res.json({
      success: true,
      data: resumen,
      periodo: { ano, mes, semana }
    });
  } catch (error) {
    console.error('Error obteniendo resumen de faltantes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo resumen de faltantes'
    });
  }
}

module.exports = {
  getFaltantes,
  registrarFaltante,
  registrarFaltantesMultiples,
  getFaltantesPorFactura,
  actualizarFaltante,
  eliminarFaltante,
  getResumenPorPeriodo
};
