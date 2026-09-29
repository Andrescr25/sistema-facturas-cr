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

// ==================== WHATSAPP (adentro del sistema) ====================

const whatsapp = require('../../integrations/whatsapp');
const { validarTelefonoEscrito } = require('../../utils/telefonosCliente');

function responderWhatsApp(res, error) {
  const status = error.status || 500;
  if (status >= 500) console.error('WhatsApp (Configuración):', error.message);
  res.status(status).json({ success: false, message: error.message, codigo: error.codigo || null });
}

/** GET /api/admin/whatsapp — cómo está la conexión, y por dónde salen los mensajes. */
async function estadoWhatsApp(req, res) {
  const e = whatsapp.estado();
  res.json({
    success: true,
    data: {
      ...e,
      evolutionConfigurado: Boolean(process.env.WHATSAPP_API_URL),
      saleLoPor: e.conectado ? 'interno' : (process.env.WHATSAPP_API_URL ? 'evolution' : 'ninguno')
    }
  });
}

/**
 * POST /api/admin/whatsapp/vincular
 *   { modo: 'qr' }               → { qr }: el texto del QR para escanear
 *   { modo: 'codigo', telefono } → { codigo, telefono }: 8 caracteres
 */
async function vincularWhatsApp(req, res) {
  try {
    if ((req.body?.modo || 'qr') === 'qr') {
      const { qr } = await whatsapp.vincular({ modo: 'qr' });
      return res.json({ success: true, data: { qr } });
    }
    const revision = validarTelefonoEscrito(req.body?.telefono);
    if (!revision.valido) return res.status(400).json({ success: false, message: revision.motivo });
    if (!revision.esMovil) {
      return res.status(400).json({ success: false, message: `${revision.formateado} es un teléfono fijo: tiene que ser el celular que tiene el WhatsApp.` });
    }
    const codigo = await whatsapp.vincular({ modo: 'codigo', numero: revision.numero });
    res.json({ success: true, data: { codigo, telefono: revision.formateado } });
  } catch (error) {
    responderWhatsApp(res, error);
  }
}

/** POST /api/admin/whatsapp/desvincular */
async function desvincularWhatsApp(req, res) {
  try {
    await whatsapp.desvincular();
    res.json({ success: true });
  } catch (error) {
    responderWhatsApp(res, error);
  }
}

module.exports = {
  testSimple,
  databaseInfo,
  estadoWhatsApp,
  vincularWhatsApp,
  desvincularWhatsApp
};
