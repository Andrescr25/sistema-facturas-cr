/**
 * Proveedores Module - Controller
 * Controladores HTTP para proveedores
 */

const proveedoresService = require('./proveedores.service');

/**
 * GET /proveedores
 */
async function getProveedores(req, res) {
  try {
    const proveedoresFormateados = await proveedoresService.getProveedores();
    res.json({
      success: true,
      proveedores: proveedoresFormateados,
      data: proveedoresFormateados // Compatibilidad con formatos viejos
    });
  } catch (error) {
    console.error('❌ Error obteniendo proveedores:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo proveedores'
    });
  }
}

/**
 * GET /proveedores/:cedula
 */
async function getFacturasPorCedula(req, res) {
  try {
    const { cedula } = req.params;
    const { proveedor, facturas } = await proveedoresService.getFacturasPorCedula(cedula);
    res.json({
      success: true,
      data: proveedor,
      facturas: facturas
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error('Error obteniendo proveedor:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error obteniendo información del proveedor'
    });
  }
}

module.exports = {
  getProveedores,
  getFacturasPorCedula
};
