/**
 * Cuentas por Cobrar - Controller
 */

const service = require('./cuentas-por-cobrar.service');

/**
 * GET /cuentas-por-cobrar
 */
async function listar(req, res) {
  try {
    const { estado, cliente, search, dias, diasMin, diasMax, soloVencidas } = req.query;
    const result = await service.listarCuentasPorCobrar({ estado, cliente, search, dias, diasMin, diasMax, soloVencidas });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Error listando cuentas por cobrar:', error);
    res.status(error.status || 500).json({ success: false, message: error.message, error: error.message });
  }
}

/**
 * GET /cuentas-por-cobrar/facturas/:alegraId/abonos
 */
async function getAbonos(req, res) {
  try {
    const { alegraId } = req.params;
    const abonos = await service.getAbonosPorFactura(alegraId);
    res.json({ success: true, data: abonos });
  } catch (error) {
    console.error('❌ Error obteniendo abonos:', error);
    res.status(error.status || 500).json({ success: false, message: error.message, error: error.message });
  }
}

/**
 * POST /cuentas-por-cobrar/abonos
 */
async function registrarAbono(req, res) {
  try {
    const { alegraInvoiceId, monto, fecha, metodoPago } = req.body;
    const result = await service.registrarAbono({ alegraInvoiceId, monto, fecha, metodoPago });
    res.status(201).json({ success: true, data: result, message: 'Abono registrado exitosamente' });
  } catch (error) {
    console.error('❌ Error registrando abono:', error);
    res.status(error.status || 500).json({ success: false, message: error.message, error: error.message });
  }
}

/**
 * POST /cuentas-por-cobrar/sync
 */
async function sincronizar(req, res) {
  try {
    const result = await service.sincronizarDesdeAlegra();
    res.json({ success: true, data: result, message: 'Sincronización completada' });
  } catch (error) {
    console.error('❌ Error sincronizando cuentas por cobrar:', error);
    res.status(error.status || 500).json({ success: false, message: error.message, error: error.message });
  }
}

module.exports = {
  listar,
  getAbonos,
  registrarAbono,
  sincronizar
};
