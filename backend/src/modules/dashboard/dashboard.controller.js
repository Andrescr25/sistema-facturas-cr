/**
 * Dashboard - Controller
 */

const service = require('./dashboard.service');
const excel = require('./dashboard.excel');
const { enviarExcel } = require('../../utils/exportarExcel');

async function exportar(req, res) {
  try { return enviarExcel(res, await excel.exportar()); }
  catch (error) { res.status(500).json({ success: false, error: 'No se pudo exportar el resumen.' }); }
}

async function resumen(req, res) {
  try {
    res.json({ success: true, data: await service.resumen() });
  } catch (error) {
    console.error('Error armando el resumen del dashboard:', error.message);
    res.status(500).json({ success: false, error: 'No se pudo cargar el resumen.' });
  }
}

module.exports = { resumen, exportar };
