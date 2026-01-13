/**
 * Admin Module - Controller
 * Controladores HTTP para operaciones administrativas
 */

const adminService = require('./admin.service');

/**
 * GET /test-simple
 * Test simple de conexión
 */
async function testSimple(req, res) {
  try {
    const result = await adminService.testSimpleConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * GET /database
 * Información detallada de la base de datos
 */
async function databaseInfo(req, res) {
  try {
    const result = await adminService.getDatabaseInfo();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      message: 'Error en debug de base de datos'
    });
  }
}

module.exports = {
  testSimple,
  databaseInfo
};
