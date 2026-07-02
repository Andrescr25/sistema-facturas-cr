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
      const { fecha_inicio } = req.query;
      const result = await this.reportService.getMissingItemsBySupplier(fecha_inicio);

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Reporte generado', 200, {
          total_proveedores: result.total_proveedores,
          resumen: result.resumen
        });
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
        return ResponseHelper.success(res, result.data, 'Reporte generado', 200, {
          total_clientes: result.total_clientes,
          resumen: result.resumen
        });
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

  getEncargosEspeciales = async (req, res) => {
    try {
      const result = await this.reportService.getEncargosEspeciales();

      if (result.success) {
        return ResponseHelper.success(res, result.data, 'Encargos especiales obtenidos');
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
