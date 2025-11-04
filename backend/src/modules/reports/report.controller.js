/**
 * Controlador de Reportes
 */

const ReportService = require('./report.service');
const ResponseHelper = require('../../utils/response.helper');

class ReportController {
  constructor() {
    this.reportService = new ReportService();
  }

  getMissingItemsBySupplier = async (req, res) => {
    try {
      const result = await this.reportService.getMissingItemsBySupplier();

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Reporte generado');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  getMissingItemsByClient = async (req, res) => {
    try {
      const result = await this.reportService.getMissingItemsByClient();

      if (result.success) {
        return ResponseHelper.success(res, {
          data: result.data,
          total_clientes: result.total_clientes,
          resumen: result.resumen
        }, 'Reporte generado');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  clearProcessedSupplierMissingItems = async (req, res) => {
    try {
      const result = await this.reportService.clearProcessedSupplierMissingItems();

      if (result.success) {
        return ResponseHelper.success(res, { eliminados: result.eliminados }, result.message);
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  getProcessingHistory = async (req, res) => {
    try {
      const result = await this.reportService.getProcessingHistory();

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Historial obtenido');
      }

      return ResponseHelper.error(res, result.error, 400);
    } catch (error) {
      return ResponseHelper.error(res, error.message, 500);
    }
  };
}

module.exports = ReportController;
