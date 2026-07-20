/**
 * Pagos-Proveedores Module - Controller
 * Controladores HTTP para cuentas por pagar a proveedores
 */

const pagosProveedoresService = require('../../../services/pagosProveedoresService');

/**
 * GET /pagos-proveedores
 */
async function listarCuentas(req, res) {
  try {
    const {
      estado,
      proveedor,
      search,
      dias,
      diasMin,
      diasMax,
      soloVencidas
    } = req.query;

    const result = await pagosProveedoresService.listarCuentas({
      estado,
      proveedor,
      search,
      dias,
      diasMin,
      diasMax,
      soloVencidas: soloVencidas === 'true'
    });

    res.json({
      success: true,
      data: result.data,
      resumen: result.resumen,
      filtros: result.filtros
    });
  } catch (error) {
    console.error('❌ Error obteniendo cuentas por pagar:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo cuentas por pagar',
      error: error.message
    });
  }
}

/**
 * GET /pagos-proveedores/proveedores
 */
async function listarProveedoresConCuentas(req, res) {
  try {
    const data = await pagosProveedoresService.listarProveedoresConCuentas();
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Error obteniendo proveedores con cuentas por pagar:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo proveedores con cuentas por pagar',
      error: error.message
    });
  }
}

/**
 * PATCH /pagos-proveedores/:id
 */
async function actualizarCuenta(req, res) {
  try {
    const { estado, saldoPendiente, notas } = req.body;
    if (!estado && saldoPendiente === undefined && notas === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Debe enviar al menos un campo para actualizar'
      });
    }

    const cuenta = await pagosProveedoresService.actualizarCuenta(req.params.id, {
      estado,
      saldoPendiente,
      notas
    });

    res.json({
      success: true,
      data: cuenta
    });
  } catch (error) {
    console.error('❌ Error actualizando cuenta por pagar:', error);
    res.status(500).json({
      success: false,
      message: 'Error actualizando cuenta por pagar',
      error: error.message
    });
  }
}

module.exports = {
  listarCuentas,
  listarProveedoresConCuentas,
  actualizarCuenta
};
